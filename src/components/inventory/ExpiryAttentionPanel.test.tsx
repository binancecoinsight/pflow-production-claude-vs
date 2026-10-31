import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ExpiryAttentionPanel } from './ExpiryAttentionPanel';
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
const PRODUCT = '66666666-6666-4666-8666-666666666666';
const binding: ExpiryAttentionWorkspaceBinding = Object.freeze({
  userId: '11111111-1111-4111-8111-111111111111',
  membershipId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  membershipUpdatedAt: '2026-10-27T00:00:00Z',
  pharmacyId: PHARMACY,
  branchId: BRANCH,
  role: 'MANAGER',
});
const product: LocalProduct = {
  id: PRODUCT, pharmacy_id: PHARMACY, name: 'Amoxicillin', sku: null, barcode: null,
  generic_name: null, category: null, unit: null, selling_price: 100, cost_price: 50,
  status: 'ACTIVE', source_updated_at: null, synced_at: 1,
};
const batch: LocalBatch = {
  id: '88888888-8888-4888-8888-888888888888', pharmacy_id: PHARMACY,
  product_id: PRODUCT, branch_id: BRANCH, batch_number: 'A-1', expiry_date: '2026-10-28',
  projected_stock: 5, selling_price: 100, cost_price: 50, status: 'ACTIVE',
  source_updated_at: null, synced_at: 1, read_model_version: 1,
};
const freshness: CatalogFreshnessStatus = {
  isStale: false, syncedAt: 1, sourceUpdatedAt: null, productCount: 1, batchCount: 1,
};
const render = (changes: Partial<React.ComponentProps<typeof ExpiryAttentionPanel>> = {}): string => renderToStaticMarkup(
  <ExpiryAttentionPanel
    binding={binding}
    products={[product]}
    batchesMap={{ [PRODUCT]: [batch] }}
    freshness={freshness}
    searchQuery=""
    productLimit={200}
    now={() => Date.parse('2026-10-27T12:00:00Z')}
    isLoading={false}
    loadError={false}
    {...changes}
  />,
);

const failedRead = render({ isLoading: true, loadError: true });
assert(failedRead.includes('local cache could not be read'), 'post-error loading/query mismatch combination renders unavailable');
assert(!failedRead.includes('Assessing the current loaded cache'), 'post-error combination does not render perpetual loading');

const retry = render({ isLoading: true, loadError: false });
assert(retry.includes('Assessing the current loaded cache'), 'retry after clearing error renders genuine loading');
assert(!retry.includes('local cache could not be read'), 'retry loading does not retain completed error presentation');

const success = render();
assert(success.includes('Amoxicillin') && success.includes('Cached projected quantity'), 'normal success renders validated cached row');
const empty = render({ batchesMap: { [PRODUCT]: [{ ...batch, projected_stock: 0 }] } });
assert(empty.includes('No matching expiry items in the loaded cache'), 'normal complete empty state remains available');
const partial = render({ searchQuery: 'amox' });
assert(partial.includes('Partial cache coverage'), 'normal searched subset remains partial');

const malformedProducts = render({ products: [null] as unknown as LocalProduct[] });
assert(malformedProducts.includes('cached evidence is invalid'), 'malformed product row renders unknown without crashing');
assert(!malformedProducts.includes('No matching expiry items'), 'malformed product row cannot render reassuring empty state');
const malformedGroups = render({ batchesMap: { [PRODUCT]: null } as unknown as Record<string, LocalBatch[]> });
assert(malformedGroups.includes('cached evidence is invalid'), 'malformed batch group renders unknown without crashing');
const malformedRows = render({ batchesMap: { [PRODUCT]: [null] } as unknown as Record<string, LocalBatch[]> });
assert(malformedRows.includes('cached evidence is invalid'), 'malformed batch row renders unknown without crashing');

console.log(`ExpiryAttentionPanel.test.tsx: ${passed} assertions passed`);
