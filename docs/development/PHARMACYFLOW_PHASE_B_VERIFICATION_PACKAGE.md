# PharmacyFlow Phase B executable acceptance bundle

Checkpoint: **PF-SUP-2026-10-23-03**  
Preparation status: **REVIEWABLE / UNEXECUTED / OWNER AUTHORIZATION REQUIRED**  
Reviewed source baseline: `main` at `d145324be6d5f1c787bceab6baf27ca0ce375eeb`

This is the entry point for the Phase B acceptance bundle. It prepares, but does not authorize, database, browser, Docker, service, migration, port, credential, deployment or production access. C-01 through C-03 have passed independent local review. C-04 production adapters have passed synthetic review; real React/browser behavior remains open.

## Bundle contents

- `phase-b-acceptance/FIXTURES.json`: fixed synthetic identities, scenario ownership and expected records.
- `phase-b-acceptance/BROWSER_LIFECYCLE_RUNBOOK.md`: isolated-profile, real-component lifecycle and IndexedDB cases.
- `phase-b-acceptance/EVIDENCE_TEMPLATE.md`: per-run evidence, assertion and cleanup forms.
- `phase-b-acceptance/SOURCE_MANIFEST.sha256`: exact reviewed product/test/database sources.
- `phase-b-acceptance/ARTIFACT_MANIFEST.sha256`: exact acceptance-bundle artifacts, excluding itself.

`SOURCE_MANIFEST.sha256`, `ARTIFACT_MANIFEST.sha256`, and `RELEASE_CANDIDATE_MANIFEST.sha256` are historical prepared snapshots and are not silently refreshed or promoted by this batch. PF-SUP-2026-10-25-12 reviewed the prior 30-file correction snapshot. `M1_M4_REVIEW_MANIFEST.sha256` is now the proposed current 32-file handoff snapshot: it retains that reviewed source set and adds the corrected authorization proposal plus decision packet and their record updates. It is not a release manifest, staging instruction, execution approval, or Git history. The documentation-only handoff delta still requires ordinary incremental review before inclusion in any future release snapshot.
- `phase-b-acceptance/AUTHORIZATION_REQUEST.md`: one exact proposed target/gate/command/write/service/browser/cleanup authorization.
- `phase-b-acceptance/REFUND_V2_CLEANUP.md`: privileged cleanup behavior and limits.
- `scripts/phase-b-acceptance/gate-ab-fixture.sql`: committed Gate A/B fixture with collision/schema guards.
- `scripts/phase-b-acceptance/gate-a-assertions.sql`: executable status-v2 role/ownership matrix.
- `scripts/acceptance/status-v2-postgrest.mjs`: genuine anonymous/authenticated PostgREST status-v2 matrix, source-hash and fixed-subject token guarded; unexecuted.
- `scripts/phase-b-acceptance/gate-b-sequential.sql`: executable M-18 replay/conflict/rollback assertions.
- `scripts/phase-b-acceptance/gate-b-concurrency.ps1`: independent-session M-18 concurrency runner.
- `scripts/phase-b-acceptance/gate-ab-cleanup.sql`: identity-guarded privileged cleanup and zero-root proof.
- Existing Refund V2 executors: `scripts/run-refund-v2-local.ps1` and `scripts/run-refund-v2-concurrency.ps1`.

The fixed UUIDs are test data, not credentials. Database fixture materialization must occur only on an owner-approved disposable PharmacyFlow target. Commands containing `$env:PF_ACCEPTANCE_DATABASE_URL`, `$env:PF_ACCEPTANCE_TARGET_ID` or a browser profile path are **instructions for a later authorized run**, not commands executed during preparation.

## Evidence classes

| Label | Meaning | What it does not prove |
|---|---|---|
| `STATIC` | Source, manifest or migration text inspected without executing the system. | Runtime behavior, SQL validity or authorization behavior. |
| `SYNTHETIC` | Local fake-IndexedDB, in-memory or injected-adapter suite executed. | PostgreSQL/PostgREST behavior or real React/browser lifecycle behavior. |
| `REAL-DB` | Queries/RPCs executed against the positively identified disposable PostgreSQL target. | Browser behavior or deployed production behavior. |
| `REAL-BROWSER` | Real components exercised in an isolated browser profile against the approved disposable target. | Production deployment acceptance. |

Never relabel a source-string assertion, helper assertion or fake IndexedDB test as `REAL-DB` or `REAL-BROWSER`.

## Mandatory preflight and stop rules

Run from the repository root in PowerShell. The source check is read-only:

