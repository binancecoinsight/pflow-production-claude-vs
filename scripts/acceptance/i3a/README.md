# PharmacyFlow I3A acceptance preparation — ACC-01 correction

Status: **local sources only; protected execution NOT authorized**. Baseline attribution: owner-supplied `PF-SUP-2026-10-26-08` findings. This package cannot authorize itself.

## Destination and connection boundary

Future executors use only explicit libpq arguments: `-h 127.0.0.1 -p 57322 -d postgres -U postgres -X --no-password`. Service aliases are prohibited. Before invocation, ambient `PGHOST`, `PGHOSTADDR`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSERVICE`, `PGSERVICEFILE`, `PGOPTIONS`, `PGAPPNAME`, `PGPASSWORD`, `PGCHANNELBINDING` and `PGTARGETSESSIONATTRS` are removed. The authorization must pin the absolute `psql.exe` path/hash and an absolute ephemeral `PGPASSFILE` delivery path; the harness never reads credential contents.

Before any fixture/schema access, `01_target_proof.sql` performs a read-only proof and the executor compares all fields: pre-existing `pharmacyflow.acceptance_target_id`, PostgreSQL system identifier, database OID/name, loopback server address/port and session user. Every writable SQL file repeats that proof through `00_guard.sql`. Missing or mismatched proof aborts. No discovery/enumeration fallback exists.

## Unified preflight

TypeScript and PowerShell enforce the same full fixture values/digest and the same required execution-source/runner/migration path inventory. The authorization hash inventory must have exactly those paths—no missing or extra entries—and every observed file must match its owner-pinned hash. Migrations 000027–000034 also match sealed hashes embedded independently in the TypeScript and PowerShell contracts.

`allowedCommands` is a nonempty subset. Its `commandPermissions` keys must be identical to that subset:

| Command | Exact permission |
|---|---|
| `postgres-fixture` | `fixtureWrite: true` |
| `postgres-assertions` | `readOnlyAndRollbackAssertions: true` |
| `postgres-concurrency` | `concurrentFixtureWrite: true`, `cancellationAndRollbackVerification: true` |
| `fixture-cleanup` | `fixtureCleanup: true`, `environmentDestruction: false` |

Assertion-only authority does not imply fixture creation, cleanup, concurrency or environment destruction.

## Ownership and cleanup

Fixture setup rejects pre-existing harness objects unless their exact comment, ordered columns and primary-key shape match v2. It rejects an existing synthetic authority identity or applicant/context capability scope unless an exact ownership row belongs to this run and both the stored attribute digest and every active/version/action field match. Six explicit disposable scope rows support original-principal and alternate-recovery cases. The four authorities and six scopes are ten separately owned fixture objects. Unknown I3A-like identities or scopes abort. These rows are acceptance fixtures only, not runtime provisioning.

Cleanup requires the exact run/authorization/fixture digest, ten exact ownership records and unchanged authority/scope attributes. It refuses cleanup when an issuance attempt, phase audit, pending/completed claim, immutable security operation, admission/revocation decision, fixture request or unresolved concurrency row exists. It removes owned scope rows before their referenced authorities and deletes only objects owned by this run plus verified rolled-back concurrency evidence. It never drops shared tables, deletes another run, or destroys the database/schema/service/container/volume/profile/evidence directory. Environment destruction remains a separate authorization.

## Concrete database coverage

All SQL below is authored but **NOT RUN**:

| Case | Source | Prepared assertion | Limitation |
|---|---|---|---|
| Exact RPC ACL / forced RLS | `20_acl_rls_assertions.sql` | Exact v4 begin/completion/recovery plus dispatch/resolution/result signatures; PUBLIC/anon/authenticated/service_role/opposite executor; all nine superseded v1/v2/v3 identity signatures closed; scope/audit tables forced RLS | Catalog/role behavior unexecuted |
| Role-specific direct DML denial | `21_role_dml_denial.sql` | SELECT/INSERT/UPDATE/DELETE under five roles | PostgreSQL role execution unexecuted |
| Current authority/version/action/scope | `22_authority_assertions.sql` | current, missing/inactive/wrong-capability/wrong-applicant/wrong-context scope, stale rotation, revoked recovery, underprivileged operator | `request.jwt.claims` is simulated database input, not JWT/Auth acceptance |
| Namespace collision both orderings | `23_operation_recovery_assertions.sql`, fixed concurrency scenarios | Pending-first and completed-first conflict, completed evidence preserved | PostgreSQL triggers/overlap unexecuted |
| Durable pending recovery | `25_lifecycle_recovery_assertions.sql` | v4 begin and v4 recovery use their intended RPCs; exact pending replay is checked | Sequential only; provider-resolution concurrency needs a separately reviewed fixture/outcome contract |
| REV-LIN phase security | `26_identity_phase_assertions.sql` | v4 begin, issue dispatch with same-principal rotation, cross-principal ISSUE denial, scoped alternate resolution/recovery, no-create recovery-only authority, changed-provider conflict and separately attributed append-only audit | Authored rollback-only SQL; PostgreSQL not run |
| Identity response assertion contract | `identity-response.ts`, `26_identity_phase_assertions.sql` | Mandatory typed/exact state, original identity/version and provider-operation binding; SQL/JSON null, missing, wrong-type and wrong-value negatives; present JSON-null pending result accepted | Pure TypeScript negatives passed; SQL source not run |
| Completion replay/audit atomicity after provider result | `26_identity_phase_assertions.sql` classification | Exact intended v4 boundaries are identified | **BLOCKED_AUTH_02**: genuine trusted provider-created subject/marker fixture is required; no direct `auth.users` substitute is authored |
| Audit rollback / exact replay | `24_atomic_replay_assertions.sql` | Injected audit failure leaves no operation/decision/claim; exact result/count replay; changed reason + old hash conflicts | Transaction behavior unexecuted |
| Reservation/revocation | `41_reservation_first_fixture.sql`, `42_revocation_first_fixture.sql`, fixed concurrency scenarios | Both orderings use committed admissions created through the admission RPC, then the actual reserve/revoke RPCs and shared production email lock | Authored; PostgreSQL locks/transitions **NOT RUN** |
| Consumption/revocation | classification only | No direct-row substitute is used | **NOT IMPLEMENTED / Auth-policy blocked**: genuine consumption requires `rpc_create_pharmacy_owner_v1`, confirmed Auth identity and trusted metadata |
| UTF-8/null/UUID parity | `24_atomic_replay_assertions.sql`, `synthetic.test.ts` | Same two hard-coded SHA-256 results in TypeScript and SQL | SQL half unexecuted |
| Confirmed applicant continuation | explicitly marked in `25_lifecycle_recovery_assertions.sql` | — | **NOT IMPLEMENTED / Auth-policy blocked**; needs separately approved real confirmed subject and metadata lifecycle |
| In-flight authority revocation | `26_identity_phase_assertions.sql` | Transaction-entry policy is represented at each separately invoked phase | Sequential source only; no PostgreSQL transaction/concurrency acceptance |

Simulated claim JSON is never described as JWT signature, issuer, Auth session or identity-provider acceptance.

## Concurrency proof and cancellation

Four scenario bodies are executable: the pending-first and completed-first operation collisions, plus reservation-first and revocation-first admission/reservation orderings. Identity collision bodies now reference `rpc_gateway_begin_owner_identity_v4`; reservation and revocation invoke `rpc_gateway_reserve_owner_eligibility_v2` and `rpc_platform_owner_admission_decide_v2`. Durable recovery concurrency and consumption/revocation remain `NOT IMPLEMENTED` or `BLOCKED`. Callers cannot supply SQL.

Both sessions first commit readiness. The coordinator releases A, proves A holds the advisory lock derived by the production RPC, then releases B and proves the exact A/B blocker-waiter relationship through `pg_blocking_pids`, `pg_stat_activity` and matching `pg_locks` identities. Collision cases use `hashtextextended(operation_id::text,2)`; reservation/revocation uses the lock shared by both production RPCs, `hashtextextended(email_digest,1)`. There is no harness advisory lock around the RPCs. Session timestamps or a boolean claim cannot establish overlap.

Reservation-first expects a committed `RESERVED` request followed by an inactive admission: the reservation has two counted durable effects and revocation has three, for five total. Revocation-first expects the revocation's three effects and `PI010` from reservation with zero reservation effects. Exact final state predicates are required in addition to counts. Fixture cleanup refuses to remove the committed approval or scenario results because they are immutable security/business evidence; environment destruction remains separately gated.

The signed 64-bit application lock key is split into PostgreSQL `pg_locks` components with unsigned masks: high `((key >> 32) & 4294967295)` and low `(key & 4294967295)`. Session evidence and coordinator queries use the same PowerShell source helper. Local TypeScript vectors cover zero, positive maximum, negative values, unsigned components above `2147483647`, and signed-bigint limits. PostgreSQL parity remains **NOT RUN**.

Every coordinator UPDATE that controls or records the proof returns a single aggregate `TAG|count` acknowledgment. Releases require exactly one row; blocker/waiter observation and verified-rollback marking require exactly two. Zero, one where two are required, multiple, wrong-tag and malformed results abort.

All sessions have statement, lock and idle-transaction deadlines; coordinator queries are separately bounded. On failure the runner cancels only backend IDs already bound to this nonce/application pair, waits for their absence, checks the exact advisory lock is gone, and runs the scenario-specific rollback proof. `VERIFIED_ROLLBACK` is recorded only if every check passes. Anything else is `UNVERIFIED_CANCELLATION` or `UNVERIFIED_PARTIAL_EVIDENCE`, remains preserved, and is never PASS.

Sequential, injected and static results are not PostgreSQL concurrency acceptance.

## Evidence

Both executors keep stdout and stderr separate. PostgreSQL payloads must contain exactly one `PF_I3A_RESULT=` JSON envelope; command tags, extra payload rows and malformed envelopes fail closed. Notices and stderr remain diagnostics and are sanitized separately. `evidence.ps1` recursively sanitizes objects, arrays and quoted JSON before NDJSON serialization, including sensitive key variants, assignments, JWT-shaped strings and PostgreSQL URLs. Tests use synthetic values only.

## Future command forms — not authorized now

A later owner authorization must fill every proof/hash/connection value in a separate JSON file. The checked-in example remains deliberately `NOT_AUTHORIZED`.

```powershell
# Local review only
node --loader .\scripts\typescript-loader.mjs .\scripts\acceptance\i3a\synthetic.test.ts
node .\scripts\acceptance\i3a\static.test.mjs
.\node_modules\.bin\tsc.cmd -p .\scripts\acceptance\i3a\tsconfig.json --noEmit

