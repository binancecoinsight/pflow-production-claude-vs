# PharmacyFlow BLK-002 ACC-01 local acceptance-harness report

Date: 2026-10-26  
Baseline: owner-supplied `PF-SUP-2026-10-26-07`  
Authority: owner message `PHARMACYFLOW — ACC-01 LOCAL ACCEPTANCE-HARNESS AUTHORING`  
Disposition: **LOCAL HARNESS AUTHORED — PURE/INJECTED/STATIC VERIFIED — ALL PROTECTED ACCEPTANCE NOT RUN — STOP FOR INDEPENDENT REVIEW**

## Result

ACC-01 produced a new package only under `scripts/acceptance/i3a/`, this report, append-only ledger entries and a new scoped SHA-256 manifest. Application/façade/test implementation and migrations 000027–000032 were not edited. Historical manifests were preserved.

The package contains pure TypeScript authorization/orchestration/evidence contracts, injected synthetic tests, a focused TypeScript project, dormant PowerShell executors, guarded fixture/ACL/RLS/state/concurrency/cleanup SQL sources, a deliberately non-authorizing JSON template, and operator documentation. Imports have no connection, discovery, subprocess, environment/credential, provider, Auth or browser side effects.

## Fail-closed preparation

Before future `psql` access, both TypeScript and PowerShell guards require the exact target `pharmacyflow-i3a-acceptance-20261026`, database service/name/loopback port, command allowlist, fixed fixtures and canonical digest, complete source/runner/migration hash inventory, package-manifest hash, authorization ID/scope/expiry, evidence root, scenario-body hashes, fixture-only cleanup, disabled provider/Auth/browser flag and an ephemeral `PGSERVICEFILE` path. No resource enumeration is used. The checked-in example is `NOT_AUTHORIZED`.

The synthetic test exercised successful injected orchestration and ten authorization/target/hash/fixture/cleanup/disabled-stage/expiry failures. Every rejected case made zero executor calls. It also rejected synthetic concurrency as PostgreSQL acceptance, rejected duplicate backend IDs, accepted a structurally valid executed-evidence example, and verified evidence redaction. These are model checks only.

## Verification performed

| Command | Exact result | Limitation |
|---|---|---|
| `node --loader ./scripts/typescript-loader.mjs ./scripts/acceptance/i3a/synthetic.test.ts` | exit 0; `ACC-01 I3A pure/injected synthetic tests: passed (zero real external calls)` | Injected local model; no process/network/database/provider/Auth/browser call |
| `node ./scripts/acceptance/i3a/static.test.mjs` | exit 0; `ACC-01 I3A static contract tests: passed` | Source-string/static assertions only |
| `.\node_modules\.bin\tsc.cmd -p .\scripts\acceptance\i3a\tsconfig.json --noEmit` | exit 0; no diagnostics | Focused harness compile only |
| PowerShell `[scriptblock]::Create(...)` for `preflight.ps1`, `executor.ps1`, `concurrency-runner.ps1` | 3/3 `PARSE_OK` | Parser-only; none of the scripts was invoked |
| `git diff --check` | exit 0; no output | Whitespace check only; no Git mutation |

The three executable checks above were repeated after documentation edits with the same results. No unchanged root application test was rerun.

## Evidence boundaries

**AUTHORED/SYNTHETICALLY TESTED:** fail-closed pure preflight, injected executor separation, evidence sanitization, structural concurrency qualification, exact-signature/RLS source assertions, guarded fixture ownership/cleanup, matrix labels, dormant runner guards, commands and inventories.

**SQL SOURCE REASONING ONLY:** signature ACL queries, forced-RLS catalog assertions, authority/collision/recovery/atomicity/revocation/replay/parity/continuation case plans, fixture DML, cleanup dependency guards and concurrency protocol. SQL was not parsed by PostgreSQL or executed.

**NOT RUN / NOT ACCEPTED:** migration replay/application; PostgreSQL syntax/ACL/RLS/transactions/rollback/concurrency; fixture writes/cleanup; Auth/JWT issuance or mapping; provider lookup/create/proven-absence feasibility; browser/storage/UI continuation; Docker/services/ports/network; credentials; identity provisioning; signup; activation; deployment. Sequential/static/synthetic evidence is not PostgreSQL concurrency evidence.

## Decisions and remaining gates

- `REV-LIN-01` remains an owner decision. Proposed default: a call linearizes at its successful authoritative registry/version/action check; revocations committed before deny, revocations committed after do not cancel the in-flight transaction. Strong cancellation/fencing needs a reviewed SQL change.
- Recovery remains conservative: exact `FOUND` may finalize the original durable binding under current recovery authority; `UNKNOWN`, timeout, malformed evidence and `PROVEN_ABSENT` remain pending and never trigger another create.
- Absence proof is required only if a future approved protocol permits retry-after-absence. This one does not.
- Provider/Auth/browser adapters and stages remain absent and disabled. Identity-provider selection, workload/operator runtime mapping and authority provisioning remain open.
- A later execution request must supply a positive exact authorization envelope, approved target/credential delivery, reviewed scenario bodies, fixture/evidence/cleanup permissions and the owner decision above. AUTH-02 remains deferred.

Stop at this package for independent review. No acceptance execution or dependent I3A work is implied.