```powershell
$expectedHead = 'd145324be6d5f1c787bceab6baf27ca0ce375eeb'
if ((git branch --show-current) -ne 'main') { throw 'ABORT: branch is not main' }
if ((git rev-parse HEAD) -ne $expectedHead) { throw 'ABORT: HEAD differs from approved baseline' }
$manifest = 'docs/development/phase-b-acceptance/SOURCE_MANIFEST.sha256'
Get-Content -LiteralPath $manifest | ForEach-Object {
  if ($_ -match '^([0-9a-f]{64})  (.+)$') {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $Matches[2]).Hash.ToLowerInvariant()
    if ($actual -ne $Matches[1]) { throw "ABORT: source hash mismatch: $($Matches[2])" }
  }
}
```

For an external run, the owner must supply every value below; do not infer any of them:

```powershell
$env:PF_ACCEPTANCE_TARGET_ID = '<owner-approved PharmacyFlow disposable target ID>'
$env:PF_ACCEPTANCE_EXPECTED_TARGET_ID = '<same exact target ID from authorization>'
$env:PF_ACCEPTANCE_DATABASE_URL = '<credential supplied out of band>'
$env:PF_ACCEPTANCE_DB_CONTAINER = 'supabase_db_<exact authorized target ID>'
$env:PF_ACCEPTANCE_EDGE_CONTAINER = 'supabase_edge_runtime_<exact authorized target ID>'
$env:PF_ACCEPTANCE_API_CONTAINER = 'supabase_kong_<exact authorized target ID>'
$env:PF_ACCEPTANCE_DB_PORT = '<exact authorized loopback PostgreSQL port>'
$env:PF_ACCEPTANCE_EXPECTED_DB_PORT = '<same port copied from the signed authorization>'
$env:PF_ACCEPTANCE_API_URL = 'http://127.0.0.1:<exact authorized API port>'
$env:PF_ACCEPTANCE_EXPECTED_API_URL = 'http://127.0.0.1:<same API port copied from the signed authorization>'
$env:PF_ACCEPTANCE_SERVICE_ROLE_KEY = '<credential supplied out of band>'
$env:PF_ACCEPTANCE_ANON_KEY = '<credential supplied out of band>'
$env:PF_ACCEPTANCE_BROWSER_PROFILE = '<new empty profile directory dedicated to this run>'
if ($env:PF_ACCEPTANCE_TARGET_ID -cne $env:PF_ACCEPTANCE_EXPECTED_TARGET_ID) { throw 'ABORT: target identity mismatch' }
```

Before mutation, capture target identity, PostgreSQL version, migration history, current database name/server address, Supabase project reference/CLI version if applicable, Edge runtime/version, browser name/version, OS, Node/npm and the source manifest. Store credentials only in the current process environment, pass them directly to the intended client, never read them from container inspection, never place them in command arguments or files, and never write them to stdout/stderr/evidence. Clear the process variables after the run.

Abort before or during execution if any of the following is true:

- branch, HEAD, source hash, migration checksum or function hash differs from the approved values;
- target ID is absent, ambiguous, shared, production, or not the exact authorized PharmacyFlow disposable target;
- any target, service, credential, dataset or browser state belongs to StoreFlow; StoreFlow access is permanently prohibited for this workstream and cannot be authorized by a Phase B request;
- the browser profile is not new/isolated or contains unrelated PharmacyFlow data;
- required PostgreSQL 17 behavior or a required RPC/migration is unavailable;
- fixture UUID/name collision exists outside this bundle;
- tenant leakage, unauthorized disclosure, duplicate financial/stock effect, partial nonce consumption, unclassified response or cleanup uncertainty occurs;
- source changes after preflight; restart authorization review rather than continuing.

## Required runtime record

Preparation host observed on 2026-10-23: Windows PowerShell `5.1.26100.9711`, Git `2.51.2.windows.1`, Node `24.11.0`, npm `11.6.1`. Locked packages: React/React DOM `19.3.1`, Vite `8.3.4`, TypeScript `7.0.2`, fake-indexeddb `6.2.6`, Supabase JS `2.118.0`. `supabase/config.toml` selects PostgreSQL major `17`.

The external run must capture its actual versions. A difference is a review event, not an automatic substitution. Node dependencies must already match `package-lock.json`; this bundle does not authorize installation. Browser acceptance requires a current owner-approved Chromium-family browser with IndexedDB and DevTools protocol support; record the exact build. Database acceptance requires a clean disposable PostgreSQL 17 PharmacyFlow schema with the reviewed migration chain. Do not execute against an upgraded or shared target merely because it is reachable.

