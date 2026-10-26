# PharmacyFlow MVP test evidence register

## Review reconciliation / I3A design evidence — 2026-10-26

No unchanged implementation test was rerun. Pre-edit read-only SHA-256 verification found `BLK002_I3_FINAL_BOUNDARY_PARITY_MANIFEST_PF-SUP-2026-10-26-04.sha256` matching 12/12 and migrations 000027–000032 unchanged. After reconciliation, its implementation/configuration entries remain matching and the new manifest captures intentionally advanced shared ledgers. Owner-supplied transcript evidence attributes technical dispositions to PF-SUP-02/05/06 but the repository review export remains absent. I3A matrices and proposed commands are design artifacts only: PostgreSQL/ACL/RLS, rollback/concurrency, Auth/provider and browser cases are **NOT RUN / NOT VERIFIED**. AUTH-02 remains deferred.

## BLK-002-I3 conditional gate assessment — 2026-10-26

No injected/static/type suite was executed for this planning-only assessment because the attached authorization requires stopping before implementation when independent I2 acceptance cannot be verified. Read-only evidence executed: branch `main`, HEAD `d145324be6d5f1c787bceab6baf27ca0ce375eeb`, dirty-tree inspection, review-artifact search and historical I2 manifest comparison. Result: 6/12 historical entries still match; the stable model/test/design/review/migration artifacts match, while six shared ledgers have advanced. This is hash/inventory evidence only—not independent I2 acceptance, I3 test evidence, PostgreSQL/Auth/provider/browser/concurrency evidence or permission to execute protected work.

## BLK-002-I3 local authoring evidence — 2026-10-26

All entrypoints were inspected before execution. New sources are dependency-injected and have no HTTP server, environment lookup, backend client, production provider or credential.

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs supabase/functions/owner-eligibility-gateway/index.test.ts` | 16 passed | In-memory authority/repository/provider mocks only |
| `node --loader ./scripts/typescript-loader.mjs supabase/functions/platform-admission-operator/index.test.ts` | 17 passed | In-memory authority/repository and sequential states only |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_gateway_operator_v1.test.ts` | 42 passed | Static source/SQL/grant/lock/hash assertions; no PostgreSQL execution |
| Corrected I2 + existing focused issuer/onboarding suites | 44 + 39 + 53 + 28 passed | Injected/static/synchronous only |
| Focused strict TypeScript over seven new I3 source/test/contract files | PASS | Compile-time evidence only |

One initial static I3 run failed because a comment contained a token checked by the inactive-entrypoint assertion. The comment was reworded and the corrected suite passed 42/42; runtime behavior was unchanged. PostgreSQL/RLS/concurrency, Auth/provider, browser, credentials, role mapping, deployment and activation remain **NOT RUN / NOT VERIFIED**.

## PF-SUP-2026-10-26-01 corrected I2 evidence

