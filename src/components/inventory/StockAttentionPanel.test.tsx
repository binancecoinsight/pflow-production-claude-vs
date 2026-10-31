import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StockAttentionPanel } from './StockAttentionPanel';
import {
  ProductList,
  filterProductListPresentation,
  prepareProductListPresentation,
} from './ProductList';
import { deriveStockAttention } from '../../lib/inventory/stockAttention';
import { ExpiryAttentionWorkspaceBinding } from '../../lib/inventory/expiryAttention';
import { LocalBatch, LocalProduct } from '../../lib/inventory/types';
import { CatalogFreshnessStatus } from '../../lib/pos/types';

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};

const PHARMACY = '22222222-2222-4222-8222-222222222222';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const OTHER_BRANCH = '55555555-5555-4555-8555-555555555555';
const PRODUCT = '66666666-6666-4666-8666-666666666666';
const binding: ExpiryAttentionWorkspaceBinding = {
  userId: '11111111-1111-4111-8111-111111111111',
  membershipId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  membershipUpdatedAt: '2026-10-28T00:00:00Z',
  pharmacyId: PHARMACY,
  branchId: BRANCH,
  role: 'MANAGER',
};
const product: LocalProduct = {
  id: PRODUCT, pharmacy_id: PHARMACY, name: 'Amoxicillin', sku: null, barcode: null,
  generic_name: null, category: null, unit: null, selling_price: 100, cost_price: 50,
  status: 'ACTIVE', source_updated_at: null, synced_at: 100,
};
const batch: LocalBatch = {
  id: '88888888-8888-4888-8888-888888888888', pharmacy_id: PHARMACY,
  product_id: PRODUCT, branch_id: BRANCH, batch_number: 'A-1', expiry_date: '2027-01-01',
  projected_stock: 5, selling_price: 100, cost_price: 50, status: 'ACTIVE',
  source_updated_at: null, synced_at: 100, read_model_version: 1,
};
const freshness: CatalogFreshnessStatus = {
  isStale: false, syncedAt: 100, sourceUpdatedAt: null, productCount: 1, batchCount: 1,
};
const result = (changes: Partial<Parameters<typeof deriveStockAttention>[0]> = {}) => deriveStockAttention({
  binding,
  products: [product],
  batchesMap: { [PRODUCT]: [batch] },
  freshness,
  searchQuery: '',
  productLimit: 200,
  ...changes,
});
const renderPanel = (
  stock = result(),
  evidenceState: React.ComponentProps<typeof StockAttentionPanel>['evidenceState'] = 'ready',
) => renderToStaticMarkup(<StockAttentionPanel result={stock} evidenceState={evidenceState} />);
const renderList = (
  stock = result(),
  evidenceState: React.ComponentProps<typeof ProductList>['stockEvidenceState'] = 'ready',
  products: unknown = [product],
  canSeeCostPrice = false,
) => renderToStaticMarkup(
  <ProductList
    products={products}
    selectedProductId={null}
    onSelectProduct={() => undefined}
    currency="NGN"
    canSeeCostPrice={canSeeCostPrice}
    searchQuery=""
    onSearchChange={() => undefined}
    stockAttention={stock}
    stockEvidenceState={evidenceState}
    isLoading={false}
    onSync={() => undefined}
  />,
);

const panel = renderPanel();
const list = renderList();
assert(panel.includes('Amoxicillin') && panel.includes('>5<'), 'attention panel renders the shared quantity');
assert(list.includes('Amoxicillin') && list.includes('5 units'), 'ProductList renders the same shared quantity');
assert(panel.includes('not a reorder threshold'), 'panel labels the 1-10 band as non-reorder');
assert(list.includes('Cached branch projection'), 'ProductList labels quantities cached and branch projected');

const otherBranch = result({
  batchesMap: { [PRODUCT]: [{ ...batch, branch_id: OTHER_BRANCH, projected_stock: 50 }] },
});
assert(renderPanel(otherBranch).includes('>0<'), 'panel uses current-branch zero rather than other-branch quantity');
assert(renderList(otherBranch).includes('0 units'), 'ProductList agrees with panel on current-branch zero');

const missing = result({ batchesMap: {}, freshness: { ...freshness, batchCount: 0 } });
const missingPanel = renderPanel(missing);
const missingList = renderList(missing);
assert(missingPanel.includes('Missing evidence is not zero stock'), 'panel presents missing group as unknown');
assert(missingList.includes('Amoxicillin'), 'unknown product remains visible in unfiltered ProductList');
assert(missingList.includes('Unknown cached projection'), 'ProductList distinguishes unknown evidence from zero');
assert(!missingList.includes('0 units'), 'missing evidence is not rendered as depleted zero');

const unavailable = renderPanel(result(), 'unavailable');
assert(unavailable.includes('local cache could not be read'), 'completed cache error renders unavailable');
assert(!unavailable.includes('Assessing the current loaded cache'), 'error state does not render loading');
const loading = renderPanel(result(), 'loading');
assert(loading.includes('Assessing the current loaded cache'), 'genuine transition renders loading');
assert(!loading.includes('Amoxicillin'), 'loading suppresses old attention rows');

