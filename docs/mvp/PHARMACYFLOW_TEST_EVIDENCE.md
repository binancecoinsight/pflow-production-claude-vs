# PharmacyFlow MVP test evidence register

## PF-SUP-2026-10-31-03 native-client conformance evidence

Local results: package static `53 passed`; emitter/consumer `36 passed`; native-client prefix/transcript `6 passed`; production bridge `15 passed`; whole-command `16 passed`; actual concurrency coordinator `4 passed`; TypeScript preflight passed; PowerShell `9 files clean`; C# compiled; SQL lexical `14 files clean`; focused/root no-emit passed. Execution inventory: 61 entries, current SHA-256 `59338f5aee6d759ccb580c18e2e111f463c7f82cc5468b46473f3d20886e43ca`. No PostgreSQL or protected execution evidence exists.

## PF-SUP-2026-10-31-02 emitter/consumer conformance evidence

Local results: emitter/consumer static `34 passed`; actual concurrency coordinator `4 passed`; production bridge `15 passed`; whole-command surface `16 passed`; package static `50 passed`; TypeScript preflight passed; PowerShell `8 files clean`; C# compiled; SQL lexical `14 files clean`; focused/root no-emit passed. The coordinator uses controlled process adapters and source-derived representative transcripts. PostgreSQL parsing/application and all real protected behavior remain NOT RUN.

## PF-SUP-2026-10-31-01 whole-command closure evidence

Execution inventory: 61/61 entries, comprising 41 migrations and 20 execution dependencies; SHA-256 `9763de865c306901a7f991f66d611692e7df723ff51ee28f97c2d842e1c2e5f3`. Local results: package static `50 passed`; TypeScript preflight/orchestration passed; production bridge `15 passed`; whole-command surface `16 passed`; PowerShell `7 files clean`; C# compiled; SQL lexical `14 files clean`; focused/root no-emit passed. No PostgreSQL or external/protected evidence was produced.

## PF-SUP-2026-10-30-06 production-path integration evidence

Local-only evidence exercises the actual default PowerShell-to-C# bridge with an in-memory process spy, including exact arguments/environment with spaces, complete worker streams, malformed framing, lifecycle failure, timeout/cancellation and sanitized diagnostics. Results: package static `46 passed`; injected preflight/orchestration passed; production-bridge/process/transcript rehearsal `15 passed`; PowerShell `5 files clean`; C# compiled; SQL lexical `14 files clean`; focused/root no-emit passed. Static assertions cover sealed M-13 conflict, Refund V2 nonce/provenance separation and evidence-preserving cleanup refusal. PostgreSQL parsing/execution and all external/protected evidence remain NOT RUN.

## PF-SUP-2026-10-30-05 runner safety evidence

Local-only evidence: TypeScript zero-call preflight/orchestration passed; PowerShell stdout/stderr/NOTICE/failure/timeout/cancellation/overflow/lifecycle/secret cases `11 passed`; package static `41 passed`; PowerShell `5 files clean`; C# compiled; SQL lexical `14 files clean`; focused/root TypeScript compilation passed. SQL cases are executable specifications, not executed acceptance. PostgreSQL parsing/application and all external/protected evidence remain NOT RUN.

## PF-MVP-10 package evidence - 2026-10-30

Injected preflight/orchestration passes with zero executor calls for missing/malformed/expired/overbroad/cancelled authorization and sanitized propagation for executor failure. Static package assertions: 24 passed. PowerShell syntax: 3 files clean. SQL lexical structure: 7 files clean. Focused/root TypeScript no-emit: pass. This is source evidence only; no PostgreSQL or external runtime evidence exists.

## PF-SUP-2026-10-30-03 entitlement contract closure evidence

Pre-correction closure test: 3 passed, 17 findings. Corrected results: closure source 30; injected decision/fingerprint/atomicity model 23; existing contract parity 114; canonical wiring 92; foundation static 11 + 25; entitlement wiring 61; lifecycle/capability 15 + 9; foundation behavior 52; entitlement behavior 1,004; gateway 70; focused/root compilation pass. SQL source inspection is lexical only. No PostgreSQL parser/application, database, RPC, Auth/provider, browser/datastore, network or concurrency evidence was produced.

## Entitlement lineage repair and canonical parity evidence - 2026-10-30

Focused executed evidence: contract-parity 114; canonical-wiring 92; foundation static 11 + 25; legacy wiring 61; lifecycle 15; capability boundary 9; foundation behavior 52; entitlement behavior 1,004; sale gateway 70. Focused and root TypeScript compilation pass. The canonical SQL source passes the inspected lexical delimiter/body checker; the quarantined proposal intentionally retains four detected lexical defects. PostgreSQL parser/application, database behavior, RPC, Auth/provider, browser and network checks were not run.

