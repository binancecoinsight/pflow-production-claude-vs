# PharmacyFlow MVP-02B branch-scoped cached stock attention

Date: 2026-10-28  
Scope: owner-authorized bounded local source/test/document batch  
Disposition: implemented and synthetically verified; stop for independent review

## Outcome

InventoryView now produces one immutable branch-scoped cached-stock result and passes that exact result to both `StockAttentionPanel` and `ProductList`. ProductList no longer totals raw all-branch batches. Its quantities, quantity colors, branch batch counts and numeric stock filters all use the shared result.

The derivation binds the coherent user/membership-version/pharmacy/branch/role workspace, validates products, groups and batches before aggregation, and checks individual and aggregate safe-integer bounds. It preserves valid negative quantities as deficits. Missing groups remain unknown while explicitly loaded empty groups produce known zero.

## Files

- `src/lib/inventory/stockAttention.ts` - shared production derivation, bands and filter matching.
- `src/lib/inventory/stockAttention.test.ts` - pure and injected workspace-transition regressions.
- `src/components/inventory/StockAttentionPanel.tsx` - honest cached branch attention presentation.
- `src/components/inventory/StockAttentionPanel.test.tsx` - in-memory production rendering and consumer agreement.
- `src/components/inventory/ProductList.tsx` - shared quantities, branch batch counts, bands, unknown presentation and filters.
- `src/components/inventory/InventoryView.tsx` - single derivation and loading/error/workspace wiring.
- `scripts/acceptance/inventory-stock-attention-wiring.test.mjs` - static scope/query/hash assertions.
- `scripts/acceptance/tsconfig.inventory-stock-attention.json` - focused strict compiler target.
- relevant progress, decisions, development/MVP roadmaps, blocker and test-evidence records.
- this report and `MVP02B_BRANCH_STOCK_ATTENTION_LOCAL_HANDOFF_2026-10-28.sha256`.

## Contract

- `<=0`: depleted/deficit cached projection.
- `1-10`: local cached attention band.
- `>10`: above the local cached attention band.
- `UNKNOWN`: no numeric classification.

The `1-10` band is not a product reorder threshold, purchase recommendation or available-to-sell guarantee. No `reorder_level` propagation was added. Batch expiry and status do not change this existing projected-quantity accounting; the derivation neither filters nor rewrites them.

Missing batch groups, malformed collections/rows, duplicate product or batch identities, cross-pharmacy/product evidence, unsafe individual quantities and aggregate overflow fail closed. Unknown products remain in the unfiltered ProductList but cannot enter depleted, local-attention or above-attention filters.

Search, product-limit saturation, stale snapshot metadata, count mismatch, generation mismatch and missing metadata prevent complete-cache claims. Completed cache errors display unavailable before loading; query/loading transitions suppress prior numeric evidence. Workspace-key changes synchronously produce a new result.

## Preservation

Before edits, the accepted PF-SUP-2026-10-28-03 manifest SHA-256 was `607f4e6558557bae717af3e9752ce884dbc099f7bb6e5e40134db383e02926d0` and all `11/11` entries matched. That historical manifest is unchanged; shared ledgers and InventoryView advance additively in this authorized batch.

Static checks preserve:

| File | SHA-256 |
|---|---|
| `src/lib/inventory/expiry.ts` | `7fb287f2c76daece42242f8caec10c2da586283ab7a9304f9d4fc3f60cd73470` |
| `src/lib/inventory/validation.ts` | `dc71cb192fc8044b9f86aa3f3127a7dbc605867ccb424396a97968bd1638a156` |
| `src/lib/inventory/service.ts` | `e513241b416cd3f6f93f20fbdef69b08316aef2b67b67150973cd05b8247e9ff` |
| `src/lib/pos/cart.ts` | `9e30054b25420ba5e9fb6582d9441c55c5f158307bb1ea310dcfad3271bc3710` |
| `src/lib/pos/orchestrator.ts` | `c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c` |
| `src/lib/inventory/productDetailLoad.ts` | `75ccbcc91c00e81c744600bd97b1b2a082b33621b70ef5316af8b8f2bcf91829` |
| `src/components/inventory/ProductDetailModal.tsx` | `fb91eae81b6b4055c6da49629f357a440b9ff7e722062f54acb209ca18a003d7` |

The existing `getBatchesForProduct(pharmacyId, p.id)` call remains singular and unchanged. No datastore query, synchronization, snapshot, IndexedDB, mutation, POS/FEFO, expiry, financial, authentication, authorization, migration or RPC contract changed.

## Executed checks

| Check | Exact result |
|---|---|
| Pure derivation/workspace transitions | `Stock-attention derivation regressions: 47 passed`; exit 0 |
| In-memory production rendering | `Stock-attention production rendering: 15 passed`; exit 0 |
| Static wiring/preservation | `Inventory stock-attention wiring assertions: 35 passed`; exit 0 |
| Focused strict TypeScript | PASS; exit 0; no output |
| Root TypeScript | PASS; exit 0; no output |
| Scoped whitespace | tracked `git diff --check` PASS; new-file scan `0` issues |

## Limitations and next gate

This is local source/static/synthetic/compiler evidence. It is not actual browser/IndexedDB behavior, database/RLS branch enforcement, authoritative inventory reconciliation, reorder-level support, concurrent stock acceptance or production acceptance. AUTH-02 remains deferred.

Next action: independent review of the scoped report and manifest. No protected execution or dependent implementation is authorized.
