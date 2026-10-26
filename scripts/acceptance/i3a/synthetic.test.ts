import assert from 'node:assert/strict';
import { EVIDENCE_ROOT, EXPECTED_TARGET, FIXTURES, MIGRATIONS, REQUIRED_HASH_PATHS, RUN_ID, type ExecutionAuthorization, type PreflightObservation } from './contract.ts';
import { runAuthorizedCommand, SyntheticExecutor, type EvidenceSink } from './orchestrator.ts';
import { fixtureDigest } from './preflight.ts';
import { validatePostgresConcurrencyEvidence, type ConcurrencyEvidence } from './concurrency-evidence.ts';
import { formatEvidence } from './evidence.ts';
import { parseProcessEnvelope } from './process-output.ts';
import { commandFingerprint, frameCommandField } from '../../../supabase/functions/_shared/owner-security-i3.ts';

const hashes = Object.freeze(Object.fromEntries(REQUIRED_HASH_PATHS.map((path, i) => [path,
  path in MIGRATIONS ? MIGRATIONS[path as keyof typeof MIGRATIONS] : (i % 16).toString(16).repeat(64),
]))) as Readonly<Record<string, string>>;
const authorization: ExecutionAuthorization = {
  authorizationId: 'OWNER-I3A-EXEC-EXAMPLE', status: 'AUTHORIZED', scope: 'I3A_DISPOSABLE_POSTGRES_ACCEPTANCE',
  target: { ...EXPECTED_TARGET, systemIdentifier: '1234567890123456789', databaseOid: 16384 },
  connection: { psqlPath: 'C:\\approved\\psql.exe', psqlSha256: 'a'.repeat(64), credentialFilePath: 'C:\\approved\\pgpass.conf', connectTimeoutSeconds: 5 },
  runId: RUN_ID, evidenceRoot: EVIDENCE_ROOT, allowedCommands: ['postgres-assertions'],
  commandPermissions: { 'postgres-assertions': { readOnlyAndRollbackAssertions: true } },
  fixtures: FIXTURES, fixturesDigest: fixtureDigest(), approvedHashes: hashes, packageManifestSha256: 'c'.repeat(64),
  providerAuthBrowserEnabled: false, expiresAt: '2026-10-27T00:00:00.000Z',
};
const observation: PreflightObservation = { now: '2026-10-26T12:00:00.000Z', hashes, packageManifestSha256: 'c'.repeat(64), command: 'postgres-assertions', evidenceRoot: EVIDENCE_ROOT };

const recorded: unknown[] = [];
const sink: EvidenceSink = { async persist(record) { recorded.push(record); } };
const executor = new SyntheticExecutor();
assert.deepEqual(await runAuthorizedCommand(authorization, observation, executor, sink), { classification: 'SYNTHETIC_ONLY', command: 'postgres-assertions', externalCalls: 0 });
assert.deepEqual(executor.calls, ['postgres-assertions']);
assert.equal(recorded.length, 1);

const missingHash = { ...hashes }; delete missingHash[REQUIRED_HASH_PATHS[0]];
const extraHash = { ...hashes, 'unapproved/extra.sql': 'f'.repeat(64) };
const overriddenMigration = { ...hashes, [Object.keys(MIGRATIONS)[0]]: 'f'.repeat(64) };
const rejectionCases: Array<[unknown, PreflightObservation]> = [
  [null, observation],
  [{ ...authorization, status: 'DRAFT' }, observation],
  [{ ...authorization, target: { ...authorization.target, host: 'localhost' } }, observation],
  [{ ...authorization, target: { ...authorization.target, systemIdentifier: '' } }, observation],
  [{ ...authorization, connection: { ...authorization.connection, connectTimeoutSeconds: 6 } }, observation],
  [{ ...authorization, fixtures: { ...FIXTURES, applicantEmailB: 'changed@example.invalid' } }, observation],
  [{ ...authorization, fixturesDigest: 'd'.repeat(64) }, observation],
  [{ ...authorization, commandPermissions: { 'postgres-assertions': { readOnlyAndRollbackAssertions: true, fixtureWrite: true } } }, observation],
  [{ ...authorization, allowedCommands: ['postgres-assertions', 'postgres-assertions'] }, observation],
  [{ ...authorization, packageManifestSha256: 'd'.repeat(64) }, observation],
  [{ ...authorization, approvedHashes: missingHash }, { ...observation, hashes: missingHash }],
  [{ ...authorization, approvedHashes: extraHash }, { ...observation, hashes: extraHash }],
  [{ ...authorization, approvedHashes: overriddenMigration }, { ...observation, hashes: overriddenMigration }],
  [{ ...authorization, providerAuthBrowserEnabled: true }, observation],
  [{ ...authorization, expiresAt: observation.now }, observation],
  [authorization, { ...observation, command: 'fixture-cleanup' }],
];
for (const [badAuth, badObservation] of rejectionCases) {
  const blocked = new SyntheticExecutor();
  await assert.rejects(runAuthorizedCommand(badAuth, badObservation, blocked), /ABORT:/);
  assert.equal(blocked.calls.length, 0, 'all preflight findings reject before executor access');
}

