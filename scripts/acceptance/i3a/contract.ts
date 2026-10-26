export const EXPECTED_TARGET = Object.freeze({
  projectId: 'pharmacyflow-i3a-acceptance-20261026',
  marker: 'pharmacyflow-i3a-acceptance-20261026',
  host: '127.0.0.1',
  port: 57322,
  database: 'postgres',
  user: 'postgres',
  sslMode: 'disable',
});

export const EVIDENCE_ROOT = 'C:\\Users\\Flourish\\AppData\\Local\\Temp\\pharmacyflow-i3a-acceptance-20261026-evidence';
export const RUN_ID = 'I3A-20261026-001';

export const FIXTURES = Object.freeze({
  gateway: 'i3a-gateway-0001', gatewayVersion: 1,
  gatewayRotated: 'i3a-gateway-0001', gatewayRotatedVersion: 2,
  gatewayOther: 'i3a-gateway-0002', gatewayOtherVersion: 1,
  operator: 'i3a-operator-0001', operatorVersion: 1,
  operatorUnderprivileged: 'i3a-operator-none-0001', operatorUnderprivilegedVersion: 1,
  applicantA: 'c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf',
  applicantB: '0f46f0ba6b7213ccafdfd4a8245a5b323735e7970e69f67cdbf0a3ab00633d29',
  applicantEmailA: 'owner.i3a.001@example.invalid', applicantEmailB: 'owner.i3a.002@example.invalid',
  contextA: '10000000-0000-4000-8000-000000000001', contextB: '10000000-0000-4000-8000-000000000002',
  operationPrefix: '20000000-0000-4000-8000-', requestPrefix: '30000000-0000-4000-8000-',
  decisionPrefix: '40000000-0000-4000-8000-', providerPrefix: '50000000-0000-4000-8000-',
  subjectPrefix: '60000000-0000-4000-8000-',
});

export const MIGRATIONS = Object.freeze({
  'supabase/migrations/20261025000027_owner_onboarding_v1.sql': 'd2e66b3560cda174e062b8f8b8810c57429c3b4680b59b2a6a8e20aea965da6c',
  'supabase/migrations/20261025000028_owner_eligibility_issuer_v1.sql': 'cb9e0ceb134d430e2d7fb8ac3812d3f243eb2660e3e655a3a8608c50a54c4445',
  'supabase/migrations/20261025000029_owner_eligibility_recovery_v1.sql': '3973ba51139a4ccfef03aca80e9231b0465738937de0af97f60bd2e425bcfb9e',
  'supabase/migrations/20261026000030_owner_gateway_operator_contract_v1.sql': 'e6b5ee258573eab85e8913601fd64eeff97c3a1f59d497369cdc847cab8cae54',
  'supabase/migrations/20261026000031_owner_gateway_operator_correction_v1.sql': '9e2a85990b85ec73746f3114d3b798a61135b42072c22558a4fa51c9ce4cba6e',
  'supabase/migrations/20261026000032_owner_gateway_boundary_parity_v1.sql': '448384e6981c66ac0090716eb1322e45f90a2464440cbe7170380c91cdbb66da',
});

export const REQUIRED_SOURCE_PATHS = Object.freeze([
  'supabase/functions/_shared/owner-security-i3.ts',
  'scripts/acceptance/i3a/contract.ts', 'scripts/acceptance/i3a/preflight.ts',
  'scripts/acceptance/i3a/orchestrator.ts', 'scripts/acceptance/i3a/evidence.ts',
  'scripts/acceptance/i3a/process-output.ts', 'scripts/acceptance/i3a/concurrency-evidence.ts',
  'scripts/acceptance/i3a/preflight.ps1', 'scripts/acceptance/i3a/evidence.ps1',
  'scripts/acceptance/i3a/process-output.ps1', 'scripts/acceptance/i3a/executor.ps1',
  'scripts/acceptance/i3a/process-output.test.ps1',
  'scripts/acceptance/i3a/concurrency-runner.ps1', 'scripts/acceptance/i3a/scenarios.ps1',
  'scripts/acceptance/i3a/sql/00_guard.sql', 'scripts/acceptance/i3a/sql/01_target_proof.sql',
  'scripts/acceptance/i3a/sql/10_fixture.sql', 'scripts/acceptance/i3a/sql/20_acl_rls_assertions.sql',
  'scripts/acceptance/i3a/sql/21_role_dml_denial.sql', 'scripts/acceptance/i3a/sql/22_authority_assertions.sql',
  'scripts/acceptance/i3a/sql/23_operation_recovery_assertions.sql',
  'scripts/acceptance/i3a/sql/24_atomic_replay_assertions.sql',
  'scripts/acceptance/i3a/sql/25_lifecycle_recovery_assertions.sql',
  'scripts/acceptance/i3a/sql/40_concurrency_scenarios.sql', 'scripts/acceptance/i3a/sql/90_cleanup.sql',
] as const);
export const REQUIRED_HASH_PATHS = Object.freeze([...REQUIRED_SOURCE_PATHS, ...Object.keys(MIGRATIONS)]);

export const COMMANDS = Object.freeze(['postgres-fixture', 'postgres-assertions', 'postgres-concurrency', 'fixture-cleanup'] as const);
export type CommandName = (typeof COMMANDS)[number];
export const CONCURRENCY_CASES = Object.freeze([
  'OPERATION_COLLISION_PENDING_FIRST', 'OPERATION_COLLISION_COMPLETED_FIRST',
  'DURABLE_PENDING_RECOVERY', 'RESERVATION_REVOCATION', 'CONSUMPTION_REVOCATION',
] as const);
export type ConcurrencyCase = (typeof CONCURRENCY_CASES)[number];

export interface CommandPermission {
  fixtureWrite?: true;
  readOnlyAndRollbackAssertions?: true;
  concurrentFixtureWrite?: true;
  cancellationAndRollbackVerification?: true;
  fixtureCleanup?: true;
  environmentDestruction?: false;
}
export type FileHashes = Readonly<Record<string, string>>;
export interface ExecutionAuthorization {
  authorizationId: string; status: 'AUTHORIZED'; scope: 'I3A_DISPOSABLE_POSTGRES_ACCEPTANCE';
  target: typeof EXPECTED_TARGET & { systemIdentifier: string; databaseOid: number };
  connection: { psqlPath: string; psqlSha256: string; credentialFilePath: string; connectTimeoutSeconds: 5 };
  runId: typeof RUN_ID; evidenceRoot: typeof EVIDENCE_ROOT;
  allowedCommands: readonly CommandName[];
  commandPermissions: Partial<Record<CommandName, CommandPermission>>;
  fixtures: typeof FIXTURES; fixturesDigest: string;
  approvedHashes: FileHashes; packageManifestSha256: string;
  providerAuthBrowserEnabled: false; expiresAt: string;
}
export interface PreflightObservation {
  now: string; hashes: FileHashes; packageManifestSha256: string;
  command: CommandName; evidenceRoot: string;
}
