import assert from 'node:assert/strict';
import { CONCURRENCY_CASES, EVIDENCE_ROOT, EXPECTED_TARGET, FIXTURES, MIGRATIONS, REQUIRED_HASH_PATHS, RUN_ID, type ExecutionAuthorization, type PreflightObservation } from './contract.ts';
import { runAuthorizedCommand, SyntheticExecutor, type EvidenceSink } from './orchestrator.ts';
import { fixtureDigest } from './preflight.ts';
import { validatePostgresConcurrencyEvidence, type ConcurrencyEvidence } from './concurrency-evidence.ts';
import { formatEvidence } from './evidence.ts';
import { parseProcessEnvelope } from './process-output.ts';
import { parseMutationAcknowledgement, splitAdvisoryLockKey } from './runner-contract.ts';
import { assertPendingIdentityResponse } from './identity-response.ts';
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
assert.equal(fixtureDigest(), 'a408665f5617077aeed496fe004a13beeeda089f943a80e98501369083eccf14');
assert(CONCURRENCY_CASES.includes('RESERVATION_REVOCATION_RESERVATION_FIRST'));
assert(CONCURRENCY_CASES.includes('RESERVATION_REVOCATION_REVOCATION_FIRST'));
assert.equal(MIGRATIONS['supabase/migrations/20261026000033_owner_identity_recovery_linearization_v1.sql'], '1065386b66fcc3b03b4a9e3026869b6aee4ebeeea6c572ead9d7e3ac0ec8477f');
assert.equal(MIGRATIONS['supabase/migrations/20261026000034_owner_identity_issue_principal_binding_v1.sql'], '3ed6fa4aa1a0fc85d52df0bbdd644095c40f301e357630ff9d304b5fec07582b');
assert(REQUIRED_HASH_PATHS.includes('scripts/acceptance/i3a/sql/26_identity_phase_assertions.sql'));

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
    { name: 'B', backendPid: 12, applicationName: 'pf:B', readyCommittedAt: '2026-10-26T12:00:00Z', enteredCriticalAt: '2026-10-26T12:00:02Z', leftCriticalAt: '2026-10-26T12:00:04Z', outcome: 'CONFLICT', authoritativeEffectCount: 0 },
  ], expectedOutcomes: ['APPLIED', 'CONFLICT'], expectedOutcomeEffectCounts: { APPLIED: 1, CONFLICT: 0 },
  expectedFinalEffectCount: 1, finalAuthoritativeEffectCount: 1, finalStateInvariant: true, cancellation: 'NOT_REQUIRED',
};
assert.doesNotThrow(() => validatePostgresConcurrencyEvidence(baseConcurrency));
for (const invalid of [
  { ...baseConcurrency, classification: 'SYNTHETIC_ONLY' },
  { ...baseConcurrency, observedWaiterBlockers: [99] },
  { ...baseConcurrency, expectedLock: { lockType: 'table', classId: 314159, objectId: 271828 } },
  { ...baseConcurrency, sessions: [baseConcurrency.sessions[0], { ...baseConcurrency.sessions[1], backendPid: 11 }] },
  { ...baseConcurrency, sessions: [baseConcurrency.sessions[0], { ...baseConcurrency.sessions[1], enteredCriticalAt: '2026-10-26T12:00:04Z', leftCriticalAt: '2026-10-26T12:00:05Z' }] },
  { ...baseConcurrency, sessions: [baseConcurrency.sessions[0], { ...baseConcurrency.sessions[1], authoritativeEffectCount: 1 }] },
  { ...baseConcurrency, finalAuthoritativeEffectCount: 0 },
  { ...baseConcurrency, finalStateInvariant: false },
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

for (const [key, expected] of [
  [0n, { classId: 0, objectId: 0 }],
  [1n, { classId: 0, objectId: 1 }],
  [4_294_967_295n, { classId: 0, objectId: 4_294_967_295 }],
  [4_294_967_296n, { classId: 1, objectId: 0 }],
  [9_223_372_036_854_775_807n, { classId: 2_147_483_647, objectId: 4_294_967_295 }],
  [-1n, { classId: 4_294_967_295, objectId: 4_294_967_295 }],
  [-4_294_967_296n, { classId: 4_294_967_295, objectId: 0 }],
  [-9_223_372_036_854_775_808n, { classId: 2_147_483_648, objectId: 0 }],
] as const) assert.deepEqual(splitAdvisoryLockKey(key), expected);
for (const outside of [9_223_372_036_854_775_808n, -9_223_372_036_854_775_809n]) assert.throws(() => splitAdvisoryLockKey(outside));
assert.equal(parseMutationAcknowledgement('COORDINATOR_OBSERVED|2', 'COORDINATOR_OBSERVED', 2), 2);
for (const unexpected of ['COORDINATOR_OBSERVED|0','COORDINATOR_OBSERVED|1','COORDINATOR_OBSERVED|3','WRONG_TAG|2','COORDINATOR_OBSERVED|2|EXTRA',''])
  assert.throws(() => parseMutationAcknowledgement(unexpected, 'COORDINATOR_OBSERVED', 2));
assert.equal(frameCommandField('薬局'), '6:薬局');
assert.equal(await commandFingerprint(['café','薬局','10000000-0000-4000-8000-000000000001']), 'a62e4f43c1ca44705e5dce925f61f08b23990bea6280f3526eaefe1c1ea3232e');
assert.equal(await commandFingerprint(['café',null,'10000000-0000-4000-8000-000000000001']), '3c3e4ed13b76fd97cbddf4193784c9febf795cb5aef8b1f9d88c654f9975ea8b');

const pendingExpected = {
  operationId: '20000000-0000-4000-8000-000000000703', principalId: 'i3a-gateway-0001',
  applicantKey: FIXTURES.applicantA, pharmacyContextId: FIXTURES.contextA,
  originalCredentialVersion: 1, commandFingerprint: 'a'.repeat(64),
  providerOperationId: '50000000-0000-4000-8000-000000000703',
};
const validPendingResponse = {
  state: 'PROVIDER_PENDING', result: null, original_credential_version: 1,
  original_identity: {
    operation_id: pendingExpected.operationId, action: 'IDENTITY_ISSUE', principal_id: pendingExpected.principalId,
    applicant_key: pendingExpected.applicantKey, pharmacy_context_id: pendingExpected.pharmacyContextId,
    command_fingerprint: pendingExpected.commandFingerprint,
  },
  authoritative_command: { provider_operation_id: pendingExpected.providerOperationId },
};
assert.doesNotThrow(() => assertPendingIdentityResponse(validPendingResponse, pendingExpected));
const without = (value: Record<string, unknown>, key: string): Record<string, unknown> => { const copy = { ...value }; delete copy[key]; return copy; };
const invalidPendingResponses: unknown[] = [
  undefined, null, [], {}, without(validPendingResponse, 'state'),
  { ...validPendingResponse, state: null }, { ...validPendingResponse, state: 1 }, { ...validPendingResponse, state: 'WRONG' },
  without(validPendingResponse, 'result'), { ...validPendingResponse, result: {} },
  without(validPendingResponse, 'original_credential_version'), { ...validPendingResponse, original_credential_version: null },
  { ...validPendingResponse, original_credential_version: '1' }, { ...validPendingResponse, original_credential_version: 2 },
  without(validPendingResponse, 'original_identity'), { ...validPendingResponse, original_identity: null }, { ...validPendingResponse, original_identity: [] },
  { ...validPendingResponse, original_identity: { ...validPendingResponse.original_identity, principal_id: null } },
  { ...validPendingResponse, original_identity: { ...validPendingResponse.original_identity, principal_id: 'wrong' } },
  { ...validPendingResponse, original_identity: { ...validPendingResponse.original_identity, command_fingerprint: 1 } },
  without(validPendingResponse, 'authoritative_command'), { ...validPendingResponse, authoritative_command: null },
  { ...validPendingResponse, authoritative_command: {} },
  { ...validPendingResponse, authoritative_command: { provider_operation_id: null } },
  { ...validPendingResponse, authoritative_command: { provider_operation_id: 1 } },
  { ...validPendingResponse, authoritative_command: { provider_operation_id: '50000000-0000-4000-8000-000000000799' } },
];
for (const invalid of invalidPendingResponses)
  assert.throws(() => assertPendingIdentityResponse(invalid, pendingExpected), /ASSERT_IDENTITY_RESPONSE:/);

const errorRecords: unknown[] = [];
await assert.rejects(runAuthorizedCommand(authorization, observation, { async execute() { throw new Error('password=synthetic-error useful=kept'); } }, { async persist(record) { errorRecords.push(record); } }), /synthetic-error/);
const serializedErrors = JSON.stringify(errorRecords);
assert(!serializedErrors.includes('synthetic-error') && serializedErrors.includes('useful=kept'));
console.log(`ACC-01 PF-SUP-17 assertion-closure synthetic tests: passed (${rejectionCases.length} zero-executor preflight rejections; ${invalidPendingResponses.length} malformed identity responses rejected)`);