Inspected entrypoints remain local pure/injected/static TypeScript with Node's local SHA-256 implementation. They contain no database, network, Auth/provider, Docker, service/port, credential or browser-storage adapter.

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs scripts/specification/blk002-i2-security-contract.test.ts` | 44 passed | Staged atomicity/audit failure, trusted recovery authorization, typed-command fingerprints, rotation, deep immutable replay and sequential order model only. |
| `node --loader ./scripts/typescript-loader.mjs supabase/functions/owner-eligibility-issuer/index.test.ts` | 39 passed | Injected issuer/provider/repository mocks only. |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_eligibility_issuer_v1.test.ts` | 53 passed | Static/synchronous SQL/source assertions; not PostgreSQL concurrency. |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_onboarding_v1.test.ts` | 28 passed | Static/synchronous onboarding model; not SQL concurrency. |
| `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --types node --strict scripts/specification/blk002-i2-security-contract.ts scripts/specification/blk002-i2-security-contract.test.ts` | PASS | Focused strict typecheck after correcting two test-only excess-property typing errors found by the first post-correction run. |

No PostgreSQL/RLS, real concurrency, Auth/provider, gateway, browser, deployment or activation evidence was produced. The audit boundary and single state-root swap are specification-model constructs, not proof of database atomicity.

## BLK-002-I2 local design evidence — 2026-10-26

Inspected entrypoints were local TypeScript models/static readers with no database, network, Auth provider, Docker, service, credential or browser-storage adapter. Fresh results:

| Command | Result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs scripts/specification/blk002-i2-security-contract.test.ts` | 28 passed | Injected in-memory ADM-01/REV-01, identity, idempotency, recovery and serialized race model only. |
| `node --loader ./scripts/typescript-loader.mjs supabase/functions/owner-eligibility-issuer/index.test.ts` | 39 passed | Injected issuer/provider/repository mocks only. |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_eligibility_issuer_v1.test.ts` | 53 passed | Static/synchronous SQL/source assertions; not PostgreSQL concurrency. |
| `node --loader ./scripts/typescript-loader.mjs supabase/contracts/owner_onboarding_v1.test.ts` | 28 passed | Static/synchronous onboarding model; not SQL concurrency. |
| `node node_modules/typescript/bin/tsc --ignoreConfig --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict scripts/specification/blk002-i2-security-contract.ts scripts/specification/blk002-i2-security-contract.test.ts` | PASS | Focused strict typecheck of the I2 model/tests. |

No real PostgreSQL/RLS, Auth/provider, gateway, browser/IndexedDB, deployment or concurrency acceptance was executed. The I2 architecture is conditional pending exact-operation provider recovery and workload-identity evidence.

An initial focused compiler invocation without TypeScript 7's required `--ignoreConfig` option exited with `TS5112`; the corrected command above passed. This was a command-line configuration failure, not a source-test failure.

Baseline: 2026-10-23. Evidence classes are deliberately separate; a source assertion is not browser or database acceptance.

## PF-SUP-2026-10-25-17 BLK-002-I1 correction evidence

Executed locally with the existing TypeScript loader: focused injected issuer correction tests and the focused static/synchronous issuer contract model. Coverage includes pending retry without backward transition/provider work, order-independent required marker fields, competing first reservation conflicts, reservation/provider/correlation response loss, restart, confirmed exact-operation recovery, unrelated confirmed/staff non-mutation, stale/revoked denial and exact ACTIVE/CONSUMED recovery.

These are pure injected/static/synchronous results only. SQL source inspection reasons about advisory locks, row locks, state transitions, RLS policy text and grants; it does not execute PostgreSQL or prove concurrency. Auth/provider, email confirmation, JWT subject binding, browser recovery, effective privileges, migration compatibility, database rollback and rollout remain **NOT RUN / NOT VERIFIED**. Signup and production providers remain disabled; gateway grants remain absent; AUTH-02 remains **NOT RUN — OWNER DEFERRED**.

## PF-SUP-2026-10-25-15 independent review and design-only handoff

The owner supplied the independent disposition for the reviewed 16-file BLK-002 correction snapshot: prior demonstrated P1 source findings are addressed; client 30/30, static/synchronous model 28/28, staff bootstrap 20/20, TypeScript and manifest 16/16 pass; no new P0/P1 was demonstrated. Effective SQL privileges, Auth/provider behavior, browser behavior and rollout remain unverified. This review grants no execution/deployment authority and does not complete M4 or MVP.

The PF-SUP-2026-10-25-15 follow-on contains documents only: trusted issuer design, effective-privilege acceptance matrix, prepared acceptance cases, next authorization choice and governance updates. Only content/hash checks are permitted for this design snapshot; unchanged behavioral suites are not rerun. AUTH-02 remains **NOT RUN — OWNER DEFERRED**.

## PF-SUP-2026-10-25-14 correction evidence

Scope is the reviewed BLK-002 local authoring batch only. Permitted checks are TypeScript compilation, injected provider tests, synchronous in-memory models, static source assertions and byte hashes. Fresh focused results: client policy 30/30, migration/static synchronous model 28/28, staff bootstrap 20/20, and `tsc --noEmit` pass. Regressions cover zero Auth calls when deployment is unavailable, typed staff-to-owner denial, separation of membership resolution from onboarding, reservation mismatch denial, confirmed-identity non-mutation, provider-operation ambiguity failure, exact replay and idempotent partial-failure retry. These checks do **not** execute SQL, Auth, PostgREST, RLS, concurrency, browser storage or deployment. AUTH-02 remains **NOT RUN — OWNER DEFERRED**.

## PF-SUP-2026-10-25-12 independent review evidence

Evidence source: independent supervisor disposition supplied by the owner on 2026-10-25. Scope: the 30-file correction snapshot only. Disposition: BLK-015–017 source/synthetic corrections reviewed; no new P0/P1; P2 stale authorization-request hash identified for local reconciliation. This is prior independent review evidence, not a fresh Codex execution result and not MVP, release, browser, Auth/PostgREST, database, concurrency, cleanup, deployment or production acceptance.

This handoff batch ran only byte/hash/content verification after documentation changes; unchanged behavioral suites were not rerun. `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-m1-m4-docs.ps1` passed 32/32 files and hashes. The injected PowerShell content check for the current/historical runner hashes and BLK-002/003/004/005/009/013, AUTH-03 and AUTH-02 packet sections passed 10/10. These are read-only documentation-integrity checks, not behavioral or external acceptance. AUTH-02 remains **NOT RUN — OWNER DEFERRED**.

## PF-SUP-2026-10-25-11 local closure evidence

Executor: **GPT-5.6 Sol / Codex local workspace agent**. Date: **2026-10-25 (Africa/Lagos)**. Scope: existing-dependency syntax/TypeScript, injected runner behavior, synchronous specification models and byte/hash verification only.

| Exact command | Result | Evidence scope |
|---|---:|---|
| `node --check scripts/acceptance/status-v2-postgrest.mjs` and the corresponding `status-v2-postgrest.test.mjs`, `edge-fixture-cleanup.mjs`, `edge-fixture-cleanup.test.mjs` checks | PASS; each exit 0 | JavaScript syntax only |
| `node scripts/acceptance/status-v2-postgrest.test.mjs` | 41 assertions; injected orchestration 23/23; exit 0 | Decoded-unverified credential policy, zero-call preflight failures, exact fixture provenance/timestamps, malformed evidence, redirect refusal and bounded timeout using injected adapters; no HTTP/Docker/credentials |
| `node scripts/acceptance/edge-fixture-cleanup.test.mjs` | PASS; exit 0 | Static/injected bidirectional known-user identity, original-root proof parsing, ambiguous-create constraint and cleanup control flow; no Auth/SQL |
| `node --loader ./scripts/typescript-loader.mjs ./scripts/specification/commercial-model.test.ts` | 45 passed; exit 0 | Synchronous design-model transitions, compensation replay/conflict/bounds, ambiguity holds and lock-order declarations; not PostgreSQL concurrency |
| `node --loader ./scripts/typescript-loader.mjs ./src/lib/subscription/capabilityBoundary.test.ts` | 9 passed; exit 0 | Async boundary scope/expiry/renewal invalidation and busy-reset signal; not actual React/browser behavior |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-acceptance-runner-claims.ps1` | 45/45 passed; exit 0 | Static source claims only; not runner behavior or external acceptance |
| `npm.cmd run lint` | PASS; `tsc --noEmit` exit 0 | Repository TypeScript compilation only |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-m1-m4-docs.ps1` | 30/30 files and hashes passed; exit 0 | Reads file bytes and verifies the proposed current snapshot; not Git history or external evidence |

An initial added timeout assertion expected a custom error but observed the default `AbortError`; the runner was corrected to attach an explicit bounded-timeout reason, then the status test passed 41 assertions. PF-SUP-2026-10-25-12 subsequently completed the required scoped review of BLK-016/017. JWT signatures, Auth, PostgREST, grants/RLS, databases, SQL, Docker, services, ports, browser storage and concurrency remain **NOT RUN — OWNER DEFERRED** under AUTH-02; review did not grant execution approval.

Executor for fresh -08 checks: **GPT-5.6 Sol / Codex local workspace agent**. Execution date: **2026-10-23 (Africa/Lagos)**. Scope: repository reads, untracked Markdown byte reads/hashes, static runner inspection, and isolated specification-model execution only.

## PF-SUP-2026-10-25-09 freshly executed evidence

Executor: **GPT-5.6 Sol / Codex local workspace agent**. Date: **2026-10-25 (Africa/Lagos)**. No external runner was invoked.

| Exact command | Result | Evidence scope |
|---|---:|---|
| `node --check scripts/acceptance/edge-fixture-cleanup.mjs; node --check scripts/run-edge001-disposable.mjs; node --check scripts/run-edge002-disposable.mjs; node --check scripts/run-edge003-disposable.mjs` | PASS; exit 0 | JavaScript syntax only |
| `node scripts/acceptance/edge-fixture-cleanup.test.mjs` | PASS; exit 0 | Injected/static identity guards, ambiguous Auth-create cleanup, zero-root parsing, and success/failure cleanup control flow; no database/Auth access |
| `node scripts/acceptance/target-guard.test.mjs` | PASS; exit 0 | Injected disposable-identity/loopback guard behavior only |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-acceptance-runner-claims.ps1` | 27/27 passed; exit 0 | Reads runner source; confirms shared cleanup wiring and rejects `process.exit`; no Edge/database execution |
| `node --loader ./scripts/typescript-loader.mjs ./scripts/specification/commercial-model.test.ts` | 21 passed; exit 0 | Specification-model behavior only; Node emitted the existing experimental-loader warning |
| `npm.cmd run lint` | PASS; `tsc --noEmit` exit 0 | Repository TypeScript compilation only |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-m1-m4-docs.ps1` | 17/17 files and hashes passed; exit 0 | Reads current untracked Markdown/source contents as bytes and validates the scoped review manifest; no Git mutation |
| `git diff --check -- scripts/acceptance scripts/run-edge001-disposable.mjs scripts/run-edge002-disposable.mjs scripts/run-edge003-disposable.mjs scripts/specification/verify-acceptance-runner-claims.ps1 docs/mvp` | PASS; exit 0 | Whitespace only; not semantic or external evidence |

Disposition: BLK-017's source dependency is **IMPLEMENTED — UNVERIFIED**. Actual Auth-trigger behavior, elevated cleanup, zero surviving roots, Refund V2 effects, and service behavior remain **NOT RUN — OWNER DEFERRED** under AUTH-02.

## PF-SUP-2026-10-25-10 freshly executed evidence

Executor: **GPT-5.6 Sol / Codex local workspace agent**. Date: **2026-10-25 (Africa/Lagos)**. Scope was local source, injected adapters and TypeScript only.

| Exact command | Result | Evidence scope |
|---|---:|---|
| `node --check scripts/acceptance/status-v2-postgrest.mjs; node --check scripts/acceptance/status-v2-postgrest.test.mjs` | PASS; exit 0 | JavaScript syntax only |
| `node scripts/acceptance/status-v2-postgrest.test.mjs` | 21 assertions passed; exit 0 | Synthetic/injected token, source-hash, pre-access abort, request, denial, committed/conflict provenance and absence assertions; no Docker or HTTP access |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-acceptance-runner-claims.ps1` | 35/35 passed; exit 0 | Static runner-source claims only |
| `npm.cmd run lint` | PASS; `tsc --noEmit` exit 0 | Repository TypeScript compilation only |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-m1-m4-docs.ps1` | 19/19 files and hashes passed; exit 0 | Byte-level supplemental review-manifest verification; no Git mutation |

The runner defines 23 future real-PostgREST scenarios. None was executed. No JWT was read, signed, issued or transmitted; no anon key, database, Docker target, port or service was accessed. BLK-016 therefore remains **BLOCKED BY EXECUTION AUTHORIZATION**.

## PF-SUP-2026-10-23-08 freshly executed evidence

| Exact command | Result | Evidence scope |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs ./scripts/specification/commercial-model.test.ts` | 21 passed; exit 0 | Specification-model behavior only; no server/database/provider acceptance |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-acceptance-runner-claims.ps1` | 15/15 passed after one local parser-quoting correction | Reads runner source directly; confirms admin/service characterization and Edge cleanup gap; no runner executed |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\specification\verify-m1-m4-docs.ps1` | 12/12 files and hashes passed; exit 0 | Reads every untracked Markdown/model/verifier file as bytes and compares exact SHA-256; unlike `git diff --check`, does not depend on Git tracking |
| `npm.cmd run lint` | PASS; `tsc --noEmit` exit 0 | TypeScript/static compilation only |
| `git diff --check -- docs/mvp scripts/specification docs/development/PHARMACYFLOW_RELEASE_CANDIDATE.md docs/development/PHARMACYFLOW_RELEASE_STAGING_PROPOSAL.md` | PASS | Whitespace only; it does not inspect untracked content semantically |

