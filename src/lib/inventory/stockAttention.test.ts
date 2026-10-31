import {
  deriveStockAttention,
  matchesStockAttentionFilter,
} from './stockAttention';
import { ExpiryAttentionWorkspaceBinding } from './expiryAttention';
import { LocalBatch, LocalProduct } from './types';
import { CatalogFreshnessStatus } from '../pos/types';

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};

const USER = '11111111-1111-4111-8111-111111111111';
const PHARMACY = '22222222-2222-4222-8222-222222222222';
const OTHER_PHARMACY = '33333333-3333-4333-8333-333333333333';
const BRANCH = '44444444-4444-4444-8444-444444444444';
const OTHER_BRANCH = '55555555-5555-4555-8555-555555555555';
const PRODUCT_A = '66666666-6666-4666-8666-666666666666';
const PRODUCT_B = '77777777-7777-4777-8777-777777777777';
const BATCH_A = '88888888-8888-4888-8888-888888888888';
const BATCH_B = '99999999-9999-4999-8999-999999999999';

const binding = (changes: Partial<ExpiryAttentionWorkspaceBinding> = {}): ExpiryAttentionWorkspaceBinding => ({
  userId: USER,
  membershipId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  membershipUpdatedAt: '2026-10-28T00:00:00Z',
  pharmacyId: PHARMACY,
  branchId: BRANCH,
  role: 'MANAGER',
  ...changes,
});
const product = (changes: Partial<LocalProduct> = {}): LocalProduct => ({
  id: PRODUCT_A, pharmacy_id: PHARMACY, name: 'Amoxicillin', sku: null, barcode: null,
  generic_name: null, category: null, unit: null, selling_price: 100, cost_price: 50,
  status: 'ACTIVE', source_updated_at: null, synced_at: 100,
  ...changes,
});
const batch = (changes: Partial<LocalBatch> = {}): LocalBatch => ({
  id: BATCH_A, pharmacy_id: PHARMACY, product_id: PRODUCT_A, branch_id: BRANCH,
  batch_number: 'A-1', expiry_date: '2020-01-01', projected_stock: 5,
  selling_price: 100, cost_price: 50, status: 'INACTIVE', source_updated_at: null,
  synced_at: 100, read_model_version: 1,
  ...changes,
});
const freshness = (changes: Partial<CatalogFreshnessStatus> = {}): CatalogFreshnessStatus => ({
  isStale: false, syncedAt: 100, sourceUpdatedAt: null, productCount: 1, batchCount: 1,
  ...changes,
});
const derive = (changes: Partial<Parameters<typeof deriveStockAttention>[0]> = {}) => deriveStockAttention({
  binding: binding(),
  products: [product()],
  batchesMap: { [PRODUCT_A]: [batch()] },
  freshness: freshness(),
  searchQuery: '',
  productLimit: 200,
  ...changes,
});

const complete = derive();
assert(complete.coverage === 'complete_cache', 'matching cache evidence has complete-cache coverage');
assert(complete.rows[0]?.cachedProjectedQuantity === 5, 'current-branch cached projected quantity is aggregated');
assert(complete.rows[0]?.branchBatchCount === 1, 'current-branch batch count is derived by the shared path');
assert(complete.rows[0]?.band === 'LOW_1_TO_10_CACHED_PROJECTED', '1-10 uses the local attention band');
assert(Object.isFrozen(complete) && Object.isFrozen(complete.rows) && Object.isFrozen(complete.rows[0]), 'result and published evidence are immutable');
assert(complete.rows[0]?.cachedProjectedQuantity === 5, 'inactive and expired-looking evidence is not silently filtered');

const crossBranch = derive({
  batchesMap: { [PRODUCT_A]: [batch(), batch({ id: BATCH_B, branch_id: OTHER_BRANCH, projected_stock: 100 })] },
  freshness: freshness({ batchCount: 2 }),
});
assert(crossBranch.rows[0]?.cachedProjectedQuantity === 5, 'other-branch quantity is excluded');
assert(crossBranch.rows[0]?.branchBatchCount === 1, 'other-branch batch is excluded from branch batch count');

const empty = derive({ batchesMap: { [PRODUCT_A]: [] }, freshness: freshness({ batchCount: 0 }) });
assert(empty.coverage === 'complete_cache', 'explicitly loaded empty group can be complete');
assert(empty.rows[0]?.cachedProjectedQuantity === 0, 'explicit empty group produces zero');
assert(empty.rows[0]?.band === 'DEPLETED_OR_DEFICIT_CACHED_PROJECTED', 'explicit zero is depleted cached projection');

const missing = derive({ batchesMap: {}, freshness: freshness({ batchCount: 0 }) });
assert(missing.coverage === 'unknown', 'missing batch group makes coverage unknown');
assert(missing.rows[0]?.cachedProjectedQuantity === null && missing.rows[0]?.band === 'UNKNOWN', 'missing group is unknown rather than zero');

