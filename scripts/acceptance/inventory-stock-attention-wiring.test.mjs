import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

let passed = 0;
const assert = (condition, message) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const read = (path) => readFileSync(path, 'utf8');
const hash = (text) => createHash('sha256').update(text).digest('hex');

const derivation = read('src/lib/inventory/stockAttention.ts');
const panel = read('src/components/inventory/StockAttentionPanel.tsx');
const productList = read('src/components/inventory/ProductList.tsx');
const inventoryView = read('src/components/inventory/InventoryView.tsx');
const rendering = read('src/components/inventory/StockAttentionPanel.test.tsx');

assert(inventoryView.match(/deriveStockAttention\(\{/g)?.length === 1, 'InventoryView runs one shared stock derivation');
assert(inventoryView.includes('result={stockAttention}') && inventoryView.includes('stockAttention={stockAttention}'), 'panel and ProductList receive the same result object');
assert(inventoryView.indexOf('catalogReadError') < inventoryView.indexOf("? 'unavailable' as const"), 'completed catalog error drives unavailable evidence');
assert(inventoryView.includes("loadedCatalogQuery !== searchQuery.trim()"), 'query transition suppresses previous stock evidence');
assert(inventoryView.match(/getBatchesForProduct\(pharmacyId, p.id\)/g)?.length === 1, 'existing catalog batch query and arguments are unchanged');

assert(!productList.includes('batchesMap'), 'ProductList has no independent all-branch batch input');
assert(!productList.includes('projected_stock'), 'ProductList does not independently aggregate raw quantities');
assert(!productList.includes('productStockMap'), 'legacy independent stock map is removed');
assert(productList.includes('stockRowsByProductId(stockAttention)'), 'ProductList validates and consumes shared derived rows');
assert(productList.includes('matchesStockAttentionFilter'), 'numeric filters use shared bands');
assert(productList.includes('Unknown cached projection'), 'unknown products remain visibly distinguishable');
assert(productList.includes('Cached branch projection'), 'numeric quantities are labelled cached and branch projected');
assert(productList.includes('stockEvidence?.branchBatchCount'), 'batch count uses shared current-branch evidence');
assert(productList.includes('prepareProductListPresentation(products, canSeeCostPrice)'), 'ProductList validates the runtime product collection before category/filter/render work');
assert(productList.includes('The cached product collection is malformed or unavailable'), 'malformed collection has an explicit unavailable presentation');
assert(productList.includes('They are not being presented as empty inventory'), 'malformed product rows cannot claim an empty catalog');
assert(productList.includes('Number.isSafeInteger(candidate.selling_price)'), 'displayed selling price requires explicit safe minor units');
assert(productList.includes('Number.isSafeInteger(value.cachedProjectedQuantity)'), 'presented stock quantity requires explicit safe-integer evidence');
assert(productList.includes("value.band === expectedBand(value.cachedProjectedQuantity)"), 'stock band must agree with the validated quantity');
assert(productList.includes('return new Map()'), 'missing or malformed stock-row collections fail to unknown presentation');

assert(derivation.includes('Number.isSafeInteger(value.projected_stock)'), 'individual projected quantities require safe integers');
assert(derivation.includes('Number.isSafeInteger(next)'), 'aggregate quantities require safe integers');
assert(derivation.includes("candidate.branch_id === input.binding?.branchId"), 'aggregation is current-branch scoped');
assert(derivation.includes("band: 'UNKNOWN'"), 'missing evidence has an explicit unknown band');
assert(derivation.includes("if (filter === 'ALL') return true"), 'unfiltered list preserves unknown products');
assert(derivation.includes("if (!row || row.band === 'UNKNOWN') return false"), 'numeric filters reject unknown evidence');
assert(derivation.includes("if (quantity <= 0)"), 'valid negatives remain deficit evidence');
assert(!derivation.includes('Math.max'), 'negative quantities are not clamped');
assert(!derivation.includes('reorder_level'), 'no reorder-level contract is introduced');
assert(!derivation.includes('expiry_date') && !derivation.includes("status ==="), 'stock aggregation adds no expiry/status filtering');

assert(panel.includes('not authoritative stock, available-to-sell guarantees, reorder levels or purchase recommendations'), 'panel disclaims authoritative/reorder meaning');
assert(panel.includes('Missing evidence is not zero stock'), 'panel states missing evidence is not zero');
assert(panel.indexOf("evidenceState === 'unavailable'") < panel.indexOf("evidenceState === 'loading'"), 'panel gives completed error precedence over loading');
assert(rendering.includes('ProductList renders the same shared quantity'), 'rendering regression compares panel and ProductList');
assert(rendering.includes('loading suppresses old attention rows'), 'rendering regression covers transition suppression');
assert(rendering.includes('null/non-array product collection renders unavailable'), 'rendering regression covers malformed product collections');
assert(rendering.includes('malformed directly consumed presentation field fails closed'), 'rendering regression covers malformed presentation fields');
assert(rendering.includes('valid product with missing stock row remains visible as unknown'), 'rendering regression preserves valid products with unknown stock');
assert(rendering.includes('normal category and status filtering preserves the valid row'), 'production helper regression covers normal category/status filtering');
assert(rendering.includes('panel and list agree on non-reassuring unknown evidence'), 'rendering regression preserves panel/list unknown consistency');

const preservedHashes = new Map([
  ['src/lib/inventory/expiry.ts', '7fb287f2c76daece42242f8caec10c2da586283ab7a9304f9d4fc3f60cd73470'],
  ['src/lib/inventory/validation.ts', 'dc71cb192fc8044b9f86aa3f3127a7dbc605867ccb424396a97968bd1638a156'],
  ['src/lib/inventory/service.ts', 'e513241b416cd3f6f93f20fbdef69b08316aef2b67b67150973cd05b8247e9ff'],
  ['src/lib/pos/cart.ts', '9e30054b25420ba5e9fb6582d9441c55c5f158307bb1ea310dcfad3271bc3710'],
  ['src/lib/pos/orchestrator.ts', 'c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c'],
  ['src/lib/inventory/productDetailLoad.ts', '75ccbcc91c00e81c744600bd97b1b2a082b33621b70ef5316af8b8f2bcf91829'],
  ['src/components/inventory/ProductDetailModal.tsx', 'fb91eae81b6b4055c6da49629f357a440b9ff7e722062f54acb209ca18a003d7'],
]);
for (const [path, expected] of preservedHashes) {
  assert(hash(read(path)) === expected, `${path} preserves its accepted hash`);
}

console.log(`Inventory stock-attention wiring assertions: ${passed} passed`);
