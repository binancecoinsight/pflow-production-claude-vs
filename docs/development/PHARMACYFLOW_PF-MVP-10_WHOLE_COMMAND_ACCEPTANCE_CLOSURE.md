# PF-MVP-10 Whole-Command Acceptance Closure

Date: 2026-10-31  
Checkpoint: PF-SUP-2026-10-31-01  
Disposition: complete local correction and injected rehearsal; protected execution not run; independent review required

## Delivered correction

`scripts/acceptance/pf-mvp-10/PF-MVP-10_EXECUTION_INVENTORY.sha256` is now the only executable inventory. It contains 61 entries: all 41 active migrations through `20261030000039_entitlement_contract_closure_v1.sql` and the 20 exact C#, PowerShell and SQL dependencies used by execution. Preflight validates the inventory file identity, every entry hash, uniqueness, the exact dependency set, the exact active migration set and the 000039 terminus. Historical review manifests remain unchanged and are neither accepted as execution inventories nor recursively compared with current source.

README commands, the draft authorization example, owner authorization request and actual preflight all select this inventory. The whole-command regression uses this delivered file—not a fabricated replacement—and exercises runtime preflight, migration application, acceptance assertions, concurrency and cleanup through actual authorization parsing, inventory loading, dispatch and result publication. Only protected process execution is replaced by `PfSpyProcessAdapter` and a concurrency process adapter.

Managed dispatch no longer reads `$LASTEXITCODE`. Concurrency returns one structured `{ Success, Frame }` result; missing, multiple or malformed results throw. Rehearsal covers a fresh PowerShell process, null and stale native exit state, successful concurrency, missing permissions, incomplete inventory, cancellation, ownership failure, cleanup refusal and sanitized failure propagation.

Process evidence is fail-closed. Raw stdout, stderr and notices are never persisted. Successful evidence retains only narrowly formatted, expected `PF_PASS`, `PF_RESULT`, `PF_COUNT` or `PF_EVENT` frames. Failures retain only fixed dispositions such as `PF_DIAGNOSTIC|process-failed`. Regressions cover JSON, quoted keys, nested objects, arrays, ordinary text, notices and secret-bearing diagnostics.

## Exact local evidence

| Command | Result |
|---|---|
| `node scripts/acceptance/pf-mvp-10/package.test.mjs` | `PF-MVP-10 package static assertions: 50 passed`; exit 0 |
| `node --loader ./scripts/typescript-loader.mjs scripts/acceptance/pf-mvp-10/preflight.test.ts` | injected preflight/orchestration passed; exit 0 |
| PowerShell 7 `runner-boundary.test.ps1` | production bridge/process/transcript rehearsal `15 passed`; exit 0 |
| PowerShell 7 `command-surface.test.ps1 -Inventory scripts/acceptance/pf-mvp-10/PF-MVP-10_EXECUTION_INVENTORY.sha256` | whole-command surface rehearsal `16 passed`; exit 0 |
| PowerShell parser | `7 files clean`; exit 0 |
| `Add-Type BoundedProcess.cs` | compiled; exit 0 |
| SQL lexical structure inspection | `14 files clean`; exit 0 |
| focused `tsc --noEmit` | no diagnostics; exit 0 |
| root `tsc --noEmit` | no diagnostics; exit 0 |
| scoped whitespace check | clean; exit 0 |

Execution inventory SHA-256: `9763de865c306901a7f991f66d611692e7df723ff51ee28f97c2d842e1c2e5f3`.

These are isolated source, static, compiler and injected-process checks. PostgreSQL parsing/application, SQL/RPC execution, real role/RLS behavior, real concurrency, Auth/provider/browser/datastore/network/service behavior and deployment remain **NOT RUN**.

## Remaining gate

Independent review of the new scoped review manifest is next. Later protected execution authority must bind the owner-supplied target identity and marker, exact PowerShell/psql paths and hashes, credential-file delivery, evidence directory, expiry, scenarios, five command selections and permissions to the execution-inventory hash above. Cleanup remains an evidence-preserving refusal; environment destruction requires separate authority. AUTH-02 and direct-table enforcement remain separate gates.