const deficit = derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: -4 })] } });
assert(deficit.rows[0]?.cachedProjectedQuantity === -4, 'valid negative quantity is preserved');
assert(deficit.rows[0]?.band === 'DEPLETED_OR_DEFICIT_CACHED_PROJECTED', 'negative quantity is classified as deficit');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: 11 })] } }).rows[0]?.band === 'ABOVE_10_CACHED_PROJECTED', 'quantity above ten uses above-attention band');

assert(derive({ products: [product(), product()] }).coverage === 'unknown', 'duplicate product identity fails closed');
assert(derive({ products: [product({ pharmacy_id: OTHER_PHARMACY })] }).coverage === 'unknown', 'cross-pharmacy product fails closed');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch(), batch()] }, freshness: freshness({ batchCount: 2 }) }).coverage === 'unknown', 'duplicate batch identity fails closed');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ product_id: PRODUCT_B })] } }).coverage === 'unknown', 'cross-product batch fails closed');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ pharmacy_id: OTHER_PHARMACY })] } }).coverage === 'unknown', 'cross-pharmacy batch fails closed');
assert(derive({ batchesMap: { [PRODUCT_B]: [batch({ product_id: PRODUCT_B })] } }).coverage === 'unknown', 'orphan batch group fails closed');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: 1.5 })] } }).coverage === 'unknown', 'fractional quantity fails closed');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: Number.NaN })] } }).coverage === 'unknown', 'NaN quantity fails closed');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: Number.POSITIVE_INFINITY })] } }).coverage === 'unknown', 'infinite quantity fails closed');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: Number.MAX_SAFE_INTEGER + 1 })] } }).coverage === 'unknown', 'unsafe individual quantity fails closed');
assert(derive({ products: null as unknown as LocalProduct[] }).coverage === 'unknown', 'malformed product collection returns unknown without throwing');
assert(derive({ batchesMap: [] as unknown as Record<string, LocalBatch[]> }).coverage === 'unknown', 'malformed batch-map collection returns unknown without throwing');
assert(derive({ batchesMap: { [PRODUCT_A]: null } as unknown as Record<string, LocalBatch[]> }).coverage === 'unknown', 'malformed batch group returns unknown without iteration');
assert(derive({ batchesMap: { [PRODUCT_A]: [null] } as unknown as Record<string, LocalBatch[]> }).coverage === 'unknown', 'malformed batch row returns unknown without property access');

const overflow = derive({
  batchesMap: {
    [PRODUCT_A]: [
      batch({ projected_stock: Number.MAX_SAFE_INTEGER }),
      batch({ id: BATCH_B, projected_stock: 1 }),
    ],
  },
  freshness: freshness({ batchCount: 2 }),
});
assert(overflow.coverage === 'unknown' && overflow.issues.includes('aggregate_quantity_overflow'), 'unsafe aggregate fails closed');
assert(overflow.rows[0]?.cachedProjectedQuantity === null, 'overflow never publishes a rounded quantity');

assert(derive({ searchQuery: 'amox' }).issues.includes('search_subset'), 'searched subset is partial');
assert(derive({ productLimit: 1 }).issues.includes('product_limit_reached'), 'limit-reached subset is partial');
assert(derive({ freshness: freshness({ isStale: true }) }).issues.includes('snapshot_stale'), 'stale snapshot is partial');
assert(derive({ freshness: freshness({ productCount: 2 }) }).issues.includes('product_count_mismatch'), 'product count mismatch is partial');
assert(derive({ freshness: freshness({ batchCount: 2 }) }).issues.includes('batch_count_mismatch'), 'batch count mismatch is partial');
assert(derive({ products: [product({ synced_at: 99 })] }).issues.includes('snapshot_generation_mismatch'), 'product snapshot generation mismatch is partial');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ synced_at: 99 })] } }).issues.includes('snapshot_generation_mismatch'), 'batch snapshot generation mismatch is partial');
assert(derive({ freshness: null }).coverage === 'partial_cache', 'missing freshness metadata is not complete');

const workspaceB = derive({ binding: binding({ branchId: OTHER_BRANCH, membershipUpdatedAt: '2026-10-28T01:00:00Z' }) });
assert(workspaceB.workspaceKey !== complete.workspaceKey, 'workspace transition changes publication identity');
assert(workspaceB.rows[0]?.cachedProjectedQuantity === 0, 'workspace transition immediately derives only the new branch');

const unknownRow = missing.rows[0];
assert(matchesStockAttentionFilter(unknownRow, 'ALL'), 'unknown product remains visible without numeric filter');
assert(!matchesStockAttentionFilter(unknownRow, 'DEPLETED_DEFICIT'), 'unknown product is not classified depleted');
assert(!matchesStockAttentionFilter(unknownRow, 'IN_STOCK'), 'unknown product is not classified adequately stocked');
assert(matchesStockAttentionFilter(complete.rows[0], 'LOW_STOCK'), 'shared low-band row matches ProductList attention filter');
assert(matchesStockAttentionFilter(deficit.rows[0], 'DEPLETED_DEFICIT'), 'shared deficit row matches ProductList deficit filter');

console.log(`Stock-attention derivation regressions: ${passed} passed`);