# Protected forms — require later exact authorization; do not run under ACC-01
.\scripts\acceptance\i3a\executor.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_CONTRACT_ALIGNMENT_PF-SUP-2026-10-26-16.sha256' -Command postgres-fixture
.\scripts\acceptance\i3a\executor.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_CONTRACT_ALIGNMENT_PF-SUP-2026-10-26-16.sha256' -Command postgres-assertions
.\scripts\acceptance\i3a\concurrency-runner.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_CONTRACT_ALIGNMENT_PF-SUP-2026-10-26-16.sha256' -CaseId OPERATION_COLLISION_PENDING_FIRST
.\scripts\acceptance\i3a\concurrency-runner.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_CONTRACT_ALIGNMENT_PF-SUP-2026-10-26-16.sha256' -CaseId RESERVATION_REVOCATION_RESERVATION_FIRST
.\scripts\acceptance\i3a\concurrency-runner.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_CONTRACT_ALIGNMENT_PF-SUP-2026-10-26-16.sha256' -CaseId RESERVATION_REVOCATION_REVOCATION_FIRST
.\scripts\acceptance\i3a\executor.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_CONTRACT_ALIGNMENT_PF-SUP-2026-10-26-16.sha256' -Command fixture-cleanup
```

Provider/Auth/browser runners, production adapters, authority provisioning, signup and runtime mapping remain absent. AUTH-02 remains deferred.
