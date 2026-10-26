# PharmacyFlow BLK-002 ACC-01 execution-fidelity correction

Date: 2026-10-26  
Baseline: owner-supplied `PF-SUP-2026-10-26-10`  
Authority: owner message `PHARMACYFLOW — ACC-01 EXECUTION-FIDELITY CORRECTION`  
Disposition: **LOCAL CORRECTION AUTHORED — PURE/INJECTED/STATIC VERIFIED — PROTECTED ACCEPTANCE NOT RUN — STOP FOR INDEPENDENT REVIEW**

## Authorization and preservation

The owner authorized this bounded local harness correction, focused local verification, append-only ledger updates and one new scoped manifest. The message prohibits database/SQL/fixture/cleanup execution, network, Auth/provider, Docker/services/ports, credentials, browser storage, installation, Git mutation, provisioning, activation, deployment and StoreFlow. It grants no AUTH-02 authority and does not decide REV-LIN-01.

Migrations `000027`–`000032`, I3 application/security source, historical manifests and unrelated dirty/untracked work were not modified.

## Corrected execution fidelity

1. The pending-first and completed-first operation-collision scenarios invoke `rpc_gateway_begin_owner_identity_v3` and `rpc_platform_owner_admission_decide_v2`. The harness no longer acquires a serializing advisory lock around business operations.
2. Both sessions commit readiness. The coordinator releases A, proves A holds the application operation lock derived from `hashtextextended(operation_id::text,2)`, then releases B and verifies the exact blocker/waiter pair through `pg_blocking_pids`, `pg_stat_activity` and matching `pg_locks` rows.
3. Durable recovery remains a sequential intended-RPC boundary case because `rpc_gateway_recover_owner_identity_v3` exposes no application lock to observe. Reservation/revocation concurrency is blocked pending a reviewed committed-fixture lifecycle. Consumption/revocation and confirmed continuation are not implemented because genuine `rpc_create_pharmacy_owner_v1` execution requires prohibited confirmed Auth identity and trusted metadata. No direct-row substitute is classified as acceptance.
4. PowerShell evidence sanitization recursively processes dictionaries, objects, arrays and quoted JSON before serialization. Sensitive key variants, assignments, quoted assignments, JWT-shaped values and PostgreSQL URLs are redacted while non-secret diagnostics remain.
5. Process handling separates stdout from stderr/notices. Result-producing SQL emits one `PF_I3A_RESULT=` envelope with the exact `pharmacyflow-i3a-process-v1` schema and expected kind. Empty, duplicated, command-tag-contaminated, malformed, wrong-kind and nonzero-exit streams fail closed.
6. SQL assertions distinguish a present JSON null from a missing key and SQL NULL behavior. Recovery uses begin/recover RPCs and reservation-after-revocation uses admission/reservation RPCs. The fixture relation-existence guard no longer casts an absent relation name to `regclass`, and the ACL assertion transaction is rollback-only rather than incorrectly `READ ONLY` while creating a temporary table.

## Local verification

| Command | Exact result | Evidence class |
|---|---|---|
| `node --loader ./scripts/typescript-loader.mjs ./scripts/acceptance/i3a/synthetic.test.ts` | exit 0; `ACC-01 PF-SUP-10 execution-fidelity synthetic tests: passed (16 zero-executor preflight rejections; separated stream regressions passed)` | Pure/injected; zero external calls |
| `node ./scripts/acceptance/i3a/static.test.mjs` | exit 0; `ACC-01 PF-SUP-10 execution-fidelity static contract tests: passed` | Static source assertions |
| `.\node_modules\.bin\tsc.cmd -p .\scripts\acceptance\i3a\tsconfig.json --noEmit` | exit 0; no diagnostics | Focused strict compilation |
| PowerShell parser over all harness `.ps1` files | 8/8 `PARSE_OK` | Parser only |
| `evidence.test.ps1` with process-scoped execution-policy bypass | exit 0; `ACC-01 PowerShell recursive evidence sanitizer synthetic object test: passed` | Pure synthetic objects |
| `process-output.test.ps1` with process-scoped execution-policy bypass | exit 0; `ACC-01 PowerShell separated process-output synthetic tests: passed` | Injected stdout/stderr only |

The Node loader emitted its standard experimental-loader warning after the passing synthetic result. The host blocks direct `.ps1` invocation under its default policy; the two pure tests passed with process-scoped `Bypass`. No executor or external process was invoked by those tests.

## Coverage disposition

| Area | Current source disposition | External acceptance |
|---|---|---|
| Operation collision, pending first | Actual begin/admission RPC source and production operation-lock proof | **NOT RUN** |
| Operation collision, completed first | Actual admission/begin RPC source and production operation-lock proof | **NOT RUN** |
| Durable pending recovery | Intended begin/recovery RPCs; exact pending replay | Sequential SQL **NOT RUN**; concurrency **NOT IMPLEMENTED** because recovery exposes no lock |
| Reservation/revocation | Intended admission/reservation RPCs | Sequential SQL **NOT RUN**; concurrency **BLOCKED** pending fixture-lifecycle review |
| Consumption/revocation | No direct-row substitute | **NOT IMPLEMENTED — AUTH SCOPE REQUIRED** |
| Confirmed applicant continuation | No Auth adapter or identity fixture | **NOT IMPLEMENTED — AUTH SCOPE REQUIRED** |
| ACL/RLS, authority, audit rollback, replay, null parity | Concrete guarded SQL source | **NOT RUN**; simulated claims are not JWT/Auth acceptance |
| Provider create/status/call count | No provider adapter/stage | Provider feasibility open |
| In-flight authority revocation | No rule selected | **POLICY BLOCKED — REV-LIN-01 undecided** |

Static assertions and parser/type checks are not PostgreSQL parsing, RPC execution, privilege, RLS, transaction, cancellation or concurrency evidence.

## Explicitly not run

No database connection, psql process, SQL, target proof, migration, fixture, RPC, schema write, ACL/RLS, role switch, transaction, lock, concurrency session, cancellation, cleanup, Auth/provider/network, Docker/service/port, credential access, browser/storage, installation, Git mutation, provisioning, signup, activation, deployment or StoreFlow access occurred.

## Next gate

Stop for independent review of the new scoped manifest. Any later protected request must identify the exact reviewed snapshot, pinned disposable target, executable and credential-delivery paths, allowed command/case subset, committed-fixture lifecycle, evidence scope, cancellation permissions and cleanup boundary. Auth consumption/continuation and provider feasibility require separate scopes. AUTH-02 remains deferred. REV-LIN-01 remains an owner decision.
