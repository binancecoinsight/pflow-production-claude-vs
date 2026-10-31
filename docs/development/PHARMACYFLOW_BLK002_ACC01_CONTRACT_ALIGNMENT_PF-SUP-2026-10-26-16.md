# PharmacyFlow BLK-002 ACC-01 contract alignment — PF-SUP-2026-10-26-16

Date: 2026-10-26  
Scope: owner-authorized local acceptance-harness source only  
Status: **AUTHORED AND LOCALLY VERIFIED — POSTGRESQL/AUTH/PROVIDER NOT RUN — INDEPENDENT REVIEW REQUIRED**

## Preserved production boundary

No application/security source or migration was changed. Migrations `000027`–`000034`, historical manifests and unrelated dirty/untracked work were preserved. In particular:

- migration `000033`: `1065386b66fcc3b03b4a9e3026869b6aee4ebeeea6c572ead9d7e3ac0ec8477f`
- migration `000034`: `3ed6fa4aa1a0fc85d52df0bbdd644095c40f301e357630ff9d304b5fec07582b`
- PF-SUP-15 manifest: `59c324ef6b2200916206bdb713f3987d425707e3cacd3405eb0b7f44a958a99f`

No SQL was parsed by PostgreSQL or executed. No target, credential, service, network, Auth/provider/browser, Docker or StoreFlow resource was accessed.

## Alignment authored

1. TypeScript and PowerShell preflight now require the complete migration inventory through `000034` and independently seal the exact `000033`/`000034` hashes. Missing, extra or overridden inventory still aborts before executor access.
2. `10_fixture.sql` authors six explicit, run-owned applicant/context capability grants supporting original-principal and alternate-recovery cases. Unknown or mismatched existing scope rows are refused. These are disposable acceptance fixtures, not runtime provisioning.
3. `20_acl_rls_assertions.sql` replaces executable v3 identity expectations with the exact eight v4/phase/result signatures, explicitly proves superseded identity routes closed for all named roles and PUBLIC, and adds forced-RLS checks for the scope and execution-audit tables.
4. Existing pending recovery and operation-collision sources now reference the current v4 boundaries. The completed-first collision uses an explicitly scoped applicant.
5. New rollback-only `26_identity_phase_assertions.sql` exercises production RPC boundaries for original-principal ISSUE dispatch, same-principal rotation, cross-principal ISSUE dispatch/completion/result denial, scoped alternate resolution/recovery, recovery-only no-create behavior, changed-provider conflict, stale/revoked authority and separately attributed append-only phase audit.
6. Cleanup now requires all ten owned objects, verifies all six scope rows, checks execution-audit dependencies, and deletes owned scopes before referenced authorities. Immutable or unresolved evidence still refuses cleanup; environment destruction remains separate.

## Updated coverage matrix

| Case | Source | Classification | Remaining limitation |
|---|---|---|---|
| Migration/source pinning through 000034 | `contract.ts`, `preflight.ps1` | Locally synthetic/static verified | Future authorization must pin every exact hash |
| Exact v4/phase RPC ACLs and old-route closure | `20_acl_rls_assertions.sql` | Authored — PostgreSQL not run | Effective catalog ACLs/RLS unverified |
| Missing/inactive/capability/applicant/context scope denial | `10_fixture.sql`, `22_authority_assertions.sql` | Authored — PostgreSQL not run | Simulated claim JSON is not JWT/Auth acceptance |
| Original-principal ISSUE dispatch/completion/result denial | `26_identity_phase_assertions.sql` | Authored — PostgreSQL not run | Rollback-only sequential SQL |
| Same-principal credential rotation | `26_identity_phase_assertions.sql` | Authored — PostgreSQL not run | No runtime credential issuer/mapping acceptance |
| Alternate scoped RECOVER resolution/lookup | `26_identity_phase_assertions.sql` | Authored — PostgreSQL not run | Pending lookup only; no provider call |
| Recovery-only cannot create | `26_identity_phase_assertions.sql` | Authored — PostgreSQL not run | Database claim simulation only |
| Changed provider correlation conflict | `26_identity_phase_assertions.sql` | Authored — PostgreSQL not run | Stops before Auth-dependent correlation |
| Phase audit actor/original provenance | `26_identity_phase_assertions.sql` | Authored — PostgreSQL not run | Transaction/audit behavior unverified |
| Successful completion and completed canonical replay | Explicit classification in `26_identity_phase_assertions.sql` | **BLOCKED_AUTH_02** | Genuine provider-created subject with trusted metadata required |
| Completion-effect/result/audit rollback | Explicit classification in `26_identity_phase_assertions.sql` | **BLOCKED_AUTH_02** | No direct `auth.users` substitute is authorized or authored |
| Operation collisions, both orderings | `scenarios.ps1` | Current v4 source aligned | PostgreSQL concurrency not run |
| Reservation/revocation, both orderings | Existing reviewed scenarios | Unchanged source-supported | PostgreSQL concurrency not run |
| Durable recovery concurrency | Classification only | **NOT IMPLEMENTED** | v4 exposes the operation lock, but reviewed provider-resolution outcomes and committed pending-fixture lifecycle are absent |
| Consumption/revocation and confirmed continuation | Classification only | **BLOCKED_AUTH_02** | Confirmed Auth lifecycle required |

Sequential SQL, static assertions, generated SQL strings and injected orchestration are not PostgreSQL acceptance.

## Executed local verification

| Check | Exact result | Evidence limit |
|---|---|---|
| Synthetic TypeScript | `ACC-01 000033-000034 contract-alignment synthetic tests: passed (16 zero-executor preflight rejections; sealed migrations, fixture inventory and case identifiers passed)` | Injected executor only; zero external calls |
| Static source contract | `ACC-01 000033-000034 contract-alignment source static tests: passed` | Source assertions only; not SQL parsing |
| Focused TypeScript compilation | exit `0`, no diagnostics | `tsc -p scripts/acceptance/i3a/tsconfig.json --noEmit` |
| PowerShell parser | `ACC-01 PowerShell parser-only checks: passed (11 files)` | AST parsing only; no runner invocation |
| Scenario source regression | `ACC-01 reservation/revocation scenario source tests: passed` | Generated strings only; no psql |
| Runner arithmetic/acknowledgment regression | `ACC-01 PowerShell mutation acknowledgment and lock-source tests: passed` | Pure local helpers only |

The host initially blocked direct `.ps1` invocation under its standing execution policy. The two inspected pure test files then passed under a process-local `-ExecutionPolicy Bypass`; no system policy was changed.

## Approval boundary and next gate

This package does not authorize database or SQL execution, target inspection, credentials, Auth/provider/browser access, runtime scope provisioning, signup, activation, deployment, cleanup or environment destruction. AUTH-02 remains deferred. The next action is independent source/hash review of the scoped manifest. Any PostgreSQL execution or genuine completion/replay/audit case requires a separately approved exact disposable target and, where applicable, a separately approved Auth/provider fixture lifecycle.
