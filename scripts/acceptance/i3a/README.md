# PharmacyFlow I3A acceptance preparation — ACC-01 correction

Status: **local sources only; protected execution NOT authorized**. Baseline attribution: owner-supplied `PF-SUP-2026-10-26-08` findings. This package cannot authorize itself.

## Destination and connection boundary

Future executors use only explicit libpq arguments: `-h 127.0.0.1 -p 57322 -d postgres -U postgres -X --no-password`. Service aliases are prohibited. Before invocation, ambient `PGHOST`, `PGHOSTADDR`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSERVICE`, `PGSERVICEFILE`, `PGOPTIONS`, `PGAPPNAME`, `PGPASSWORD`, `PGCHANNELBINDING` and `PGTARGETSESSIONATTRS` are removed. The authorization must pin the absolute `psql.exe` path/hash and an absolute ephemeral `PGPASSFILE` delivery path; the harness never reads credential contents.

Before any fixture/schema access, `01_target_proof.sql` performs a read-only proof and the executor compares all fields: pre-existing `pharmacyflow.acceptance_target_id`, PostgreSQL system identifier, database OID/name, loopback server address/port and session user. Every writable SQL file repeats that proof through `00_guard.sql`. Missing or mismatched proof aborts. No discovery/enumeration fallback exists.

## Unified preflight

TypeScript and PowerShell enforce the same full fixture values/digest and the same required execution-source/runner/migration path inventory. The authorization hash inventory must have exactly those paths—no missing or extra entries—and every observed file must match its owner-pinned hash. Migrations 000027–000032 also match sealed hashes embedded in the TypeScript contract.

`allowedCommands` is a nonempty subset. Its `commandPermissions` keys must be identical to that subset:

| Command | Exact permission |
|---|---|
| `postgres-fixture` | `fixtureWrite: true` |
| `postgres-assertions` | `readOnlyAndRollbackAssertions: true` |
| `postgres-concurrency` | `concurrentFixtureWrite: true`, `cancellationAndRollbackVerification: true` |
| `fixture-cleanup` | `fixtureCleanup: true`, `environmentDestruction: false` |

Assertion-only authority does not imply fixture creation, cleanup, concurrency or environment destruction.

## Ownership and cleanup

Fixture setup rejects pre-existing harness objects unless their exact comment, ordered columns and primary-key shape match v2. It rejects an existing synthetic authority identity unless an exact ownership row belongs to this run and both the stored attribute digest and every active/version/action field match. Unknown I3A-like identities abort.

Cleanup requires the exact run/authorization/fixture digest, four exact ownership records and unchanged authority attributes. It refuses cleanup when an issuance attempt, pending/completed claim, immutable security operation, admission/revocation decision, fixture request or unresolved concurrency row exists. It deletes only objects owned by this run and verified rolled-back concurrency evidence. It never drops shared tables, deletes another run, or destroys the database/schema/service/container/volume/profile/evidence directory. Environment destruction remains a separate authorization.

## Concrete database coverage

All SQL below is authored but **NOT RUN**:

| Case | Source | Prepared assertion | Limitation |
|---|---|---|---|
| Exact RPC ACL / forced RLS | `20_acl_rls_assertions.sql` | Exact signatures; PUBLIC/anon/authenticated/service_role/opposite executor; `relrowsecurity`/`relforcerowsecurity` | Catalog/role behavior unexecuted |
| Role-specific direct DML denial | `21_role_dml_denial.sql` | SELECT/INSERT/UPDATE/DELETE under five roles | PostgreSQL role execution unexecuted |
| Current authority/version/action | `22_authority_assertions.sql` | current, unknown action, stale rotation, revoked recovery, underprivileged operator | `request.jwt.claims` is simulated database input, not JWT/Auth acceptance |
| Namespace collision both orderings | `23_operation_recovery_assertions.sql`, fixed concurrency scenarios | Pending-first and completed-first conflict, completed evidence preserved | PostgreSQL triggers/overlap unexecuted |
| Durable pending recovery | `25_lifecycle_recovery_assertions.sql` | Begin and recovery use their intended RPCs; exact pending replay is checked | Sequential only: recovery RPC exposes no application lock to prove; provider feasibility open |
| Audit rollback / exact replay | `24_atomic_replay_assertions.sql` | Injected audit failure leaves no operation/decision/claim; exact result/count replay; changed reason + old hash conflicts | Transaction behavior unexecuted |
| Reservation/revocation | `25_lifecycle_recovery_assertions.sql` | Admission revocation and subsequent reservation use intended RPCs | Concurrent case **BLOCKED** pending committed-fixture lifecycle review |
| Consumption/revocation | classification only | No direct-row substitute is used | **NOT IMPLEMENTED / Auth-policy blocked**: genuine consumption requires `rpc_create_pharmacy_owner_v1`, confirmed Auth identity and trusted metadata |
| UTF-8/null/UUID parity | `24_atomic_replay_assertions.sql`, `synthetic.test.ts` | Same two hard-coded SHA-256 results in TypeScript and SQL | SQL half unexecuted |
| Confirmed applicant continuation | explicitly marked in `25_lifecycle_recovery_assertions.sql` | — | **NOT IMPLEMENTED / Auth-policy blocked**; needs separately approved real confirmed subject and metadata lifecycle |
| In-flight authority revocation | — | — | **POLICY BLOCKED by REV-LIN-01**; no outcome is selected or called PASS |

Simulated claim JSON is never described as JWT signature, issuer, Auth session or identity-provider acceptance.

## Concurrency proof and cancellation

Only the pending-first and completed-first operation-collision orderings are executable scenario bodies. Both invoke the actual identity-begin/admission RPCs. Durable recovery, reservation/revocation and consumption/revocation are explicitly rejected as `NOT IMPLEMENTED` or `BLOCKED`, rather than replaced with direct row mutations. Callers cannot supply SQL.

Both sessions first commit readiness. The coordinator releases A, proves A holds the advisory lock derived by the production RPC as `hashtextextended(operation_id::text,2)`, then releases B and proves the exact A/B blocker-waiter relationship through `pg_blocking_pids`, `pg_stat_activity` and matching `pg_locks` identities. There is no harness advisory lock around the RPCs. Session timestamps or a boolean claim cannot establish overlap.

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
.\scripts\acceptance\i3a\executor.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_EXECUTION_FIDELITY_CORRECTION_2026-10-26.sha256' -Command postgres-fixture
.\scripts\acceptance\i3a\executor.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_EXECUTION_FIDELITY_CORRECTION_2026-10-26.sha256' -Command postgres-assertions
.\scripts\acceptance\i3a\concurrency-runner.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_EXECUTION_FIDELITY_CORRECTION_2026-10-26.sha256' -CaseId OPERATION_COLLISION_PENDING_FIRST
.\scripts\acceptance\i3a\executor.ps1 -AuthorizationFile '<approved.json>' -PackageManifest '.\docs\development\BLK002_ACC01_EXECUTION_FIDELITY_CORRECTION_2026-10-26.sha256' -Command fixture-cleanup
```

Provider/Auth/browser runners, production adapters, authority provisioning, signup and runtime mapping remain absent. AUTH-02 remains deferred.