## Local synthetic commands

These commands do not access a database or browser. Re-run only if separately desired as part of the approved evidence session; record stdout, stderr, exit code and UTC start/end time.

```powershell
& npm.cmd run lint
node --loader ./scripts/typescript-loader.mjs src/lib/offline/phaseB.test.ts
node --loader ./scripts/typescript-loader.mjs src/lib/pos/pos.test.ts
node --loader ./scripts/typescript-loader.mjs src/components/pos/posUi.test.ts
node --loader ./scripts/typescript-loader.mjs src/lib/sales/sales.test.ts
node --loader ./scripts/typescript-loader.mjs src/components/sales/receipts.test.ts
node --loader ./scripts/typescript-loader.mjs supabase/functions/sync-push-sale/index.test.ts
& npm.cmd run test:critical
& npm.cmd test
```

Expected: zero exit codes and the assertion counts recorded verbatim. These are `SYNTHETIC`; they do not close any real-system gate.

## Database execution model

Use `psql -X -v ON_ERROR_STOP=1` so user startup files cannot alter behavior. The exact connection form for every database worksheet is:

```powershell
& psql.exe "$env:PF_ACCEPTANCE_DATABASE_URL" -X -v ON_ERROR_STOP=1 -f '<reviewed-sql-file>'
if ($LASTEXITCODE -ne 0) { throw 'ABORT: psql worksheet failed' }
```

The concrete Gate A/B fixture is `scripts/phase-b-acceptance/gate-ab-fixture.sql`. It verifies PostgreSQL/M-18/status-v2 prerequisites, rejects fixture-root collisions, suppresses the auth bootstrap trigger only around fixed `auth.users` inserts, restores normal trigger behavior, builds the complete graph and commits it for cross-session visibility.

The exact authorized Gate A/B command sequence is:

```powershell
Get-Content -Raw -LiteralPath '.\scripts\phase-b-acceptance\gate-ab-fixture.sql' | docker exec -i $env:PF_ACCEPTANCE_DB_CONTAINER psql -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1
Get-Content -Raw -LiteralPath '.\scripts\phase-b-acceptance\gate-a-assertions.sql' | docker exec -i $env:PF_ACCEPTANCE_DB_CONTAINER psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
Get-Content -Raw -LiteralPath '.\scripts\phase-b-acceptance\gate-b-sequential.sql' | docker exec -i $env:PF_ACCEPTANCE_DB_CONTAINER psql -U postgres -d postgres -X -v ON_ERROR_STOP=1
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\scripts\phase-b-acceptance\gate-b-concurrency.ps1'
Get-Content -Raw -LiteralPath '.\scripts\phase-b-acceptance\gate-ab-cleanup.sql' | docker exec -i $env:PF_ACCEPTANCE_DB_CONTAINER psql -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1
```

The setup and cleanup require an explicitly authorized administrative database role capable of transaction-local `SET session_replication_role`. Ordinary application credentials are insufficient and must not be substituted.

### Transaction policy

Status-v2 read cases and single-session M-18 negative/rollback cases may use `BEGIN ... ROLLBACK` after fixture setup. The following require committed fixtures in a disposable target because independently connected sessions must see the same rows:

- M18-CONC-01 concurrent exact operation/hash replay;
- M18-CONC-02 distinct operation IDs competing for one checkout intent;
- RV2-CONC-001 through RV2-CONC-007 in the existing runner;
- browser upgrade, two-tab initialization, lease contention, restart and lost-response cases;
- any PostgREST/Edge call made from a session other than the fixture connection.

An enclosing transaction in the setup session **does not verify** these cases. Commit only the uniquely named bundle fixture, run the cases, then execute the reviewed identity-guarded cleanup. Never use a broad cascade or a cleanup query that is not constrained by the fixed pharmacy/user IDs and names.

Both concurrency runners use `scripts/acceptance/concurrency-harness.ps1`. Each session commits readiness from its actual PostgreSQL backend into a unique per-run, comment-identified barrier object and begins the protected RPC only after the parent observes two distinct backend PIDs. Readiness alone does not qualify. After release, the harness must observe both named RPC sessions active in `pg_stat_activity` and at least one with `wait_event_type = 'Lock'` before either completes. Results must contain exactly one `PF_RESULT|...` marker per session. Contended cases compare the exact unordered two-result set, because backend scheduling cannot assign the winner safely; aggregate effect assertions identify exactly one winner. Readiness, lock-contention and completion waits are bounded. On timeout, exact application-named database sessions are cancelled and, if necessary, terminated; zero remaining database sessions must be proven before the identity-guarded barrier is dropped. Stopping a local PowerShell job is never cleanup proof. Missing contention, malformed results, identical backends, timeout, rollback/effect mismatch, surviving sessions or auxiliary-object identity mismatch fails the gate.