const partial = renderPanel(result({ searchQuery: 'amox' }));
assert(partial.includes('Partial cache coverage') && partial.includes('searched cache subset'), 'searched subset renders partial coverage');

for (const malformedCollection of [null, { not: 'an array' }]) {
  const malformedCollectionMarkup = renderList(result(), 'ready', malformedCollection);
  assert(malformedCollectionMarkup.includes('Local inventory unavailable'), 'null/non-array product collection renders unavailable');
  assert(malformedCollectionMarkup.includes('not being presented as empty inventory'), 'malformed collection is not presented as empty inventory');
  assert(!malformedCollectionMarkup.includes('Local Inventory Empty'), 'malformed collection never uses the empty-catalog state');
}

const nullRowMarkup = renderList(result(), 'ready', [null]);
assert(nullRowMarkup.includes('Product records unavailable'), 'null product row renders controlled unavailable evidence');
assert(!nullRowMarkup.includes('Local Inventory Empty'), 'null product row is not presented as empty inventory');

const categorizedProduct: LocalProduct = {
  ...product,
  category: 'Antibiotics',
  generic_name: 'Amoxicillin trihydrate',
  sku: 'AMOX-1',
  barcode: '12345',
};
const mixedRows = renderList(result(), 'ready', [categorizedProduct, null]);
assert(mixedRows.includes('Amoxicillin') && mixedRows.includes('Antibiotics'), 'valid product remains rendered beside a malformed row');
assert(mixedRows.includes('1 cached product record is unavailable'), 'mixed collection labels malformed row without hiding valid rows');

for (const malformedProduct of [
  { ...product, category: { unsafe: true } },
  { ...product, name: { unsafe: true } },
  { ...product, generic_name: 7 },
  { ...product, sku: [] },
  { ...product, barcode: false },
  { ...product, status: null },
  { ...product, selling_price: Number.NaN },
  { ...product, selling_price: Number.MAX_SAFE_INTEGER + 1 },
]) {
  const malformedFieldMarkup = renderList(result(), 'ready', [malformedProduct]);
  assert(malformedFieldMarkup.includes('Product records unavailable'), 'malformed directly consumed presentation field fails closed');
  assert(!malformedFieldMarkup.includes('Local Inventory Empty'), 'malformed presentation field never becomes empty inventory');
}

const hiddenMalformedCost = renderList(result(), 'ready', [{ ...product, cost_price: 'invalid' }]);
assert(hiddenMalformedCost.includes('Amoxicillin'), 'unconsumed hidden cost field does not broaden the presentation boundary');
const visibleMalformedCost = renderList(result(), 'ready', [{ ...product, cost_price: 'invalid' }], true);
assert(visibleMalformedCost.includes('Product records unavailable'), 'visible malformed cost field fails closed instead of formatting as zero');

const missingStockRows = renderList({ ...result(), rows: [] });
assert(missingStockRows.includes('Amoxicillin') && missingStockRows.includes('Unknown cached projection'), 'valid product with missing stock row remains visible as unknown');
assert(!missingStockRows.includes('0 units'), 'missing stock row is not coerced to zero');

for (const malformedStockRow of [
  null,
  { ...result().rows[0], cachedProjectedQuantity: Number.NaN },
  { ...result().rows[0], cachedProjectedQuantity: Number.MAX_SAFE_INTEGER + 1 },
  { ...result().rows[0], cachedProjectedQuantity: 5, band: 'ABOVE_10_CACHED_PROJECTED' },
  { ...result().rows[0], branchBatchCount: -1 },
]) {
  const malformedStockMarkup = renderList({ ...result(), rows: [malformedStockRow] } as unknown as ReturnType<typeof result>);
  assert(malformedStockMarkup.includes('Amoxicillin') && malformedStockMarkup.includes('Unknown cached projection'), 'malformed stock evidence leaves valid product visible as unknown');
  assert(!malformedStockMarkup.includes('5 units') && !malformedStockMarkup.includes('0 units'), 'malformed stock evidence receives no reassuring quantity');
}

const presentation = prepareProductListPresentation([
  categorizedProduct,
  { ...product, id: '77777777-7777-4777-8777-777777777777', name: 'Inactive tonic', category: 'Supplements', status: 'INACTIVE' },
], false);
assert(presentation.rows.length === 2, 'valid production presentation rows pass the boundary');
assert(filterProductListPresentation(presentation.rows, 'ACTIVE', 'Antibiotics', 'ALL', new Map(), 'ready').map((row) => row.name).join(',') === 'Amoxicillin', 'normal category and status filtering preserves the valid row');
assert(filterProductListPresentation(presentation.rows, 'INACTIVE', 'Supplements', 'ALL', new Map(), 'ready').map((row) => row.name).join(',') === 'Inactive tonic', 'normal inactive/category filtering remains available');

const malformedStockPanel = renderPanel({ ...missing, rows: missing.rows });
assert(malformedStockPanel.includes('Missing evidence is not zero stock') && missingStockRows.includes('Unknown cached projection'), 'panel and list agree on non-reassuring unknown evidence');
assert(!missingStockRows.includes('Local Inventory Empty'), 'unknown stock evidence does not imply an empty product catalog');

console.log(`Stock-attention production rendering: ${passed} passed`);