## PF-MVP-09S-FINAL Consolidated Privileged-Caller Security Closure Evidence - 2026-10-30

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node scripts/acceptance/entitlement-enforcement-wiring.test.mjs` | `Server-authoritative entitlement enforcement wiring assertions: 90 passed`; exit 0 | Static verification of migration 000037 initiating-operator provenance in `rpc_ingest_sale_stock_movement`, `rpc_commit_sale_v1`, `rpc_process_sale_return_v2`, absence of `OR id = p_operation_id`, `TRUSTED_GATEWAY_REQUIRED`, administrative reinstatement, monotonic ordering, and least-privilege grants |
| `node scripts/acceptance/entitlement-wiring.test.mjs` | `Server-authoritative entitlement wiring assertions: 61 passed`; exit 0 | Static verification of migration 000035, capabilities, and client adapters |
| `node scripts/acceptance/entitlement-foundation-security.test.mjs` | `Entitlement foundation static assertions: 11 passed`; exit 0 | Security assertions for foundation proposal |
| `node scripts/acceptance/entitlement-foundation-acceptance.test.mjs` | `Entitlement foundation acceptance static assertions: 25 passed`; exit 0 | Static verification of foundation v2 acceptance proposal |
| `node scripts/acceptance/entitlement-contract-parity.test.mjs` | `Entitlement contract-parity/readiness assertions: 79 passed; quarantined structure errors: 4`; exit 0 | Contract-parity verification across sealed M-18, Refund V2, intake, adjustment, transfer, and staff contracts |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/lifecycle.test.ts` | `Subscription lifecycle tests: 15 passed`; exit 0 | Production lifecycle state derivation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/capabilityBoundary.test.ts` | `Capability boundary tests: 9 passed`; exit 0 | Capability async boundary invalidation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/foundationSecurity.test.ts` | `Entitlement foundation security tests: 49 passed`; exit 0 | Replay authorization, administrative decisions, deterministic sequence ordering |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/entitlement.test.ts` | `Server-authoritative entitlement tests: 1004 passed`; exit 0 | Comprehensive synthetic test suite: all 6 lifecycle states across all 8 RPC mutation kinds, strict replay payload fingerprint validation, rejection of missing/malformed hashes, tenant isolation, and historical read preservation |
| `node --loader ./scripts/typescript-loader.mjs scripts/run-tests.ts` | `Test suites: 43 passed, 0 failed, 43 total`; exit 0 | Full project regression verification across all domains |
| `.\\node_modules\\.bin\\tsc.cmd -p scripts/acceptance/tsconfig.entitlement.json --noEmit` | PASS, no output; exit 0 | Strict TypeScript compilation of subscription & entitlement modules |
| `.\\node_modules\\.bin\\tsc.cmd -p tsconfig.json --noEmit` | PASS, no output; exit 0 | Root project TypeScript compilation |
| `git diff --check` | PASS, no output; exit 0 | Git whitespace and formatting integrity |

Total focused behavior: 1,343 passing assertions across entitlement suites; 43/43 suites passing project-wide (0 failures). Zero database execution, zero Docker, zero remote network/Auth calls, zero Git staging/commits. PostgreSQL atomicity, RLS enforcement, and production integration remain unexecuted. AUTH-02 remains deferred.

## PF-SUP-2026-10-30-01 corrected entitlement parity/readiness evidence

The prior PF-MVP-09/R/S test-count evidence did not establish SQL structure or protected-contract parity. New structural/composed regression result: `79 passed; quarantined structure errors: 4`. It detects the missing DO body, malformed dollar delimiters, M-18 nonce/authorization/deficit loss, Refund V2 M-21–M-25 parity loss, invalid intake status/response, transfer permission loss, ambiguous grants, unwired trusted evidence and v2 evaluator bypass. PostgreSQL parsing/application remains NOT RUN; disposable readiness is not established.

## PF-MVP-09S Final Entitlement Security Contract Closure and Disposable-Test Readiness Evidence - 2026-10-30 — SUPERSEDED

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node scripts/acceptance/entitlement-enforcement-wiring.test.mjs` | `Server-authoritative entitlement enforcement wiring assertions: 89 passed`; exit 0 | Static verification of migration 000037 operator provenance, strict replay checks (absence of `OR id = p_operation_id`), `TRUSTED_GATEWAY_REQUIRED` in `rpc_ingest_sale_stock_movement`, administrative reinstatement, monotonic ordering, and least-privilege grants |
| `node scripts/acceptance/entitlement-wiring.test.mjs` | `Server-authoritative entitlement wiring assertions: 61 passed`; exit 0 | Static verification of migration 000035, capabilities, and client adapters |
| `node scripts/acceptance/entitlement-foundation-security.test.mjs` | `Entitlement foundation static assertions: 11 passed`; exit 0 | Security assertions for foundation proposal |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/lifecycle.test.ts` | `Subscription lifecycle tests: 15 passed`; exit 0 | Production lifecycle state derivation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/capabilityBoundary.test.ts` | `Capability boundary tests: 9 passed`; exit 0 | Capability async boundary invalidation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/foundationSecurity.test.ts` | `Entitlement foundation security tests: 49 passed`; exit 0 | Replay authorization, administrative decisions, deterministic sequence ordering |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/entitlement.test.ts` | `Server-authoritative entitlement tests: 1004 passed`; exit 0 | Comprehensive synthetic test suite: all 6 lifecycle states across all 8 RPC mutation kinds, strict replay payload fingerprint validation, rejection of missing/malformed hashes, tenant isolation, and historical read preservation |
| `.\\node_modules\\.bin\\tsc.cmd -p scripts/acceptance/tsconfig.entitlement.json --noEmit` | PASS, no output; exit 0 | Strict TypeScript compilation of subscription & entitlement modules |
| `.\\node_modules\\.bin\\tsc.cmd -p tsconfig.json --noEmit` | PASS, no output; exit 0 | Root project TypeScript compilation |
| `git diff --check` | PASS, no output; exit 0 | Git whitespace and formatting integrity |

