import { createHash } from 'node:crypto';
import { COMMANDS, EVIDENCE_ROOT, EXPECTED_TARGET, FIXTURES, MIGRATIONS, REQUIRED_HASH_PATHS, RUN_ID,
  type CommandName, type ExecutionAuthorization, type PreflightObservation } from './contract.ts';

const SHA256 = /^[0-9a-f]{64}$/;
const canonical = (value: unknown): string => value && typeof value === 'object'
  ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  : JSON.stringify(value);
const exact = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);
export const fixtureDigest = (): string => createHash('sha256').update(canonical(FIXTURES), 'utf8').digest('hex');

function validateCommandPermission(a: ExecutionAuthorization, command: CommandName): void {
  const keys = Object.keys(a.commandPermissions ?? {}).sort();
  const allowed = [...a.allowedCommands].sort();
  if (!exact(keys, allowed)) throw new Error('ABORT: command permission inventory differs from the narrow command grant.');
  const p = a.commandPermissions[command];
  const valid = command === 'postgres-fixture' ? exact(p, { fixtureWrite: true })
    : command === 'postgres-assertions' ? exact(p, { readOnlyAndRollbackAssertions: true })
    : command === 'postgres-concurrency' ? exact(p, { concurrentFixtureWrite: true, cancellationAndRollbackVerification: true })
    : exact(p, { fixtureCleanup: true, environmentDestruction: false });
  if (!valid) throw new Error(`ABORT: exact permission for ${command} is absent or overbroad.`);
}

export function validatePreflight(auth: unknown, observed: PreflightObservation): ExecutionAuthorization {
  if (!auth || typeof auth !== 'object') throw new Error('ABORT: explicit execution authorization is required before external access.');
  const a = auth as ExecutionAuthorization;
  if (a.status !== 'AUTHORIZED' || a.scope !== 'I3A_DISPOSABLE_POSTGRES_ACCEPTANCE' || !a.authorizationId?.trim())
    throw new Error('ABORT: execution authorization scope/status is missing or invalid.');
  const pinnedTarget = { ...EXPECTED_TARGET, systemIdentifier: a.target?.systemIdentifier, databaseOid: a.target?.databaseOid };
  if (!exact(a.target, pinnedTarget) || !/^[1-9][0-9]{5,29}$/.test(a.target.systemIdentifier)
    || !Number.isInteger(a.target.databaseOid) || a.target.databaseOid < 1)
    throw new Error('ABORT: exact loopback target and verifiable database identity proof are required.');
  if (!a.connection || !/^[A-Za-z]:\\.+\.exe$/i.test(a.connection.psqlPath) || !SHA256.test(a.connection.psqlSha256)
    || !/^[A-Za-z]:\\.+/.test(a.connection.credentialFilePath) || a.connection.connectTimeoutSeconds !== 5)
    throw new Error('ABORT: pinned psql and credential-delivery configuration is incomplete.');
  if (a.runId !== RUN_ID || a.evidenceRoot !== EVIDENCE_ROOT || observed.evidenceRoot !== EVIDENCE_ROOT)
    throw new Error('ABORT: run or evidence scope mismatch.');
  if (!exact(a.fixtures, FIXTURES) || a.fixturesDigest !== fixtureDigest()) throw new Error('ABORT: complete fixture contract or digest mismatch.');
  if (!Array.isArray(a.allowedCommands) || a.allowedCommands.length < 1
    || new Set(a.allowedCommands).size !== a.allowedCommands.length || a.allowedCommands.some(c => !COMMANDS.includes(c))
    || !a.allowedCommands.includes(observed.command)) throw new Error('ABORT: command is not narrowly authorized.');
  validateCommandPermission(a, observed.command);
  if (a.providerAuthBrowserEnabled !== false) throw new Error('ABORT: provider/Auth/browser stages must remain disabled.');
  const expires = Date.parse(a.expiresAt), now = Date.parse(observed.now);
  if (!Number.isFinite(expires) || !Number.isFinite(now) || now >= expires) throw new Error('ABORT: authorization is expired or time is invalid.');
  if (!SHA256.test(a.packageManifestSha256) || a.packageManifestSha256 !== observed.packageManifestSha256)
    throw new Error('ABORT: package manifest hash mismatch.');
  const required = [...REQUIRED_HASH_PATHS].sort();
  if (!exact(Object.keys(observed.hashes).sort(), required) || !exact(Object.keys(a.approvedHashes ?? {}).sort(), required))
    throw new Error('ABORT: complete source/runner/migration hash inventory is missing, extra, or overridden.');
  for (const path of required) {
    const observedDigest = observed.hashes[path];
    if (!SHA256.test(observedDigest) || a.approvedHashes[path] !== observedDigest) throw new Error(`ABORT: pinned hash mismatch for ${path}.`);
    if (path in MIGRATIONS && MIGRATIONS[path as keyof typeof MIGRATIONS] !== observedDigest)
      throw new Error(`ABORT: sealed migration hash override for ${path}.`);
  }
  return Object.freeze(a);
}