The Node process emitted the existing experimental-loader warning. It did not change the 21/21 result.

## Executed Milestone 1 static checks

| Check | Result | Limitation |
|---|---:|---|
| Required persistent MVP documents | 8/8 present | Document existence only |
| Active Admin page/Dashboard fixture-import scan | no `mock-data` import | Does not prove dormant components are deleted or database authorization is correct |
| Canonical `src` and `supabase/functions` Paystack/referral runtime scan | no runtime hit | Static absence supports the `MISSING`/blocked classification; it is not environment evidence |
| Migration-directory classification | 28 SQL artifacts: 27 historical plus one unexecuted status-v2 | Does not inspect a database migration ledger |
| `git diff --check -- docs/mvp` | passed | Whitespace only; no Git mutation |
| SHA-256 calculation for all eight MVP documents | completed with no read failure | Hashes were reported for review; no staging/commit occurred |

## Executed local evidence in the latest coordinated checkpoint

| Evidence | Result | Class | Scope and limitation |
|---|---:|---|---|
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/lifecycle.test.ts` | 15 assertions passed | Synthetic unit | UTC lifecycle and advisory capability mapping only |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/capabilityBoundary.test.ts` | 5 assertions passed | Synthetic unit | Delayed completion invalidation only |
| `node --loader ./scripts/typescript-loader.mjs src/lib/offline/phaseB.test.ts` | 61/61 passed | Synthetic acceptance | Injected IndexedDB/adapters; not a real browser or PostgreSQL |
| Capability-wiring source check | passed | Static | Confirms production component wiring strings/props, not React lifecycle execution |
| Disposable target-guard checks | passed | Static/injected synthetic | Confirms runners reject absent/mismatched identities before injected access; runners were not externally executed |
| PowerShell runner parser checks | 4/4 passed | Static | Syntax only; no Docker, database, port, service, or credential access |
| `npm.cmd run lint` | passed | Static/type check | Root TypeScript only |
| `npm.cmd test` | 37/37 suites passed | Local synthetic/unit | Existing root runner; not external integration evidence |
| Source/artifact/release-candidate manifest verification | 96 / 32 / 119 entries, zero failures | Integrity/static | Scoped local file hashes only |
| `git diff --check` | passed | Static | Whitespace check; no Git mutation |

