import {
  deriveExpiryAttention,
  deriveExpiryAttentionWorkspace,
  expiryAttentionWorkspaceKey,
  parseStrictInventoryDate,
} from './expiryAttention';
import { LocalBatch, LocalProduct } from './types';
import { Branch, Pharmacy, PharmacyMember } from '../../types/database';
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

const pharmacy: Pharmacy = {
  id: PHARMACY, name: 'P', owner_id: USER, currency: 'NGN',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const branch: Branch = {
  id: BRANCH, pharmacy_id: PHARMACY, name: 'B', is_main: true,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
};
const membership: PharmacyMember = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', user_id: USER, pharmacy_id: PHARMACY,
  role: 'MANAGER', default_branch_id: BRANCH, status: 'ACTIVE',
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-10-27T00:00:00Z',
};
const binding = deriveExpiryAttentionWorkspace({ userId: USER, membership, pharmacy, branch, role: 'MANAGER' });
assert(binding !== null, 'coherent active workspace produces an attention binding');
if (!binding) throw new Error('fixture binding unavailable');

const product = (changes: Partial<LocalProduct> = {}): LocalProduct => ({
  id: PRODUCT_A, pharmacy_id: PHARMACY, name: 'Amoxicillin', sku: null, barcode: null,
  generic_name: null, category: null, unit: null, selling_price: 100, cost_price: 50,
  status: 'ACTIVE', source_updated_at: null, synced_at: 1,
  ...changes,
});
const batch = (changes: Partial<LocalBatch> = {}): LocalBatch => ({
  id: BATCH_A, pharmacy_id: PHARMACY, product_id: PRODUCT_A, branch_id: BRANCH,
  batch_number: 'A-1', expiry_date: '2026-10-27', projected_stock: 5,
  selling_price: 100, cost_price: 50, status: 'ACTIVE', source_updated_at: null,
  synced_at: 1, read_model_version: 1,
  ...changes,
});
const freshness = (changes: Partial<CatalogFreshnessStatus> = {}): CatalogFreshnessStatus => ({
  isStale: false, syncedAt: 1, sourceUpdatedAt: null, productCount: 1, batchCount: 1,
  ...changes,
});
const derive = (changes: Partial<Parameters<typeof deriveExpiryAttention>[0]> = {}) => deriveExpiryAttention({
  binding,
  products: [product()],
  batchesMap: { [PRODUCT_A]: [batch()] },
  freshness: freshness(),
  searchQuery: '',
  productLimit: 200,
  now: () => Date.parse('2026-10-27T23:59:59Z'),
  ...changes,
});

assert(parseStrictInventoryDate('2024-02-29') !== null, 'leap-year date is accepted');
assert(parseStrictInventoryDate('2023-02-29') === null, 'non-leap February 29 is rejected');
assert(parseStrictInventoryDate('1900-02-29') === null, 'century non-leap date is rejected');
assert(parseStrictInventoryDate('2000-02-29') !== null, '400-year leap date is accepted');
assert(parseStrictInventoryDate('2026-04-31') === null, 'impossible month day is rejected without normalization');
assert(parseStrictInventoryDate('2026-13-01') === null, 'invalid month is rejected');

const sameDay = derive();
assert(sameDay.coverage === 'complete_cache', 'matching cache and metadata produce complete-cache coverage');
assert(sameDay.rows[0]?.classification === 'EXPIRED_TIME_DERIVED', 'same UTC calendar day is time-derived expired');
assert(sameDay.rows[0]?.serverStatus === 'ACTIVE', 'server status is preserved separately from derived classification');

const ninety = derive({ batchesMap: { [PRODUCT_A]: [batch({ expiry_date: '2027-01-25' })] } });
assert(ninety.rows[0]?.daysUntilExpiry === 90, 'inclusive 90-day warning boundary is included');
const ninetyOne = derive({ batchesMap: { [PRODUCT_A]: [batch({ expiry_date: '2027-01-26' })] } });
assert(ninetyOne.rows.length === 0, 'day 91 is outside the attention window');

