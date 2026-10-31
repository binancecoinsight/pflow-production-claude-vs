# PF-MVP-10 production-path integration closure

This package is runnable but intentionally unexecuted. The example authorization cannot authorize execution. It requires an owner-pinned PowerShell Core 7 runtime in `[7.4.0,8.0.0)`, exact executable hashes, a Supabase-compatible PostgreSQL target whose database comment equals the approved marker, and `scripts/acceptance/pf-mvp-10/PF-MVP-10_EXECUTION_INVENTORY.sha256`.

The execution inventory is distinct from historical review manifests. It contains exactly all 41 active migrations through 000039 plus the 20 scripts, C# bridge and SQL modules the runner executes. Preflight rejects missing, duplicate, extra, historical-manifest or hash-drifted entries. Historical review manifests remain immutable evidence and are not recursively revalidated against current source files.

Command gates:

- `runtime-preflight`: read-only runtime, system identifier, database OID and target-marker proof.
- `apply-migrations`: requires `migrationApply`; proves the target is empty, applies only manifest-pinned migrations and verifies final 000039 state.
- `acceptance-assertions`: requires `fixtureWrite`; re-proves target/package state, runs exact ACL, API-role/RLS, operator/tenant/decision/inventory/evidence rollback and financial/refund cases. All fixtures roll back.
- `concurrency`: requires `fixtureWrite` and `concurrency`; refuses pre-existing identities, records authorization-bound ownership, proves distinct backends and a real production lock blocker, then verifies authoritative effects.
- `fixture-cleanup`: requires separate `fixtureCleanup`; re-proves target/package state and validates authorization/marker ownership, UUID+email identity and exact dependencies. It returns `REFUSED|immutable-evidence-preserved` without disabling guards or deleting audit, ledger, business, fixture-ownership or entitlement evidence. Environment destruction is not implemented and is never an automatic fallback.

After independent acceptance and a separate execution authorization, run from the repository root using the exact owner-pinned `pwsh.exe` path. Quoting the call operator and path preserves repository paths containing spaces:

```powershell
& '<OWNER_PINNED_PWSH_EXE>' -NoProfile -File '.\scripts\acceptance\pf-mvp-10\runner.ps1' -AuthorizationFile '<OWNER_AUTH_JSON>' -Manifest '.\scripts\acceptance\pf-mvp-10\PF-MVP-10_EXECUTION_INVENTORY.sha256' -Command runtime-preflight
& '<OWNER_PINNED_PWSH_EXE>' -NoProfile -File '.\scripts\acceptance\pf-mvp-10\runner.ps1' -AuthorizationFile '<OWNER_AUTH_JSON>' -Manifest '.\scripts\acceptance\pf-mvp-10\PF-MVP-10_EXECUTION_INVENTORY.sha256' -Command apply-migrations
& '<OWNER_PINNED_PWSH_EXE>' -NoProfile -File '.\scripts\acceptance\pf-mvp-10\runner.ps1' -AuthorizationFile '<OWNER_AUTH_JSON>' -Manifest '.\scripts\acceptance\pf-mvp-10\PF-MVP-10_EXECUTION_INVENTORY.sha256' -Command acceptance-assertions
& '<OWNER_PINNED_PWSH_EXE>' -NoProfile -File '.\scripts\acceptance\pf-mvp-10\runner.ps1' -AuthorizationFile '<OWNER_AUTH_JSON>' -Manifest '.\scripts\acceptance\pf-mvp-10\PF-MVP-10_EXECUTION_INVENTORY.sha256' -Command concurrency
& '<OWNER_PINNED_PWSH_EXE>' -NoProfile -File '.\scripts\acceptance\pf-mvp-10\runner.ps1' -AuthorizationFile '<OWNER_AUTH_JSON>' -Manifest '.\scripts\acceptance\pf-mvp-10\PF-MVP-10_EXECUTION_INVENTORY.sha256' -Command fixture-cleanup
```

The production bridge constructs an ordinal `Dictionary<string,string>` and passes the executable and every argument as distinct values to `ProcessStartInfo.ArgumentList`; paths and values containing spaces are not reconstructed. Managed dispatch uses structured return values and exceptions, never `$LASTEXITCODE`. Each process has a 64 KiB live capture limit, bounded waits and process-tree termination. Raw stdout, stderr and notices are never retained: only narrow, validated `PF_*` frames and fixed diagnostic dispositions can enter evidence. A root `CANCEL` file stops the next process; concurrency polls it every 100 ms and accounts for every worker in `finally`. One versioned `PF_EVENT` protocol covers readiness, backend identity, blocker proof and terminal outcomes.

Emitter/consumer rules are exact. Runtime proof is `PF_PASS|runtime|<server-version-number>|target-verified` everywhere. Each non-worker SQL module emits one terminal frame; migrations emit none. Migration stderr may contain only the explicit PostgreSQL skip notices recognized by `Test-PfMvp10BenignNotice` (the `pgcrypto` extension, existing relation/column, or missing policy/trigger forms); those notices are validated and discarded, never retained. Any other notice or diagnostic rejects the process. Worker evidence retains exactly one READY and one TERMINAL event for the expected actor; all other framed or unframed output rejects the worker.

The local `command-surface.test.ps1` uses representative frames derived from the delivered SQL source, while `concurrency-coordinator.test.ps1` runs the actual coordinator with controlled process adapters. Both are conformance rehearsals only. They do not parse or execute PostgreSQL and must not be cited as database behavior.

Native `psql` diagnostic prefixes are normalized only when they have the exact form `psql:<approved -f SQL path>:<positive in-range line>: NOTICE: <payload>` and the normalized path equals the approved SQL input. Windows drive letters and repository paths containing spaces are supported. The path and line prefix are discarded before validation and are never retained. Unrelated files, malformed/out-of-range prefixes, `CONTEXT`, unknown notices and secret-bearing payloads reject. The benign notice allowlist includes actual PostgreSQL column-of-relation and constraint-of-relation wording required by the migration chain; it is not a general `NOTICE` bypass.

Unsupported and excluded: Auth/provider lifecycle, browser/datastore behavior, direct-table enforcement policy, environment destruction and production deployment. These are not replaced by synthetic success and are not counted as executed acceptance. PostgreSQL parsing and every protected scenario remain NOT RUN until separately authorized.
