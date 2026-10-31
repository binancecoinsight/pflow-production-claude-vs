# PharmacyFlow product-detail publication correction

Date: 2026-10-28  
Scope: PF-SUP-2026-10-28-02 owner-authorized local correction  
Disposition: complete locally; stop for independent review

## Outcome

`InventoryView` no longer lets an obsolete product-detail read publish batches, publish unavailable evidence, clear a newer unavailable result, or end a newer request's loading state. The production path now uses one coordinator whose synchronous publication check binds:

- request generation;
- coherent user/membership-version/pharmacy/branch/role workspace identity;
- pharmacy identifier; and
- selected product identifier.

Generation remains independently required, so A-to-B-to-A cannot make the first A request current again.

## Changed files

- `src/lib/inventory/productDetailLoad.ts` - production coordination and complete publication lifecycle.
- `src/components/inventory/InventoryView.tsx` - coherent workspace binding, selection/close/workspace/unmount invalidation and guarded eligible-batch publication.
- `src/lib/inventory/productDetailLoad.test.ts` - deferred production-orchestration regressions.
- `scripts/acceptance/product-detail-publication-wiring.test.mjs` - static wiring, query-preservation and accepted-source hash assertions.
- `scripts/acceptance/tsconfig.product-detail-publication.json` - focused strict compilation target.
- `docs/development/PHARMACYFLOW_PROGRESS.md`, `PHARMACYFLOW_DECISIONS.md`, `PHARMACYFLOW_ROADMAP.md` - scoped state and decision records.
- `docs/mvp/PHARMACYFLOW_BLOCKER_REGISTER.md`, `PHARMACYFLOW_TEST_EVIDENCE.md` - blocker and evidence boundaries.
- this report and `PRODUCT_DETAIL_PUBLICATION_CORRECTION_PF-SUP-2026-10-28-02.sha256`.

No migration, protected contract, shared expiry rule, POS/FEFO behavior, persistence design or datastore query was added or changed.

## Publication and invalidation contract

Every loading, success, current failure/invalid-evidence and finalization setter is invoked only by `publishIfCurrent`. The check and setter callback are synchronous. Returned batches are accepted only when the complete collection is an array and every row matches the bound pharmacy and product; the coordinator publishes a frozen collection.

Selecting a replacement begins a new generation. Closing the modal invalidates and clears detail state. A coherent workspace-key change invalidates and clears it even before an old promise can publish because the live workspace ref changes during render. Unmount disposes the coordinator. Stale callbacks, including `finally`, are no-ops.

## Continuity and preservation

Before edits, the accepted shared-expiry manifest SHA-256 was `132266438cd43d6f52627bcfcd3616cfa2aa79c93b6b6a1ecc52e29a36821c14`; all `17/17` entries matched. The broad accepted suites were not rerun.

Static checks preserve these accepted implementation hashes:

| File | Preserved SHA-256 |
|---|---|
| `src/lib/inventory/expiry.ts` | `7fb287f2c76daece42242f8caec10c2da586283ab7a9304f9d4fc3f60cd73470` |
| `src/lib/inventory/validation.ts` | `dc71cb192fc8044b9f86aa3f3127a7dbc605867ccb424396a97968bd1638a156` |
| `src/lib/inventory/service.ts` | `e513241b416cd3f6f93f20fbdef69b08316aef2b67b67150973cd05b8247e9ff` |
| `src/lib/pos/cart.ts` | `9e30054b25420ba5e9fb6582d9441c55c5f158307bb1ea310dcfad3271bc3710` |
| `src/lib/pos/orchestrator.ts` | `c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c` |
| `src/components/inventory/ProductDetailModal.tsx` | `fb91eae81b6b4055c6da49629f357a440b9ff7e722062f54acb209ca18a003d7` |
| `src/lib/inventory/expiryAttention.ts` | `f739830808c633cfea9b7b75cf5525a79020bc30943436ea9cadb99251d1146c` |

The existing `getEligibleBatchesForProduct(pharmacyId, productId, { allowExpired: true })` call remains the only detail query. Results are copied before FEFO display sorting; accepted service and modal sources remain byte-identical.

## Executed verification

| Command | Exact result |
|---|---|
| `node --loader ./scripts/typescript-loader.mjs src/lib/inventory/productDetailLoad.test.ts` | `Product-detail publication regressions: 23 passed`; exit 0 |
| `node scripts/acceptance/product-detail-publication-wiring.test.mjs` | `Product-detail publication wiring assertions: 34 passed`; exit 0 |
| `node node_modules/typescript/bin/tsc -p scripts/acceptance/tsconfig.product-detail-publication.json --noEmit` | PASS; exit 0; no output |
| `node node_modules/typescript/bin/tsc --noEmit` | PASS; exit 0; no output |
| scoped `git diff --check` | PASS; exit 0; no output (tracked scoped diff) |

The regression matrix covers both response orderings, A-to-B-to-A, stale success after current failure, stale failure after current success, close/reopen, workspace invalidation, unmount, association failure, current loading/unavailable state and immutable successful evidence.

## Evidence boundary and next gate

This is local source/static/synthetic/compiler evidence only. React browser scheduling, real IndexedDB/datastore behavior, database/RLS/RPC enforcement, authoritative stock reconciliation, Auth/provider behavior, network behavior and production acceptance remain unexecuted. AUTH-02 remains deferred.

The next action is independent review of the scoped manifest. No deployment, protected execution or dependent implementation is authorized.