Total focused behavior: 1,238 passing assertions (0 failures). Zero database execution, zero Docker, zero remote network/Auth calls, zero Git staging/commits. PostgreSQL atomicity, RLS enforcement, and production integration remain unexecuted. AUTH-02 remains deferred.

## PF-MVP-09R Consolidated Entitlement Enforcement Acceptance Hardening Evidence - 2026-10-30

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node scripts/acceptance/entitlement-enforcement-wiring.test.mjs` | `Server-authoritative entitlement enforcement wiring assertions: 78 passed`; exit 0 | Static verification of migration 000037 operational RPC preludes (all 8 RPCs), preconditions, forced RLS, monotonic ordering, and least-privilege grants |
| `node scripts/acceptance/entitlement-wiring.test.mjs` | `Server-authoritative entitlement wiring assertions: 61 passed`; exit 0 | Static verification of migration 000035, capabilities, and client adapters |
| `node scripts/acceptance/entitlement-foundation-security.test.mjs` | `Entitlement foundation static assertions: 11 passed`; exit 0 | Security assertions for foundation proposal |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/lifecycle.test.ts` | `Subscription lifecycle tests: 15 passed`; exit 0 | Production lifecycle state derivation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/capabilityBoundary.test.ts` | `Capability boundary tests: 9 passed`; exit 0 | Capability async boundary invalidation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/foundationSecurity.test.ts` | `Entitlement foundation security tests: 24 passed`; exit 0 | Replay authorization, administrative decisions, deterministic sequence ordering |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/entitlement.test.ts` | `Server-authoritative entitlement tests: 941 passed`; exit 0 | Comprehensive synthetic test suite: all 6 lifecycle states across all 8 RPC mutation kinds, replay hardening, anti-forgery, tenant isolation, and historical read preservation |
| `.\\node_modules\\.bin\\tsc.cmd -p scripts/acceptance/tsconfig.entitlement.json --noEmit` | PASS, no output; exit 0 | Strict TypeScript compilation of subscription & entitlement modules |
| `.\\node_modules\\.bin\\tsc.cmd -p tsconfig.json --noEmit` | PASS, no output; exit 0 | Root project TypeScript compilation |
| `git diff --check` | PASS, no output; exit 0 | Git whitespace and formatting integrity |

Total focused behavior: 1,139 passing assertions. Zero database execution, zero Docker, zero remote network/Auth calls, zero Git staging/commits. PostgreSQL atomicity, RLS enforcement, and production integration remain unexecuted. AUTH-02 remains deferred.

## PF-MVP-08 / BLK-003 Server-Authoritative Entitlement Evidence

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/entitlement.test.ts` | `Server-authoritative entitlement tests: 483 passed`; exit 0 | 6 suites: UTC millisecond boundaries, strict server payload parsing, mutation enforcement, historical read preservation, CapabilityAsyncBoundary coordination, injected RPC/offline fallback adapters, anti-spoofing, and tenant isolation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/lifecycle.test.ts` | `Subscription lifecycle tests: 15 passed`; exit 0 | Production lifecycle state derivation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/subscription/capabilityBoundary.test.ts` | `Capability boundary tests: 9 passed`; exit 0 | Capability async boundary invalidation |
| `node scripts/acceptance/entitlement-wiring.test.mjs` | `Server-authoritative entitlement wiring assertions: 60 passed`; exit 0 | SQL migration structure, active audit ledger trigger & admin RPC, membership-first replay checks, RPC functions, client export integrity, preserved hashes |
| `node scripts/acceptance/mvp02-close-wiring.test.mjs` | `MVP-02-CLOSE wiring assertions: 56 passed`; exit 0 | Upstream inventory integration and preservation assertions |
| `.\\node_modules\\.bin\\tsc.cmd -p scripts/acceptance/tsconfig.entitlement.json --noEmit` | PASS, no output; exit 0 | Focused strict local compilation |
| `.\\node_modules\\.bin\\tsc.cmd -p tsconfig.json --noEmit` | PASS, no output; exit 0 | Root local compilation |
| `git diff --check` | PASS, no output; exit 0 | Whitespace integrity check |

