# PF-MVP-10 Production-Path Integration Closure

Date: 2026-10-31  
Checkpoint addressed: PF-SUP-2026-10-30-06  
Disposition: local correction and injected rehearsal complete; protected execution not run; independent review required

## Correction outcome

The executable acceptance package now uses one tested production invocation boundary. `runner.ps1` constructs a named argument vector; `runner-lib.ps1` constructs an ordinal `Dictionary<string,string>`; and `PfProcessBridge` sends the unchanged executable, arguments and environment to the bounded C# process implementation. The regression uses `PfSpyProcessAdapter` behind that same bridge and proves paths and values containing spaces remain distinct. Cancellation before launch makes zero bridge calls. No successful injected result replaces the production bridge.

Concurrency evidence uses one versioned `PF_EVENT` transcript for READY/backend identity, coordinator BLOCKER, and TERMINAL. Both workers must publish complete, ordered transcripts. Worker one reports the sealed M-13 `COMPLETED` response; worker two reaches the real unique-key race and reports `CONFLICT` with SQLSTATE `23505`. The package no longer invents `ALREADY_COMMITTED` for that concurrent path.

Refund V2 cases are independent: initial commit uses nonce 1; exact replay uses fresh nonce 2 with the same operation/payload/provenance; nonce reuse uses a different operation and payload with nonce 1; changed payload uses the original operation with fresh nonce 4; and expired committed replay uses fresh nonce 3. The final authoritative count is three consumed nonces, one return, one item/allocation/ledger/journal/evidence effect and quantity 11.

Fixture cleanup retains its separately gated command but is evidence preserving. It proves the approved target/package state, authorization-bound ownership, exact UUID/email identity and exact dependencies, then returns `PF_RESULT|cleanup|REFUSED|immutable-evidence-preserved`. It has no trigger disabling, deletion or table drop. Environment destruction remains a separate owner-authorized operation and is not implemented as fallback.

## Source evidence

- Process bridge and test adapter: `scripts/acceptance/pf-mvp-10/BoundedProcess.cs:18-55`.
- Exact environment/argument boundary and transcript validation: `scripts/acceptance/pf-mvp-10/runner-lib.ps1:10-63`.
- Named runner vector and cleanup refusal expectation: `scripts/acceptance/pf-mvp-10/runner.ps1:11-22`.
- End-to-end injected production-bridge rehearsal: `scripts/acceptance/pf-mvp-10/runner-boundary.test.ps1:1-26`.
- Worker lifecycle/blocker/result coordination: `scripts/acceptance/pf-mvp-10/concurrency.ps1:4-27`.
- M-13 worker protocol: `scripts/acceptance/pf-mvp-10/sql/31_concurrency_worker.sql:1-8`, `31_concurrency_worker_two.sql:1-10`, and `32_concurrency_verify.sql:1-6`.
- Refund nonce/provenance/effect separation: `scripts/acceptance/pf-mvp-10/sql/25_financial_refund.sql:3-25`.
- Immutable-evidence refusal: `scripts/acceptance/pf-mvp-10/sql/90_cleanup.sql:1-9`.

## Exact local checks

All commands were run from the repository root without database, SQL, RPC, Auth/provider, browser/datastore, network, Docker/service, credential, installation, Git mutation, provisioning, activation, deployment or StoreFlow access.

| Command | Result |
|---|---|
| `node scripts/acceptance/pf-mvp-10/package.test.mjs` | `PF-MVP-10 package static assertions: 46 passed`; exit 0 |
| `node --loader ./scripts/typescript-loader.mjs scripts/acceptance/pf-mvp-10/preflight.test.ts` | `PF-MVP-10 injected preflight/orchestration tests: passed`; exit 0 |
| owner-compatible PowerShell 7 `-File scripts/acceptance/pf-mvp-10/runner-boundary.test.ps1` | `PF-MVP-10 production-bridge/process/transcript rehearsal: 15 passed`; exit 0 |
| PowerShell parser over package `*.ps1` | `PF-MVP-10 PowerShell syntax: 5 files clean`; exit 0 |
| `Add-Type -Path scripts/acceptance/pf-mvp-10/BoundedProcess.cs` | `PF-MVP-10 C# bridge: compiled`; exit 0 |
| `node scripts/acceptance/sql-source-structure.mjs <14 package SQL files>` | `PF-MVP-10 SQL lexical structure: 14 files clean`; exit 0 |
| `.\node_modules\.bin\tsc.cmd -p scripts/acceptance/tsconfig.pf-mvp-10.json --noEmit` | no diagnostics; exit 0 |
| `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit` | no diagnostics; exit 0 |
| scoped `git diff --check` | no whitespace errors; exit 0 |

The SQL check is lexical source inspection only. PostgreSQL parsing, migration application, scenario execution, real role/RLS behavior and real concurrency remain **NOT RUN**.

## Preservation and remaining gates

Application/security source and migrations 000000–000039 were not modified in this milestone. Historical manifests were not rewritten. The prior safety-closure manifest and migrations 000038/000039 are re-hashed in the new scoped manifest.

The next gate is independent review of `PF-MVP-10_PRODUCTION_PATH_INTEGRATION_CLOSURE.sha256`. A later protected-execution authorization must supply the exact disposable target/marker, runtime and `psql` executable identities/hashes, credential-file delivery, evidence destination, expiry, scenario list and command-specific permissions. The cleanup command will refuse deletion; environment destruction needs a separate explicit scope. AUTH-02 and direct-table enforcement remain separate gates.