const baseConcurrency: ConcurrencyEvidence = {
  classification: 'POSTGRESQL_EXECUTED', runId: RUN_ID, caseId: 'OPERATION_COLLISION_PENDING_FIRST', barrierNonce: 'barrier-12345678', boundedWaitMs: 1000,
  expectedLock: { lockType: 'application_advisory', classId: 314159, objectId: 271828 }, observedBlockerPid: 11, observedWaiterPid: 12, observedWaiterBlockers: [11],
  sessions: [
    { name: 'A', backendPid: 11, applicationName: 'pf:A', readyCommittedAt: '2026-10-26T12:00:00Z', enteredCriticalAt: '2026-10-26T12:00:01Z', leftCriticalAt: '2026-10-26T12:00:03Z', outcome: 'APPLIED', authoritativeEffectCount: 1 },
    { name: 'B', backendPid: 12, applicationName: 'pf:B', readyCommittedAt: '2026-10-26T12:00:00Z', enteredCriticalAt: '2026-10-26T12:00:02Z', leftCriticalAt: '2026-10-26T12:00:04Z', outcome: 'CONFLICT', authoritativeEffectCount: 1 },
  ], expectedOutcomes: ['APPLIED', 'CONFLICT'], expectedEffectCount: 1, cancellation: 'NOT_REQUIRED',
};
assert.doesNotThrow(() => validatePostgresConcurrencyEvidence(baseConcurrency));
for (const invalid of [
  { ...baseConcurrency, classification: 'SYNTHETIC_ONLY' },
  { ...baseConcurrency, observedWaiterBlockers: [99] },
  { ...baseConcurrency, expectedLock: { lockType: 'table', classId: 314159, objectId: 271828 } },
  { ...baseConcurrency, sessions: [baseConcurrency.sessions[0], { ...baseConcurrency.sessions[1], backendPid: 11 }] },
  { ...baseConcurrency, sessions: [baseConcurrency.sessions[0], { ...baseConcurrency.sessions[1], enteredCriticalAt: '2026-10-26T12:00:04Z', leftCriticalAt: '2026-10-26T12:00:05Z' }] },
  { ...baseConcurrency, cancellation: 'REQUESTED' },
]) assert.throws(() => validatePostgresConcurrencyEvidence(invalid as ConcurrencyEvidence));

const evidence = formatEvidence('AUTHORITY_CURRENT_VERSION_ACTION', {
  token: 'synthetic-token', password: 'synthetic-password', nested: { AuthorizationHeader: 'Bearer synthetic', items: [{ api_token: 'array-secret' }] },
  quotedJson: '{"clientSecret":"quoted-secret","useful":"kept-json"}',
  message: 'failure password=hunter2 postgres://user:pass@127.0.0.1/db eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature diagnostic=kept',
}, '2026-10-26T12:00:00Z');
for (const secret of ['synthetic-token','synthetic-password','array-secret','quoted-secret','hunter2','user:pass','eyJhbGci']) assert(!evidence.includes(secret));
assert(evidence.includes('diagnostic=kept') && evidence.includes('[REDACTED]'));

const framed = 'PF_I3A_RESULT=' + JSON.stringify({ schema: 'pharmacyflow-i3a-process-v1', kind: 'target-proof', payload: { marker: 'expected' } });
assert.deepEqual(parseProcessEnvelope({ exitCode: 0, stdout: framed, stderr: 'NOTICE: synthetic diagnostic' }, 'target-proof'), {
  envelope: { schema: 'pharmacyflow-i3a-process-v1', kind: 'target-proof', payload: { marker: 'expected' } }, diagnostics: 'NOTICE: synthetic diagnostic',
});
for (const malformed of [
  { exitCode: 0, stdout: '', stderr: '' },
  { exitCode: 0, stdout: `${framed}\n${framed}`, stderr: '' },
  { exitCode: 0, stdout: `COMMAND TAG\n${framed}`, stderr: '' },
  { exitCode: 0, stdout: 'PF_I3A_RESULT={bad', stderr: '' },
  { exitCode: 1, stdout: framed, stderr: 'synthetic failure' },
]) assert.throws(() => parseProcessEnvelope(malformed, 'target-proof'));
assert.equal(frameCommandField('薬局'), '6:薬局');
assert.equal(await commandFingerprint(['café','薬局','10000000-0000-4000-8000-000000000001']), 'a62e4f43c1ca44705e5dce925f61f08b23990bea6280f3526eaefe1c1ea3232e');
assert.equal(await commandFingerprint(['café',null,'10000000-0000-4000-8000-000000000001']), '3c3e4ed13b76fd97cbddf4193784c9febf795cb5aef8b1f9d88c654f9975ea8b');

const errorRecords: unknown[] = [];
await assert.rejects(runAuthorizedCommand(authorization, observation, { async execute() { throw new Error('password=synthetic-error useful=kept'); } }, { async persist(record) { errorRecords.push(record); } }), /synthetic-error/);
const serializedErrors = JSON.stringify(errorRecords);
assert(!serializedErrors.includes('synthetic-error') && serializedErrors.includes('useful=kept'));
console.log(`ACC-01 PF-SUP-10 execution-fidelity synthetic tests: passed (${rejectionCases.length} zero-executor preflight rejections; separated stream regressions passed)`);