Total focused behavior: 623 passing assertions. Zero database execution, zero Docker, zero remote network/Auth calls, zero Git staging/commits. PostgreSQL atomicity, RLS enforcement, and production integration remain unexecuted. AUTH-02 remains deferred.

## PF-SUP-2026-10-29-02 MVP-02-CLOSE correction evidence

| Evidence | Exact result | Boundary |
|---|---:|---|
| Four-operation injected response-contract matrix | 101/101 | Sealed response/replay/cardinality/arithmetic handling; no RPC/network |
| Integrated cache/durability preservation | 42/42 | Isolated fake IndexedDB and injected executors |
| Inventory, sync, intake, adjustment, transfer, transfer UI, shared-expiry | 71/71; 57/57; 56/56; 89/89; 35/35; 63/63; 14/14 | Directly affected focused synthetic suites |
| Static preservation | 56/56 | Production wiring, sealed SQL, accepted hashes, entitlement byte-preservation and contract phrases |
| Focused strict / root TypeScript | PASS / PASS | No-emit local compilation |

Total focused behavior: 528 passing assertions. Entitlement files were not executed or changed; their hashes and defects are recorded in the completion report. No actual browser/datastore, database, RPC, Auth/provider, network or production behavior ran.

## MVP-02-CLOSE inventory workflow integration evidence

| Command | Exact result | Boundary |
|---|---:|---|
| integrated inventory workflow | first 24/27; corrected 27/27 | Production services/helpers, injected executors and isolated fake IndexedDB |
| inventory / sync / transfer UI / shared-expiry paths | 71/71; 57/57; 63/63; 14/14 | Directly affected focused regressions |
| MVP-02-CLOSE static wiring | 32 passed | RPC/request preservation and reviewed hashes |
| focused strict / root TypeScript | PASS / PASS | Local no-emit compilation |

No browser, real datastore, database/RLS/RPC, Auth/provider, network or production execution occurred. Mock results do not prove authoritative stock effects.