## Independently reviewed or historically reported evidence

- C-01 through C-03 passed local independent review at PF-SUP-2026-10-23-03. C-04 production adapters passed synthetic review; real React/browser behavior remains unverified.
- Refund V2 historical reports include local unit/critical suites, database concurrency, and EDGE-001 through EDGE-003. Those results are historical/reported and do not prove the current dirty tree or a current deployment.
- Admin Support auth/build/type/lint results predating the current checkpoint remain historical/reported unless rerun in a later safe batch.

These are prior independent checks or repository-recorded reports, not fresh Sol execution. Any “historical/reported” result must be re-collected when its release gate requires current-tree evidence.

## Sol-reported prior local evidence

The 15 lifecycle, 5 capability-boundary, 61 Phase B, 37-suite root, runner guard/parser, and prior manifest results below were reported by Sol at earlier local checkpoints. They were not rerun in -08 and remain distinct from the fresh 21-assertion specification-model result.

## Static source conclusions from Milestone 1

- Root `package.json` identifies the canonical React 19/TypeScript/Vite 8 SaaS and local test runner.
- `apps/pharmacy-flow-admin/package.json` identifies a separate Next.js 15 Admin Support application.
- `src/App.tsx:28-49` supplies auth/no-membership/tenant-selection/ready state routing; `src/contexts/AuthContext.tsx:116-183` resolves active memberships and validates a stored pharmacy preference against them.
- `supabase/migrations` contains 27 historical SQL migrations through M-25, one unexecuted additive status-v2 SQL artifact, and one TypeScript security test. File presence is not migration execution evidence.
- `supabase/functions` contains sale, return-v1, and return-v2 sync gateways. Source presence is not deployed Edge evidence.
- `apps/pharmacy-flow-admin/lib/mock-data.ts` contains historical pricing/referral fixtures, but the active dashboard does not use them as authoritative data. They establish no commercial feature.