## Gate A: status-v2 authorization and authorized absence

Prerequisite: apply the unexecuted `20261014000026_client_operation_status_v2.sql` only to the approved disposable target, after checksum and migration-order review. This is `REAL-DB`, not deployment.

Use the A-series fixtures and role matrix from `FIXTURES.json`. `status-v2-postgrest.mjs` is the required genuine PostgREST path: supply an exact-target anon JWT and eight distinct authenticated JWTs signed only for the approved disposable target and matching the fixed fixture subjects. Actor `iat`/`exp` lifetime is at most 15 minutes. The runner rejects secret/service inputs and verifies decoded claim shape, subject, role/audience, target reference, exact `${PF_ACCEPTANCE_API_URL}/auth/v1` issuer, usable lifetime, and owner-approved runner/migration hashes before target inspection or HTTP. Those decoded claims are explicitly **not** local signature proof. Future signature acceptance requires the approved gateway plus an altered-signature negative control and issuance attestation under separate authority; this package retrieves no key and issues no token. HTTP is bounded and redirects outside the exact origin fail. The direct SQL worksheet remains transaction-local administrative characterization only. Record the path used; never relabel SQL claim simulation or injected orchestration as signature/grant/RLS acceptance.

| Case | Call | Required assertion |
|---|---|---|
| A-01 | anonymous/inactive/tenant-B -> tenant-A present and absent op IDs | both fail `42501 OPERATION_STATUS_FORBIDDEN`; no present/absent distinction |
| A-02 | owner/manager/pharmacist -> own-tenant unified sale and return evidence | authorized evidence; exact tenant/op/hash/record identity; no tenant-B row |
| A-03 | cashier A -> own sale, cashier B sale | own evidence allowed; other sale `42501`, never `CONFIRMED_ABSENT` |
| A-04 | return author and original-sale cashier -> V1/V2 return | both allowed; unrelated cashier `42501` |
| A-05 | incomplete/journal-only evidence | authorized actor/management gets `UNKNOWN`, `IN_PROGRESS` or `CONFLICT`; never committed/absent |
| A-06 | legacy stock journal | authorized actor/management gets `UNKNOWN`; unrelated actor denied |
| A-07 | genuinely unused op UUID | active tenant member gets structurally empty `CONFIRMED_ABSENT` only after fixture inventory proves no sale/return/journal |

For every call capture caller ID/role/status, tenant/branch, SQLSTATE/message, returned row, and the underlying row inventory. Abort on membership-wide financial disclosure, cross-tenant evidence or authorized absence for any existing inaccessible record.

## Gate B: M-18 replay, conflict, rollback and concurrency

Use the M18-series graph. Capture before/after counts and exact rows for `sales`, `sale_items`, `sync_journal`, `sync_nonces`, `stock_ledger`, `inventory_batches`, `offline_stock_deficits` and `late_cash_sale_exceptions`.

| Case | Execution | Required assertion |
|---|---|---|
| M18-01 | first valid RPC with exact payload bytes/hash | one `COMMITTED` sale/journal; one item/stock effect; nonce consumed |
| M18-02 | same client op/hash with fresh nonce | `ALREADY_COMMITTED`; original response; no second business effect |
| M18-03 | same client op, changed hash | typed idempotency conflict; transaction rolls back nonce and all new effects |
| M18-04 | different op, same checkout intent | PostgreSQL `23505`, constraint `uq_sales_pharmacy_checkout_intent`; gateway `CHECKOUT_CONFLICT`; no retry loop |
| M18-05 | injected/characterized unrelated unique violation | sanitized generic gateway result; constraint/detail absent from client body |
| M18-06 | force failure after nonce/journal insertion | no nonce, pending journal or financial/stock residue |
| M18-CONC-01 | two sessions, exact op/hash, distinct nonces | one commit plus one exact replay; one logical sale/stock effect |
| M18-CONC-02 | two sessions, distinct ops, same checkout | one commit plus one checkout conflict; losing nonce/journal/effects roll back |

For concurrent cases, open two independent `psql -X` processes against the committed fixture and release them with the same recorded barrier timestamp. Record backend PIDs, lock waits, durations and raw outcomes. The gateway portion must use the actual PostgREST error object and the reviewed Edge adapter; direct SQL alone cannot prove normalization or dispatcher terminal behavior.

