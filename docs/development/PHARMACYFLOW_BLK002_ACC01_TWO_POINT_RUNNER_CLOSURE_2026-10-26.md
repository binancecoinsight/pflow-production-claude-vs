# PharmacyFlow BLK-002 ACC-01 two-point runner closure

Date: 2026-10-26  
Baseline: owner-supplied `PF-SUP-2026-10-26-11`  
Authority: owner message `PHARMACYFLOW — ACC-01 TWO-POINT RUNNER CLOSURE`  
Disposition: **NARROW LOCAL CORRECTION COMPLETE — PURE/INJECTED/STATIC VERIFIED — PROTECTED ACCEPTANCE NOT RUN — STOP FOR INDEPENDENT REVIEW**

## Scope and preservation

This batch corrects only coordinator mutation-output handling and advisory-lock identity extraction. It does not restart I3 or reopen the PF-SUP-10 execution-fidelity correction. Migrations `000027`–`000032`, I3 application/security source, historical manifests and unrelated dirty/untracked work remain unchanged.

The owner authorized local source/tests/docs/hashes only. Database/SQL/fixture/cleanup execution, network, Auth/provider, Docker/services/ports, credentials, browser storage, installation, Git mutation, provisioning, activation, deployment and StoreFlow are prohibited. AUTH-02 remains deferred. REV-LIN-01 remains undecided.

## Corrections

### Coordinator mutation acknowledgments

The coordinator no longer passes a rowless observation UPDATE into the strict scalar helper. Every proof-control mutation now uses a writable CTE and returns exactly one aggregate `TAG|count` scalar:

- A release: exactly one row.
- B release: exactly one row.
- Blocker/waiter observation persistence: exactly two rows.
- Verified-rollback marking: exactly two rows.

`Assert-I3aMutationAcknowledgement` rejects zero, too few, too many, malformed and wrong-tag results. Aggregate output means zero, one and multiple affected-row cases still produce one machine result for explicit validation.

### Unsigned advisory-lock components

Direct `bigint -> int -> oid` narrowing was removed. `Get-I3aAdvisoryLockComponentsSql` is the single source used by session evidence and coordinator queries:

- high/class component: `((key >> 32) & 4294967295)::oid`
- low/object component: `(key & 4294967295)::oid`

The independent TypeScript model uses `BigInt.asUintN(64, key)` and the same `0xffffffff` masks. Boundary vectors cover `0`, `1`, `4294967295`, `4294967296`, signed-bigint maximum, `-1`, `-4294967296`, and signed-bigint minimum. Values outside signed 64-bit range are rejected.

This proves local arithmetic and source agreement only. PostgreSQL `hashtextextended` and `pg_locks.classid/objid` parity remain **NOT RUN**.

## Local verification

| Command | Exact result | Evidence class |
|---|---|---|
| `node --experimental-strip-types scripts/acceptance/i3a/synthetic.test.ts` | exit 0; `ACC-01 PF-SUP-11 two-point runner closure synthetic tests: passed (16 zero-executor preflight rejections; mutation acknowledgments and signed-bigint lock vectors passed)` | Pure/injected |
| `node ./scripts/acceptance/i3a/static.test.mjs` | exit 0; `ACC-01 PF-SUP-11 two-point runner closure static contract tests: passed` | Static source assertions |
| `npm.cmd exec -- tsc -p scripts/acceptance/i3a/tsconfig.json --noEmit` | exit 0; no diagnostics | Focused strict compilation |
| PowerShell parser over harness `.ps1` sources | 10/10 `PARSE_OK` | Parser only |
| `runner-contract.test.ps1` with process-scoped execution-policy bypass | exit 0; `ACC-01 PowerShell mutation acknowledgment and lock-source tests: passed` | Pure local; no psql |

Node emitted its standard experimental type-stripping warning after the passing result. Two preliminary compiler command forms stopped before source compilation: PowerShell blocked `npm.ps1`, then an explicit-file invocation was rejected because it named absent `types.d.ts`; the focused project command above is the successful authoritative result. No acceptance executor, psql, database, network or protected-resource process was invoked by the tests.

## Coverage and limitations

- Pending-first and completed-first application-RPC concurrency sources remain as corrected at PF-SUP-10, but are **NOT RUN**.
- Durable recovery concurrency remains **NOT IMPLEMENTED** because its recovery RPC exposes no observable application lock.
- Reservation/revocation concurrency remains **BLOCKED** pending committed-fixture lifecycle review.
- Consumption/revocation and confirmed continuation remain **NOT IMPLEMENTED — AUTH SCOPE REQUIRED**.
- Provider feasibility remains open.
- In-flight authority revocation remains **POLICY BLOCKED — REV-LIN-01 undecided**.
- Static, arithmetic, parser and compiler results are not PostgreSQL parsing, mutation, lock, cancellation or concurrency acceptance.

## Explicitly not run

No database connection, psql, SQL, target proof, migration, fixture, RPC, mutation, transaction, lock, concurrency session, cancellation, cleanup, Auth/provider/network, Docker/service/port, credential access, browser/storage, installation, Git mutation, provisioning, activation, deployment or StoreFlow access occurred.

## Next gate

Stop for independent review of the PF-SUP-11 scoped manifest. Any later PostgreSQL parity or execution request requires new exact authorization. This report grants none.