## Explicitly not run

## ACC-01 local evidence — 2026-10-26

| Evidence | Result | Class | Limitation |
|---|---:|---|---|
| I3A `synthetic.test.ts` | passed; zero real external calls | Pure/injected synthetic | Authorization/orchestration/concurrency-evidence model only |
| I3A `static.test.mjs` | passed | Static | Source presence/order/forbidden-import assertions only |
| I3A focused strict `tsc --noEmit` | exit 0, no diagnostics | Type check | Harness TypeScript only; root application not rerun |

PostgreSQL/SQL parsing, migration/fixture/cleanup, ACL/RLS, real concurrency, Auth/provider/browser and every external side effect are **NOT RUN**. The prepared concurrency validator rejects synthetic/sequential classifications, but passing it with constructed data is not PostgreSQL evidence.

### PF-SUP-2026-10-26-08 correction evidence

| Evidence | Result | Class | Limitation |
|---|---:|---|---|
| Corrected I3A synthetic test | passed; 16 preflight rejections each made zero executor calls | Pure/injected | No process/database/network target |
| Corrected static contract test | passed | Static | Source assertions, not PostgreSQL parsing |
| Corrected focused `tsc --noEmit` | exit 0 | Type check | Harness/shared fingerprint source only |
| Six PowerShell parser checks | 6/6 passed | Parser | No protected executor invoked |
| PowerShell evidence sanitizer test | passed with synthetic JWT/URL/secret strings | Pure local | No credential content or evidence directory accessed |