`gate-b-concurrency.ps1` performs the two independent-session cases and asserts `1|1|2|1|1|1|1`: one replay sale and stock effect, both valid replay nonces, exactly one competing-checkout sale and stock effect, and exactly one winning nonce and journal across the two contenders. M18-05 gateway sanitization remains a real PostgREST/Edge check; the exact local synthetic precursor is `node --loader ./scripts/typescript-loader.mjs supabase/functions/sync-push-sale/index.test.ts`.

## Gate C: Refund V2 compatibility

After target identity and script review, the existing exact commands are:

```powershell
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-refund-v2-local.ps1
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-refund-v2-concurrency.ps1
```

Both scripts require the same explicitly authorized PharmacyFlow disposable identity used by every Gate A/B and Edge runner and perform the shared pre-access identity checks. If the authorized target differs, stop and review a refreshed manifest and authorization; do not edit or bypass guards during execution. The concurrency runner commits a uniquely identified fixture because separate sessions require visibility, then performs identity-guarded cleanup.

The cleanup connects as `supabase_admin`, sets `session_replication_role=replica`, and therefore bypasses immutable ledger/audit/sale triggers for the fixed fixture only. Review `phase-b-acceptance/REFUND_V2_CLEANUP.md` before authorizing it. This elevated write is mandatory to name explicitly in the authorization and must never be generalized to other IDs or targets.

Required evidence: exact replay, changed-hash rollback, concurrent over-return prevention, item allocation, one inventory restoration, nonce/journal behavior, Edge V2 route and unchanged V1 behavior. Preserve sealed migrations and the Refund V2 request/response contract. Abort on a second return/stock effect, V1/V2 routing drift or incomplete cleanup.

## Gates D-F: browser, recovery and identity transitions

Execute `phase-b-acceptance/BROWSER_LIFECYCLE_RUNBOOK.md` in a new isolated profile. It covers real components, IndexedDB v3-to-v4 preservation, two-tab initialization, aborted post-request transactions, lease contention, restart/recovery, consecutive customers/receipts, delayed customer creation, barcode lookup, duplicate selection, product search, checkout replacement, scope changes and unmount.

The page must be the reviewed application source connected only to the approved disposable target. Network interception/delay may be provided by the browser automation layer, but assertions must observe the production `PosView`, `CartPanel` and `ProductSearch` state transitions—not call `CheckoutAsyncBoundary` directly. Record DOM-visible state, accessibility names, network counts, checkout/scope IDs and IndexedDB exports.

## Evidence directory and result rule

Create one new evidence directory outside tracked source for the authorized run:

```powershell
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$evidence = Join-Path $env:TEMP "pharmacyflow-phase-b-$stamp"
New-Item -ItemType Directory -Path $evidence -ErrorAction Stop | Out-Null
Copy-Item -LiteralPath 'docs/development/phase-b-acceptance/EVIDENCE_TEMPLATE.md' -Destination (Join-Path $evidence 'RESULTS.md')
```

Copy raw sanitized command logs, row snapshots, concurrency timelines, browser screenshots/traces, IndexedDB exports and cleanup proof there. Never copy credentials, JWTs, private keys or signatures.

A gate passes only when every required assertion has real evidence, cleanup is proven, and an independent reviewer signs the finding table. A failed/ambiguous case stops its gate. Green local suites do not accept Phase B. Deployment remains unauthorized.

## Cleanup and rollback

- Single-session characterization: `ROLLBACK`; prove before/after fixture counts and checksums match.
- Committed DB fixtures: run a separately reviewed cleanup constrained to the exact fixture pharmacy/user IDs and expected names; prove zero remaining fixture rows and unchanged non-fixture counts.
- Browser: export evidence first, close all tabs, delete only the resolved isolated profile directory after verifying it equals the owner-approved path. Do not clear a normal browser profile.
- Services: stop only services started for this run and record process/container identity. No service start/stop is authorized by this document.
- On cleanup failure, preserve the disposable target, mark the run failed and request owner direction; do not improvise destructive cleanup.

## Authorization required to execute

The owner must explicitly authorize: (1) the exact PharmacyFlow disposable target ID and database/project identity; (2) migration replay and status-v2 execution on that target; (3) fixture commits and the specifically listed elevated, identity-guarded cleanup writes; (4) database/PostgREST/Edge/service and port access; (5) a named isolated browser profile and real-browser datastore/network use; (6) the exact command groups/gates to run; and (7) evidence storage location/retention. Deployment, production access and Git mutation require separate authorization and are not implied.

StoreFlow access is permanently prohibited for this workstream and cannot be granted by that authorization.
