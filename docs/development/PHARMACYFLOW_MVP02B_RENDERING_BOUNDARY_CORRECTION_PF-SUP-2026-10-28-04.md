# PharmacyFlow MVP-02B rendering-boundary correction

Date: 2026-10-29  
Owner-referenced finding: `PF-SUP-2026-10-28-04` P2  
Repository / branch / HEAD: `C:\Users\Flourish\Documents\GitHub\pflow-production claude vs` / `main` / `f36985ef7d23aa414e473cb8e79777a429fee375`  
Disposition: **LOCALLY CORRECTED AND SYNTHETICALLY VERIFIED - INDEPENDENT REVIEW REQUIRED**

## Correction

`ProductList` now treats its runtime inputs as untrusted presentation evidence before category extraction, filtering, price formatting or React child rendering.

- A null or non-array product collection renders **Local inventory unavailable**, never the legitimate empty-catalog state.
- A null row or a row with malformed directly consumed fields is excluded from category/filter/render operations and counted as unavailable.
- Mixed collections keep valid products visible and render an explicit malformed-record warning.
- The boundary validates only fields consumed by this view: product ID, name, generic name, SKU, barcode, category, selling price, status and cost price when the caller is allowed to see cost.
- Safe minor-unit prices are required. Malformed displayed prices are not coerced to zero.
- Missing or malformed stock-row collections, rows, quantities, batch counts, bands or duplicate product bindings become absent evidence for presentation. The valid product remains visible with **Unknown cached projection** and **Unknown** batches.
- A numeric stock row is accepted only when quantity and batch count are safe integers and its band agrees with the accepted `<=0`, `1-10`, `>10` semantics.
- Normal category/status filtering and valid quantity presentation continue through the same production helpers/components.

No stock aggregation, cache query, workspace binding, expiry, POS, storage, mutation or protected contract was moved into this boundary.

## Changed files

- `src/components/inventory/ProductList.tsx` - explicit product/stock presentation validation and unavailable/unknown states.
- `src/components/inventory/StockAttentionPanel.test.tsx` - in-memory production rendering regressions and production filter-helper coverage.
- `scripts/acceptance/inventory-stock-attention-wiring.test.mjs` - static boundary and preserved-contract assertions.
- `docs/development/PHARMACYFLOW_PROGRESS.md`
- `docs/development/PHARMACYFLOW_ROADMAP.md`
- `docs/mvp/PHARMACYFLOW_BLOCKER_REGISTER.md`
- `docs/mvp/PHARMACYFLOW_MVP_ROADMAP.md`
- `docs/mvp/PHARMACYFLOW_TEST_EVIDENCE.md`
- this report and its scoped SHA-256 manifest.

All listed source/test/ledger paths were already modified or untracked in the shared dirty working tree except this new report/manifest. Unrelated dirty and untracked work was preserved.

## Focused evidence

| Check | Exact result | Boundary |
|---|---:|---|
| `node --loader ./scripts/typescript-loader.mjs src/components/inventory/StockAttentionPanel.test.tsx` | `Stock-attention production rendering: 60 passed`; exit 0 | React production components rendered to in-memory static markup plus production filter helper |
| `node scripts/acceptance/inventory-stock-attention-wiring.test.mjs` | `Inventory stock-attention wiring assertions: 47 passed`; exit 0 | Static source/query/preserved-hash assertions |
| `.\node_modules\.bin\tsc.cmd -p scripts/acceptance/tsconfig.inventory-stock-attention.json --noEmit` | PASS; exit 0; no output | Focused strict compilation |
| `.\node_modules\.bin\tsc.cmd -p tsconfig.json --noEmit` | PASS; exit 0; no output | Root compilation |
| scoped tracked/new-file whitespace checks | PASS | Changed files only |

The rendering regressions cover null/non-array collections, null rows, mixed valid/invalid rows, malformed category/name/generic/SKU/barcode/status/price fields, cost visibility, missing and malformed stock evidence, safe-integer and band mismatch, normal category/status filters, valid branch quantity presentation and panel/list unknown consistency. The unchanged 47-assertion pure aggregation suite was not rerun.

One pre-final static run failed because the historical assertion still required direct `stockAttention.rows.map` consumption. The production correction intentionally routes those rows through runtime validation, so the static assertion was narrowed to require that validated path. The corrected final static run passed 47/47; no production behavior was changed to satisfy the assertion.

## Preserved semantics and hashes

The static suite reconfirmed these accepted protected-source hashes:

| File | SHA-256 |
|---|---|
| `src/lib/inventory/expiry.ts` | `7fb287f2c76daece42242f8caec10c2da586283ab7a9304f9d4fc3f60cd73470` |
| `src/lib/inventory/validation.ts` | `dc71cb192fc8044b9f86aa3f3127a7dbc605867ccb424396a97968bd1638a156` |
| `src/lib/inventory/service.ts` | `e513241b416cd3f6f93f20fbdef69b08316aef2b67b67150973cd05b8247e9ff` |
| `src/lib/pos/cart.ts` | `9e30054b25420ba5e9fb6582d9441c55c5f158307bb1ea310dcfad3271bc3710` |
| `src/lib/pos/orchestrator.ts` | `c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c` |
| `src/lib/inventory/productDetailLoad.ts` | `75ccbcc91c00e81c744600bd97b1b2a082b33621b70ef5316af8b8f2bcf91829` |
| `src/components/inventory/ProductDetailModal.tsx` | `fb91eae81b6b4055c6da49629f357a440b9ff7e722062f54acb209ca18a003d7` |

The historical `MVP02B_BRANCH_STOCK_ATTENTION_LOCAL_HANDOFF_2026-10-28.sha256` file remains unchanged with SHA-256 `36455dc073cbd3dcc8805e4c105fdb06dbc245a1205b7aadbef34e348fae2ca5`. Its ProductList/test/ledger entries are historical snapshot evidence and are expected to differ after this authorized forward correction.

Branch aggregation, valid negative deficits, individual/aggregate safe-integer checks, display bands, the singular `getBatchesForProduct(pharmacyId, p.id)` query, workspace/loading guards, expiry/POS behavior, storage and protected contracts remain unchanged.

## Limitations and next gate

This is local in-memory rendering, static and compiler evidence. It is not actual browser/IndexedDB/datastore behavior, database/RLS/RPC enforcement, authoritative stock reconciliation, Auth/provider/network or production acceptance. AUTH-02 remains deferred.

Next action: independent review of this report, the scoped manifest and the exact changed-file diff. Do not execute protected operations or continue to another milestone.

## Safety attestation

No browser/datastore, database, RPC, Auth/provider, network, credential, Docker/service/port, installation, Git mutation, migration, provisioning or deployment operation occurred. StoreFlow was not accessed or inspected.