## PF-SUP-2026-10-28-04 MVP-02B rendering-boundary correction evidence

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs src/components/inventory/StockAttentionPanel.test.tsx` | `Stock-attention production rendering: 60 passed`; exit 0 | Actual production components rendered in memory; no browser/datastore |
| `node scripts/acceptance/inventory-stock-attention-wiring.test.mjs` | `Inventory stock-attention wiring assertions: 47 passed`; exit 0 | Static boundary/query/preservation assertions |
| `.\\node_modules\\.bin\\tsc.cmd -p scripts/acceptance/tsconfig.inventory-stock-attention.json --noEmit` | PASS, no output | Focused strict local compilation |
| `.\\node_modules\\.bin\\tsc.cmd -p tsconfig.json --noEmit` | PASS, no output | Root local compilation |

Coverage includes null/non-array collections, null and mixed rows, malformed category/name/generic/SKU/barcode/status/visible-price fields, hidden versus visible cost handling, missing/malformed/unsafe/inconsistent stock rows, normal category/status filters, valid quantity presentation and panel/list unknown consistency. Malformed evidence never produces empty inventory, zero stock or an adequate-stock classification. The unchanged pure aggregation suite was not rerun. No actual browser/IndexedDB/datastore, RPC, PostgreSQL/RLS, Auth/provider, network or authoritative stock behavior ran; AUTH-02 remains deferred.

## MVP-02B branch-scoped cached stock attention evidence

| Command | Exact result | Evidence boundary |
|---|---:|---|
| PF-SUP-2026-10-28-03 manifest verification before edits | `11/11 matched`; SHA-256 `607f4e6558557bae717af3e9752ce884dbc099f7bb6e5e40134db383e02926d0` | Read-only continuity check; accepted suites not rerun |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/stockAttention.test.ts` | `Stock-attention derivation regressions: 47 passed`; exit 0 | Production pure derivation and workspace transitions with synthetic evidence |
| `node --loader ./scripts/typescript-loader.mjs src/components/inventory/StockAttentionPanel.test.tsx` | `Stock-attention production rendering: 15 passed`; exit 0 | React server rendering only; no browser/datastore |
| `node scripts/acceptance/inventory-stock-attention-wiring.test.mjs` | `Inventory stock-attention wiring assertions: 35 passed`; exit 0 | Static shared-path/query/preservation assertions |
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.inventory-stock-attention.json --noEmit` | PASS, no output | Focused strict local compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS, no output | Root local compilation |
| scoped whitespace checks | tracked `git diff --check` PASS; new-file scan `0` issues | Scoped files only; Markdown hard-break pairs allowed |

Coverage includes current/cross-branch evidence, explicit empty versus missing groups, malformed collections/rows/quantities, duplicates and association failures, negative deficits, individual and aggregate safe-integer bounds, all three display bands, search/limit/stale/count/generation coverage, workspace transitions, loading/error precedence, unknown visibility/filter exclusion, and panel/ProductList agreement. No actual browser, IndexedDB/datastore, RPC, PostgreSQL/RLS, Auth/provider, network or authoritative stock behavior ran; AUTH-02 remains deferred.

## PF-SUP-2026-10-28-02 product-detail publication correction evidence

| Command | Exact result | Evidence boundary |
|---|---:|---|
| shared-expiry manifest verification before edits | `17/17 matched`; manifest SHA-256 `132266438cd43d6f52627bcfcd3616cfa2aa79c93b6b6a1ecc52e29a36821c14` | Read-only continuity check; no broad suite rerun |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/productDetailLoad.test.ts` | `Product-detail publication regressions: 23 passed`; exit 0 | Production-used coordinator, synthetic deferred promises only |
| `node scripts/acceptance/product-detail-publication-wiring.test.mjs` | `Product-detail publication wiring assertions: 34 passed`; exit 0 | Static binding/query-count and accepted-source hash assertions |
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.product-detail-publication.json --noEmit` | PASS, no output | Focused strict local compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS, no output | Root local compilation |
| scoped `git diff --check` | PASS, no output | Tracked scoped diff only; new files are covered by compiler/static checks and manifest hashing |

Coverage includes both A/B completion orderings, A-to-B-to-A, stale success after current failure, stale failure after current success, close/reopen, coherent-workspace invalidation, unmount, batch association rejection and immutable successful publication. No browser, actual IndexedDB/datastore, RPC, PostgreSQL/RLS, Auth/provider, network or production behavior ran; AUTH-02 remains deferred.

## Shared inventory expiry remediation evidence - 2026-10-28

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.shared-expiry-remediation.json --noEmit` | PASS, no output | Focused strict compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS, no output | Root compilation |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/sharedExpiryRemediation.test.ts` | `44 assertions passed` | Production parser, validator and pure FEFO selection |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/sharedExpiryProductionPaths.test.tsx` | `14 assertions passed` | Explicit fake IndexedDB, injected zero-call RPC stub and in-memory detail rendering |
| `node scripts/acceptance/shared-expiry-remediation-wiring.test.mjs` | `21 passed` | Static fail-closed ordering and preservation assertions |
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/inventory.test.ts` | `71 passed, 0 failed` | Existing inventory regression using fake IndexedDB |
| `node --loader ./scripts/typescript-loader.mjs src/lib/pos/pos.test.ts` | `76 passed, 0 failed` | Existing POS regression using fake IndexedDB |

Coverage includes impossible/leap dates, prefixes/suffixes, invalid Date/non-finite/out-of-range epochs, epoch zero, explicit timezone offsets and UTC-day crossings, same-day expiry, unchanged FEFO, mixed malformed candidates, explicit/automatic selection, finalization, snapshot/intake pre-effect rejection, unavailable presentation and unresolved checkout preservation. No actual browser/IndexedDB, RPC, database/RLS, network, Auth/provider or production execution occurred; AUTH-02 remains deferred.

## PF-SUP-2026-10-27-07 MVP-02A robustness correction evidence

| Command | Exact final result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/expiryAttention.test.ts` | `48 assertions passed`; exit 0 | Production derivation with synthetic malformed runtime evidence |
| `node --loader ./scripts/typescript-loader.mjs src/components/inventory/ExpiryAttentionPanel.test.tsx` | `11 assertions passed`; exit 0 | Production panel rendered in memory with React server renderer; no browser |
| `node scripts/acceptance/inventory-expiry-attention-wiring.test.mjs` | `31 passed`; exit 0 | Static error/retry/wiring/preservation assertions |
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.inventory-expiry-attention.json --noEmit` | PASS, no output | Focused strict local compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS, no output | Root local compilation |

Regressions cover the actual simultaneous post-error loading/error props, retry loading after error clearing, normal success/partial/empty rendering, null/malformed collections, batch groups, product rows and batch rows, plus non-reassuring unknown presentation. The shared parser hash remains reviewed and unchanged. No actual browser, IndexedDB, RPC, PostgreSQL/RLS, Auth/provider, network or production behavior ran; AUTH-02 remains deferred.

## MVP-02A branch-scoped inventory expiry attention evidence

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/expiryAttention.test.ts` | `40 assertions passed`; exit 0 | Production pure derivation/workspace logic, synthetic cache evidence and injected clock only |
| `node scripts/acceptance/inventory-expiry-attention-wiring.test.mjs` | `27 passed`; exit 0 | Static panel/cache/workspace wiring and byte-preservation assertion only |
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.inventory-expiry-attention.json --noEmit` | PASS, no output | Focused strict local compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS, no output | Root local compilation |

Cases cover same-day and inclusive 90-day boundaries, leap years/impossible dates, tenant/branch/product association rejection, malformed/non-positive quantities, duplicate/orphan evidence, search/product-limit/count/snapshot-generation coverage, ordering, immutability and workspace changes. No browser, IndexedDB, RPC, PostgreSQL/RLS, Auth/provider, network or authoritative stock behavior ran. The shared operational parser remains unchanged and defective; AUTH-02 remains deferred.

## PF-SUP-2026-10-27-05 MVP-01C validator correction evidence

| Command | Exact result | Evidence boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs src/lib/auth/staffInvitationOversight.test.ts` | `58 passed` | Production validator/coordinator with synthetic rows, injected clock/executors and deferred promises only |
| `node scripts/acceptance/staff-invitation-oversight-wiring.test.mjs` | `35 passed` | Static M-16/RPC/workspace/UI wiring assertions; no invocation |
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.staff-invitation-oversight.json --noEmit` | PASS, no output | Focused strict local compilation |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS, no output | Root local compilation |

New validator cases accept normalized `staff@localhost`, valid leap days, positive/negative offsets and PostgreSQL fractional seconds; reject non-leap/impossible dates, invalid hour/minute/second/offset components and excessive fractional precision. They also reconfirm immutable allowlisting, secret-bearing whole-response rejection, unchanged server status and separate injected-clock expiry derivation. No actual RPC/database/RLS/Auth/browser/network/protected execution occurred; AUTH-02 remains deferred.

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

### PF-SUP-2026-10-26-11 two-point runner closure evidence

| Evidence | Exact result | Class | Limitation |
|---|---:|---|---|
| Corrected I3A synthetic test | `ACC-01 PF-SUP-11 two-point runner closure synthetic tests: passed (16 zero-executor preflight rejections; mutation acknowledgments and signed-bigint lock vectors passed)` | Pure/injected | Local arithmetic/output only |
| Corrected static contract test | `ACC-01 PF-SUP-11 two-point runner closure static contract tests: passed` | Static source | Not PostgreSQL parsing/execution |
| Focused `tsc --noEmit` | exit 0; no diagnostics | Type check | Harness/shared fingerprint source only |
| PowerShell parser | 10/10 `PARSE_OK` | Parser | Executors not invoked |
| PowerShell runner-contract test | `ACC-01 PowerShell mutation acknowledgment and lock-source tests: passed` | Pure local | No psql; no PostgreSQL lock parity |

Zero, one, multiple, malformed and wrong-tag coordinator acknowledgments are covered as local failures when the exact expected cardinality is two. Positive/negative signed-bigint vectors include unsigned high/low components outside signed 32-bit range. PostgreSQL `hashtextextended`/`pg_locks` parity and all external acceptance remain **NOT RUN**.

- No database connection, SQL, migration, fixture write, transaction, rollback, cleanup, or concurrency session.
- No Docker command, environment creation, service start, port probe, Edge invocation, network request, or credential access.
- No real browser, IndexedDB profile, React E2E, Android, or browser lifecycle acceptance.
- No remote PharmacyFlow-Dev inspection, deployment, publication, Paystack request/webhook, referral reward, or financial activation.
- No Git staging, commit, push, reset, clean, stash, or checkout mutation.

## Evidence required for MVP acceptance

### ACC-01 reservation/revocation concurrency source evidence

| Evidence | Exact result | Class | Limitation |
|---|---:|---|---|
| PowerShell scenario source test | `ACC-01 reservation/revocation scenario source tests: passed` | Pure local | Generated SQL/source strings only; no psql |
| I3A synthetic test | `ACC-01 reservation/revocation concurrency synthetic tests: passed (16 zero-executor preflight rejections; fixture inventory and case identifiers passed)` | Pure/injected | Zero real external calls |
| Static contract test | `ACC-01 reservation/revocation concurrency source static tests: passed` | Static source | Not PostgreSQL parsing/execution |
| Focused `tsc -p scripts/acceptance/i3a/tsconfig.json --noEmit` | exit 0; no diagnostics | Type check | Harness TypeScript only |
| PowerShell parser | 11/11 `PARSE_OK` | Parser | No PowerShell runner execution |

Source inspection establishes that reserve and admission-revoke share the production applicant/email advisory lock and that the authored fixture calls the admission RPC instead of inserting business rows. This is source reasoning, not PostgreSQL lock/transition evidence. No database, SQL, fixture, RPC, target, executor, credential, network or protected operation was accessed. AUTH-02 remains deferred and REV-LIN-01 remains undecided.

MVP cannot be `READY` while critical authorization, exactly-once financial effects, real-browser durability, subscription server enforcement, payment/referral accounting, and deployment compatibility remain unverified. The execution bundle and evidence templates in `docs/development/phase-b-acceptance/` remain the starting point for authorized Phase B collection; broader M4/M5 cases must be added only after protected contracts are approved.

## REV-LIN-01 local implementation evidence — 2026-10-26

| Evidence | Exact result | Class | Limitation |
|---|---:|---|---|
| Gateway injected model | `BLK-002-I3 corrected gateway injected tests: 50 passed` | Pure/injected | Sequential in-memory authority/repository/provider only |
| Operator injected model | `BLK-002-I3 inactive operator injected tests: 25 passed` | Pure/injected | Existing sequential model |
| I3 static contract | `BLK-002-I3 static gateway/operator contract tests: 135 passed` | Static source/hash | No SQL parser or PostgreSQL execution |
| Focused strict TypeScript | exit 0, no diagnostics | Compiler | Six I3 source/test files only |
| Root TypeScript | exit 0, no diagnostics | Compiler | Root application include set only |
| Scoped manifest | all entries matched | Local SHA-256 | Snapshot integrity, not runtime acceptance |

The new tests exercise distinct dispatch/resolution/completion/result-lookup authority, revocation timing, rotation/staleness, cross-principal scoped recovery, identity preservation, response loss, no-create recovery, immutable replay, incomplete legacy provenance and audit rollback. Migration `000033` remains unexecuted. PostgreSQL syntax/application, ACL/RLS, triggers, rollback, locks/concurrency, Auth/provider/browser/runtime mapping and provisioning remain **NOT RUN**. AUTH-02 is deferred.

## PF-SUP-2026-10-26-15 local security-correction evidence

| Evidence | Exact result | Class | Limitation |
|---|---:|---|---|
| Gateway injected model | `BLK-002-I3 corrected gateway injected tests: 64 passed` | Pure/injected | Sequential in-memory authority/repository/provider |
| Operator injected model | `BLK-002-I3 inactive operator injected tests: 25 passed` | Pure/injected | Existing sequential model |
| I3 static contract | `BLK-002-I3 static gateway/operator contract tests: 160 passed` | Static source/hash | No SQL parsing/execution |
| Focused strict TypeScript | exit 0, no diagnostics | Compiler | I3 source/test include set |
| Root TypeScript | exit 0, no diagnostics | Compiler | Root application include set |
| Scoped manifest | all entries matched | SHA-256 | Local integrity, not runtime acceptance |

Regressions cover cross-principal ISSUE dispatch/completion/replay denial, same-principal credential rotation, scoped alternate recovery without creation, missing/inactive/wrong-capability/wrong-applicant/wrong-context grants, exact completed replay, changed subject/provider conflicts, stale/revoked authority and audit rollback. Migration `000034` was not parsed or executed. PostgreSQL/Auth/provider/browser/concurrency and production acceptance remain **NOT RUN**; AUTH-02 remains deferred.

## PF-SUP-2026-10-26-16 ACC-01 contract-alignment evidence

| Evidence | Exact result | Class | Limitation |
|---|---:|---|---|
| Synthetic TypeScript | `ACC-01 000033-000034 contract-alignment synthetic tests: passed (16 zero-executor preflight rejections; sealed migrations, fixture inventory and case identifiers passed)` | Pure/injected | Zero external calls |
| Static source contract | `ACC-01 000033-000034 contract-alignment source static tests: passed` | Static | Not PostgreSQL parsing/execution |
| Focused TypeScript | exit `0`, no diagnostics | Compiler | Harness include set only |
| PowerShell parser | `ACC-01 PowerShell parser-only checks: passed (11 files)` | Parser | No runner/executor invocation |
| Scenario regression | `ACC-01 reservation/revocation scenario source tests: passed` | Pure source generation | No psql |
| Runner contract regression | `ACC-01 PowerShell mutation acknowledgment and lock-source tests: passed` | Pure helper | No PostgreSQL lock parity |

The package authors current v4/phase ACL, scope, original-principal and pending recovery cases. Completion success, completed replay and completion-audit rollback are explicitly `BLOCKED_AUTH_02`, not simulated with direct Auth rows. All PostgreSQL/SQL/fixture/cleanup, ACL/RLS, transaction, lock/concurrency, target, credential, Auth/provider/browser and production acceptance remains **NOT RUN**.

## PF-SUP-2026-10-26-17 assertion-closure evidence

| Evidence | Exact result | Class | Limitation |
|---|---:|---|---|
| Synthetic assertion contract | `ACC-01 PF-SUP-17 assertion-closure synthetic tests: passed (16 zero-executor preflight rejections; 26 malformed identity responses rejected)` | Pure/injected | No SQL or external call |
| Static source contract | `ACC-01 PF-SUP-17 assertion-closure source static tests: passed (9 retired identity signatures; fail-closed response guards)` | Static | Not PostgreSQL parsing/execution |
| Focused TypeScript | exit `0`, no diagnostics | Compiler | Harness TypeScript only |
| PowerShell parser | `ACC-01 PF-SUP-17 PowerShell parser-only checks: passed (11 files)` | Parser | No runner/executor invocation |

The valid pending response preserves a present JSON-null `result`; SQL NULL, JSON null at the top level, missing fields, nested JSON null, wrong types and incorrect values are negative cases. The SQL counterparts are authored but **NOT RUN**. Migrations `000027`–`000034` remain unchanged; AUTH-02 and all protected acceptance remain deferred.

## PF-MVP-08 foundation security evidence — PF-SUP-2026-10-29-03

| Evidence | Result | Class | Limitation |
|---|---:|---|---|
| Foundation security regression | `24 passed` | Production-used pure/injected TypeScript | No external RPC/database |
| Existing entitlement regression | `506 passed` | Pure/injected TypeScript | No route wiring |
| Reconciled entitlement static wiring | `61 passed` | Static source/migration inspection | Does not prove SQL behavior |
| Foundation static proposal/preservation | see completion manifest | Static SQL/source/hash | Not SQL parse/execution |
| Focused/root compilation | see completion report | Compiler | No runtime deployment |

PostgreSQL behavior, RLS/grants, concurrency, real RPC/browser/Auth/provider and end-to-end enforcement are **NOT RUN**.

## PF-MVP-08 foundation acceptance completion — PF-SUP-2026-10-29-04

| Evidence | Exact result | Class | Limitation |
|---|---:|---|---|
| Lifecycle | `15 passed` | Pure TypeScript | No server clock |
| Capability boundary | `9 passed` | Injected TypeScript | No browser |
| Foundation adversarial | `49 passed` | Production-used pure/injected | No RPC/database |
| Affected entitlement | `1004 passed` | Production-used pure/injected | No business wiring |
| Legacy static reconciliation | `61 passed` | Static | Historical v1 inspection only |
| PF-SUP-03 static preservation | `11 passed` | Static/hash | No SQL execution |
| PF-SUP-04 exact SQL/source | `25 passed` | Static exact signatures/order/closure | No SQL parse/execution |
| Focused/root TypeScript | exit `0` / exit `0` | Compiler | No deployed runtime |

Microsecond differences, timezone-equivalent instants, sequence/UUID ties, future decisions, suspension/reinstatement/renewal, cross-pharmacy and same-kind cross-operation proof reuse, actor/device/hash changes and malformed proof shapes are covered. PostgreSQL behavior and atomic evidence production remain unverified.