const branchFiltered = derive({
  batchesMap: { [PRODUCT_A]: [batch({ branch_id: OTHER_BRANCH })] },
});
assert(branchFiltered.coverage === 'complete_cache' && branchFiltered.rows.length === 0, 'valid other-branch batches are excluded');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: 0 })] } }).rows.length === 0, 'zero projected quantity is excluded');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: -1 })] } }).rows.length === 0, 'negative projected quantity is excluded');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ projected_stock: 1.5 })] } }).coverage === 'unknown', 'fractional projected quantity invalidates evidence');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ expiry_date: '2026-02-30' })] } }).coverage === 'unknown', 'impossible expiry invalidates evidence');
assert(derive({ products: [product({ pharmacy_id: OTHER_PHARMACY })] }).coverage === 'unknown', 'cross-tenant product invalidates evidence');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ pharmacy_id: OTHER_PHARMACY })] } }).coverage === 'unknown', 'cross-tenant batch invalidates evidence');
assert(derive({ batchesMap: { [PRODUCT_B]: [batch({ product_id: PRODUCT_B })] } }).coverage === 'unknown', 'orphan batch group invalidates evidence');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ product_id: PRODUCT_B })] } }).coverage === 'unknown', 'batch-to-product mismatch invalidates evidence');
assert(derive({ products: [product(), product()] }).coverage === 'unknown', 'duplicate product identity invalidates evidence');
assert(derive({
  batchesMap: { [PRODUCT_A]: [batch(), batch()] },
  freshness: freshness({ batchCount: 2 }),
}).coverage === 'unknown', 'duplicate batch identity invalidates evidence');
assert(derive({ batchesMap: {} }).coverage === 'unknown', 'missing product batch group invalidates evidence');
assert(derive({ products: null as unknown as LocalProduct[] }).coverage === 'unknown', 'null product collection returns unknown without throwing');
assert(derive({ batchesMap: null as unknown as Record<string, LocalBatch[]> }).coverage === 'unknown', 'null batch collection returns unknown without throwing');
assert(derive({ batchesMap: [] as unknown as Record<string, LocalBatch[]> }).coverage === 'unknown', 'array-shaped batch map returns unknown without throwing');
assert(derive({ batchesMap: { [PRODUCT_A]: null } as unknown as Record<string, LocalBatch[]> }).coverage === 'unknown', 'null batch group returns unknown without counting it');
assert(derive({ products: [null] as unknown as LocalProduct[] }).coverage === 'unknown', 'null product row returns unknown without property access');
assert(derive({ products: [{}] as unknown as LocalProduct[] }).coverage === 'unknown', 'malformed product row returns unknown without property access');
assert(derive({ batchesMap: { [PRODUCT_A]: [null] } as unknown as Record<string, LocalBatch[]> }).coverage === 'unknown', 'null batch row returns unknown without property access');
assert(derive({ batchesMap: { [PRODUCT_A]: [{}] } as unknown as Record<string, LocalBatch[]> }).coverage === 'unknown', 'malformed batch row returns unknown without property access');

assert(derive({ freshness: null }).coverage === 'partial_cache', 'missing freshness metadata is partial rather than reassuring');
assert(derive({ searchQuery: 'amox' }).issues.includes('search_subset'), 'searched cache is explicitly partial');
assert(derive({ productLimit: 1 }).issues.includes('product_limit_reached'), 'cache at product limit is explicitly partial');
assert(derive({ freshness: freshness({ productCount: 2 }) }).issues.includes('product_count_mismatch'), 'product count mismatch is partial');
assert(derive({ freshness: freshness({ batchCount: 2 }) }).issues.includes('batch_count_mismatch'), 'batch count mismatch is partial');
assert(derive({ freshness: freshness({ productCount: -1 }) }).coverage === 'unknown', 'invalid snapshot counts produce unknown coverage');
assert(derive({ products: [product({ synced_at: 2 })] }).issues.includes('snapshot_generation_mismatch'), 'incompatible product snapshot generation is partial');
assert(derive({ batchesMap: { [PRODUCT_A]: [batch({ synced_at: 2 })] } }).issues.includes('snapshot_generation_mismatch'), 'incompatible batch snapshot generation is partial');

const ordered = derive({
  products: [product(), product({ id: PRODUCT_B, name: 'Beta' })],
  batchesMap: {
    [PRODUCT_A]: [batch({ id: BATCH_A, expiry_date: '2026-10-29', batch_number: 'Z' })],
    [PRODUCT_B]: [batch({ id: BATCH_B, product_id: PRODUCT_B, expiry_date: '2026-10-28', batch_number: 'A' })],
  },
  freshness: freshness({ productCount: 2, batchCount: 2 }),
});
assert(ordered.rows.map((row) => row.batchId).join(',') === `${BATCH_B},${BATCH_A}`, 'rows have deterministic expiry-first ordering');
assert(Object.isFrozen(ordered) && Object.isFrozen(ordered.rows) && Object.isFrozen(ordered.rows[0]), 'published result and rows are immutable');

assert(deriveExpiryAttentionWorkspace({ userId: USER, membership: { ...membership, status: 'SUSPENDED' }, pharmacy, branch, role: 'MANAGER' }) === null, 'inactive membership cannot bind attention');
assert(deriveExpiryAttentionWorkspace({ userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', membership, pharmacy, branch, role: 'MANAGER' }) === null, 'different user cannot bind membership');
assert(deriveExpiryAttentionWorkspace({ userId: USER, membership, pharmacy, branch: { ...branch, pharmacy_id: OTHER_PHARMACY }, role: 'MANAGER' }) === null, 'cross-tenant branch cannot bind attention');
assert(deriveExpiryAttentionWorkspace({ userId: USER, membership, pharmacy, branch, role: 'OWNER' }) === null, 'role mismatch cannot bind attention');

const switchedBinding = { ...binding, branchId: OTHER_BRANCH };
assert(expiryAttentionWorkspaceKey(binding) !== expiryAttentionWorkspaceKey(switchedBinding), 'workspace key changes immediately with branch');
assert(derive({ binding: switchedBinding }).rows.length === 0, 'old branch rows do not publish under switched branch binding');

console.log(`expiryAttention.test.ts: ${passed} assertions passed`);
