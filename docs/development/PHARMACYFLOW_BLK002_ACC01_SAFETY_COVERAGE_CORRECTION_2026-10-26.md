# PharmacyFlow BLK-002 ACC-01 safety and coverage correction

Date: 2026-10-26  
Baseline: owner-supplied `PF-SUP-2026-10-26-08`  
Authority: owner message `PHARMACYFLOW — ACC-01 SAFETY AND COVERAGE CORRECTION`  
Disposition: **LOCAL CORRECTION AUTHORED — PURE/INJECTED/STATIC VERIFIED — PROTECTED ACCEPTANCE NOT RUN — STOP FOR INDEPENDENT REVIEW**

## Corrected findings

1. **Destination pinning:** service aliases were removed. Future calls explicitly bind `127.0.0.1:57322`, database/user, SSL mode, absolute `psql.exe` path/hash and ephemeral credential-file path. Ambient libpq routing/password variables are cleared. A read-only marker/system-identifier/database-OID/endpoint/session-user proof must match before fixture/schema access, and every writable SQL source repeats the proof.
2. **Unified fail-closed preflight:** TypeScript and PowerShell use the same complete execution dependency inventory, complete fixture fields/digest, sealed migration hashes and command-specific permissions. Missing/extra files and migration observation overrides fail. `allowedCommands` may be narrow; assertion authority no longer requires fixture, cleanup or concurrency authority.
3. **Ownership-safe fixture/cleanup:** unknown existing objects/identities are rejected. Exact run/object ownership and attributes are checked on reuse and cleanup. Cleanup never drops shared harness tables or other-run rows and refuses pending attempts, claims, completed/immutable business evidence and unresolved concurrency evidence.
4. **Concurrency proof:** callers cannot inject SQL; five bodies come from hashed `scenarios.ps1`. Backend/application identity, nonce, exact advisory lock, blocker/waiter relationship and authoritative outcomes/counts are coordinator-proven. Queries/sessions are bounded. Cancellation is not accepted unless exact backend disappearance, lock release and case-specific rollback absence are all verified.
5. **Coverage:** concrete guarded SQL now exists for exact ACL/RLS, role DML denial, authority/version/action, collision orderings, pending recovery, audit rollback, replay, parity and reservation/consumption revocation. Fixed concurrent bodies cover the five declared overlap cases. Remaining gaps are explicit below.
6. **Evidence:** every PowerShell success/error passes through a sanitizer before NDJSON persistence. The pure orchestrator exposes the same sanitized sink. Synthetic tests cover key names, assignments, JWT-shaped strings and PostgreSQL URLs while retaining non-secret diagnostics.

## Coverage disposition

| Area | Local artifact disposition | External acceptance |
|---|---|---|
| ACL, forced RLS, direct DML denial | Concrete SQL authored | **NOT RUN** |
| Authority/version/action | Concrete SQL with simulated `request.jwt.claims` | **NOT JWT/Auth acceptance; NOT RUN** |
| Collision both orderings | Sequential trigger assertions plus exact concurrent bodies | **NOT RUN** |
| Durable pending recovery / compatibility | Exact pending attempt and recovery RPC source plus fixed pending concurrency body | **NOT RUN; provider calls absent** |
| Audit rollback and canonical replay | Failure trigger, before/after counts, replay and changed-command conflict source | **NOT RUN** |
| Reservation/revocation and consumption/revocation | Sequential terminal assertions plus exact lock bodies | **NOT RUN** |
| UTF-8/null/UUID parity | Matching TypeScript values and SQL expected SHA-256 values | TypeScript executed; SQL **NOT RUN** |
| Confirmed applicant continuation | **NOT IMPLEMENTED** because real confirmed Auth identity/metadata is prohibited in ACC-01 | Requires separate Auth scope |
| In-flight authority revocation | **POLICY BLOCKED — REV-LIN-01 undecided** | No rule inferred |
| Provider create/status/call count | No adapter/stage exists | Provider feasibility remains open |

The database SQL is source reasoning only. It was not sent to a PostgreSQL parser or server. Its labels such as `PASS_SIMULATED_DATABASE_CLAIMS` and `PASS_SEQUENTIAL_ONLY` deliberately prevent promotion to JWT/Auth or concurrency acceptance.

## Local verification

| Command | Exact result | Evidence class |
|---|---|---|
| `node --loader ./scripts/typescript-loader.mjs ./scripts/acceptance/i3a/synthetic.test.ts` | exit 0; `ACC-01 PF-SUP-08 correction synthetic tests: passed (16 zero-executor preflight rejections)` | Pure/injected synthetic; zero real external calls |
| `node ./scripts/acceptance/i3a/static.test.mjs` | exit 0; `ACC-01 PF-SUP-08 correction static contract tests: passed` | Static source assertions |
| `.\node_modules\.bin\tsc.cmd -p .\scripts\acceptance\i3a\tsconfig.json --noEmit` | exit 0; no diagnostics | Focused strict compilation |
| PowerShell parser for six `.ps1` sources | 6/6 `PARSE_OK` | Parser only; executors not invoked |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\acceptance\i3a\evidence.test.ps1` | exit 0; sanitizer synthetic test passed | Pure local synthetic values only |

The first direct invocation of `evidence.test.ps1` was rejected by the host's script execution policy before the file ran. The explicit process-scoped bypass command above then passed. This was not a database/network/credential operation.

## Explicitly not run

No database connection, SQL, target proof, migration, fixture, schema write, ACL/RLS, role switch, transaction, concurrency session, cancellation, cleanup, Auth/provider/network, Docker/service/port, credential-content read, browser/storage, installation, Git mutation, provisioning, signup, activation, deployment or StoreFlow access occurred.

Migrations 000027–000032, application/I3 implementation and historical manifests remain unchanged. Shared ledgers advance through append-only ACC-01 correction entries; their new hashes do not invalidate historical snapshot meaning.

## Next gate

Stop for independent review of the new scoped manifest. A later execution request must supply a real positive authorization with the pinned target proof, executable/credential-delivery paths, exact command subset, evidence scope and fixture permissions. Confirmed applicant continuation needs a distinct Auth acceptance scope. REV-LIN-01 remains an owner decision. AUTH-02 remains deferred.