All SQL, role, target-proof, concurrency, cancellation and cleanup behavior remains **NOT RUN**. Simulated `request.jwt.claims` is explicitly not JWT/Auth acceptance. Confirmed applicant continuation is unimplemented; REV-LIN-01 is undecided.

### PF-SUP-2026-10-26-10 execution-fidelity correction evidence

| Evidence | Exact result | Class | Limitation |
|---|---:|---|---|
| Corrected I3A synthetic test | `ACC-01 PF-SUP-10 execution-fidelity synthetic tests: passed (16 zero-executor preflight rejections; separated stream regressions passed)` | Pure/injected | No process or external target |
| Corrected static contract test | `ACC-01 PF-SUP-10 execution-fidelity static contract tests: passed` | Static source | Not PostgreSQL parsing/execution |
| Focused `tsc --noEmit` | exit 0; no diagnostics | Type check | Harness/shared fingerprint source only |
| PowerShell parser | 8/8 `PARSE_OK` | Parser | Executors not invoked |
| Recursive sanitizer object test | `ACC-01 PowerShell recursive evidence sanitizer synthetic object test: passed` | Pure local | Synthetic objects only; no evidence file |
| Separated process-output test | `ACC-01 PowerShell separated process-output synthetic tests: passed` | Pure local | Injected stdout/stderr only; no psql process |

PostgreSQL SQL/RPC parsing and execution, real locks/concurrency, target proof, fixtures, ACL/RLS, Auth/provider/browser, credentials and cleanup remain **NOT RUN**. Executable concurrency source is limited to the two application-RPC operation-collision orderings. Other cases are explicitly sequential, blocked or not implemented. REV-LIN-01 remains undecided; AUTH-02 remains deferred.

- No database connection, SQL, migration, fixture write, transaction, rollback, cleanup, or concurrency session.
- No Docker command, environment creation, service start, port probe, Edge invocation, network request, or credential access.
- No real browser, IndexedDB profile, React E2E, Android, or browser lifecycle acceptance.
- No remote PharmacyFlow-Dev inspection, deployment, publication, Paystack request/webhook, referral reward, or financial activation.
- No Git staging, commit, push, reset, clean, stash, or checkout mutation.

## Evidence required for MVP acceptance

MVP cannot be `READY` while critical authorization, exactly-once financial effects, real-browser durability, subscription server enforcement, payment/referral accounting, and deployment compatibility remain unverified. The execution bundle and evidence templates in `docs/development/phase-b-acceptance/` remain the starting point for authorized Phase B collection; broader M4/M5 cases must be added only after protected contracts are approved.
