import { indexedDB } from 'fake-indexeddb';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  adjustInventoryStock,
  dispatchStockTransfer,
  getBatchesForProduct,
  getEligibleBatchesForProduct,
  getInventorySnapshotMetadata,
  getProductById,
  ingestAuthoritativeSnapshot,
  listLocalProducts,
  receiveStockTransfer,
  refreshInventorySnapshot,
  submitStockIntake,
} from './index';
import type { AuthoritativeSnapshotContract, LocalBatch } from './types';
import { deriveStockAttention } from './stockAttention';
import { deriveExpiryAttention, type ExpiryAttentionWorkspaceBinding } from './expiryAttention';
import { ProductDetailLoadCoordinator, runProductDetailLoad } from './productDetailLoad';
import { addItemToCart, finalizePosSale, loadOrCreateDurableCart } from '../pos/index';
import { getCheckoutDraft, getLocalTransaction, getQueueItem, openOfflineDb } from '../offline/index';
import { getLocalSale } from '../sales/service';

const ids = {
  pharmacyA: '11111111-1111-4111-8111-111111111111',
  pharmacyB: '22222222-2222-4222-8222-222222222222',
  branchA: '33333333-3333-4333-8333-333333333333',
  branchB: '44444444-4444-4444-8444-444444444444',
  user: '55555555-5555-4555-8555-555555555555',
  productA: 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa',
  productB: 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa',
  batchPositive: 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb',
  batchDeficit: 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb',
  batchOtherBranch: 'bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb',
  batchProductB: 'bbbbbbbb-4444-4bbb-8bbb-bbbbbbbbbbbb',
  purchase: '66666666-6666-4666-8666-666666666666',
  adjustment: '77777777-7777-4777-8777-777777777777',
  transfer: '88888888-8888-4888-8888-888888888888',
  opIntake: '99999999-1111-4999-8999-999999999999',
  opAdjustment: '99999999-2222-4999-8999-999999999999',
  opDispatch: '99999999-3333-4999-8999-999999999999',
  opReceive: '99999999-4444-4999-8999-999999999999',
};

const at = '2026-10-29T10:00:00.000Z';

function snapshot(sourceUpdatedAt = at): AuthoritativeSnapshotContract {
  const products = [
    { id: ids.productA, pharmacy_id: ids.pharmacyA, name: 'Branch medicine', sku: 'MED-1', barcode: '1001', generic_name: null, category: 'Pain', unit: 'tablet', selling_price: 1200, cost_price: 700, status: 'ACTIVE', updated_at: sourceUpdatedAt },
    { id: ids.productB, pharmacy_id: ids.pharmacyA, name: 'Evidence medicine', sku: 'MED-2', barcode: '1002', generic_name: null, category: 'Cold', unit: 'bottle', selling_price: 1800, cost_price: 900, status: 'ACTIVE', updated_at: sourceUpdatedAt },
  ];
  const batches = [
    { id: ids.batchPositive, pharmacy_id: ids.pharmacyA, product_id: ids.productA, branch_id: ids.branchA, batch_number: 'POSITIVE', expiry_date: '2026-12-15', quantity: 6, selling_price: 1200, cost_price: 700, status: 'ACTIVE', updated_at: sourceUpdatedAt },
    { id: ids.batchDeficit, pharmacy_id: ids.pharmacyA, product_id: ids.productA, branch_id: ids.branchA, batch_number: 'DEFICIT', expiry_date: '2027-06-30', quantity: -4, selling_price: 1200, cost_price: 700, status: 'ACTIVE', updated_at: sourceUpdatedAt },
    { id: ids.batchOtherBranch, pharmacy_id: ids.pharmacyA, product_id: ids.productA, branch_id: ids.branchB, batch_number: 'OTHER-BRANCH', expiry_date: '2027-06-30', quantity: 100, selling_price: 1200, cost_price: 700, status: 'ACTIVE', updated_at: sourceUpdatedAt },
    { id: ids.batchProductB, pharmacy_id: ids.pharmacyA, product_id: ids.productB, branch_id: ids.branchA, batch_number: 'PRODUCT-B', expiry_date: '2027-06-30', quantity: 12, selling_price: 1800, cost_price: 900, status: 'ACTIVE', updated_at: sourceUpdatedAt },
  ];
  return {
    pharmacy_id: ids.pharmacyA,
    snapshot_version: Date.parse(sourceUpdatedAt),
    generated_at: sourceUpdatedAt,
    source_updated_at: sourceUpdatedAt,
    product_count: products.length,
    batch_count: batches.length,
    products,
    batches,
  };
}

function mockClient(config: {
  rpc?: Record<string, unknown>;
  products?: unknown[];
  batches?: unknown[];
  networkFail?: boolean;
  delayProducts?: (() => Promise<void>) | null;
  counts?: Record<string, number>;
}): SupabaseClient {
  const products = config.products ?? snapshot().products;
  const batches = config.batches ?? snapshot().batches;
  return {
    auth: {
      getSession: async () => {
        if (config.networkFail) throw new Error('injected fetch failure');
        return { data: { session: { user: { id: ids.user } } }, error: null };
      },
    },
    rpc: async (name: string) => ({ data: config.rpc?.[name] ?? null, error: null }),
    from: (table: string) => {
      config.counts && (config.counts[table] = (config.counts[table] ?? 0) + 1);
      let rangeFrom = 0;
      let rangeTo = Number.MAX_SAFE_INTEGER;
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        range: (from: number, to: number) => { rangeFrom = from; rangeTo = to; return builder; },
        maybeSingle: async () => ({ data: table === 'pharmacy_members' ? { id: 'member', pharmacy_id: ids.pharmacyA, user_id: ids.user, role: 'OWNER', status: 'ACTIVE' } : null, error: null }),
        then: async (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
          try {
            if (config.networkFail) throw new Error('injected fetch failure');
            if (table === 'products' && config.delayProducts) await config.delayProducts();
            const rows = table === 'products' ? products : table === 'inventory_batches' ? batches : [];
            resolve({ data: rows.slice(rangeFrom, rangeTo + 1), error: null });
          } catch (error) { reject(error); }
        },
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

async function run() {
  let passed = 0;
  let failed = 0;
  const check = (condition: boolean, label: string) => {
    if (condition) { passed += 1; console.log(`  ✓ ${label}`); }
    else { failed += 1; console.error(`  ✗ ${label}`); }
  };
  const readCompleteInventoryCache = async () => {
    const cacheProducts = (await listLocalProducts(ids.pharmacyA, 100, indexedDB))
      .sort((left, right) => left.id.localeCompare(right.id));
    const cacheBatches = (await Promise.all(cacheProducts.map((product) =>
      getBatchesForProduct(ids.pharmacyA, product.id, undefined, indexedDB))))
      .flat().sort((left, right) => left.id.localeCompare(right.id));
    return {
      products: cacheProducts,
      batches: cacheBatches,
      metadata: await getInventorySnapshotMetadata(ids.pharmacyA, indexedDB),
    };
  };
  const rejectsWithoutReplacement = async (candidate: AuthoritativeSnapshotContract, expected: string, label: string) => {
    const before = JSON.stringify(await readCompleteInventoryCache());
    let rejection = '';
    try {
      const result = await ingestAuthoritativeSnapshot(candidate, { customFactory: indexedDB, force: true });
      rejection = `${result.status}:${result.error ?? ''}`;
    } catch (error) {
      rejection = error instanceof Error ? error.message : String(error);
    }
    const after = JSON.stringify(await readCompleteInventoryCache());
    check(rejection.includes(expected), `${label}: explicit rejection identifies the invalid evidence`);
    check(after === before, `${label}: complete products, batches and metadata remain byte-equivalent`);
  };

  console.log('--- MVP-02-CLOSE INVENTORY WORKFLOW INTEGRATION ---');
  await openOfflineDb(indexedDB);

  const initial = await ingestAuthoritativeSnapshot(snapshot(), { customFactory: indexedDB });
  check(initial.success && initial.status === 'SYNCED', 'validated snapshot is atomically ingested');
  check((await listLocalProducts(ids.pharmacyA, 10, indexedDB)).length === 2, 'catalog lookup reads the pharmacy partition');
  check((await listLocalProducts(ids.pharmacyB, 10, indexedDB)).length === 0, 'tenant lookup cannot see another pharmacy cache');
  const branchBatches = await getBatchesForProduct(ids.pharmacyA, ids.productA, ids.branchA, indexedDB);
  check(branchBatches.length === 2 && branchBatches.every((row) => row.branch_id === ids.branchA), 'batch lookup is current-branch scoped');

  const products = await listLocalProducts(ids.pharmacyA, 10, indexedDB);
  const batchesMap: Record<string, LocalBatch[]> = {};
  for (const product of products) batchesMap[product.id] = await getBatchesForProduct(ids.pharmacyA, product.id, undefined, indexedDB);
  const meta = await getInventorySnapshotMetadata(ids.pharmacyA, indexedDB);
  const freshness = { isStale: false, syncedAt: meta?.synced_at ?? null, sourceUpdatedAt: meta?.source_updated_at ?? null, productCount: meta?.product_count ?? 0, batchCount: meta?.batch_count ?? 0 };
  const binding: ExpiryAttentionWorkspaceBinding = { userId: ids.user, membershipId: 'member', membershipUpdatedAt: at, pharmacyId: ids.pharmacyA, branchId: ids.branchA, role: 'OWNER' };
  const stock = deriveStockAttention({ binding, products, batchesMap, freshness, searchQuery: '', productLimit: 50 });
  check(stock.coverage === 'complete_cache' && stock.rows.find((row) => row.productId === ids.productA)?.cachedProjectedQuantity === 2, 'stock attention aggregates signed current-branch cached evidence');
  const expiry = deriveExpiryAttention({ binding, products, batchesMap, freshness, searchQuery: '', productLimit: 50, now: () => Date.parse('2026-10-29T00:00:00Z') });
  check(expiry.coverage === 'complete_cache' && expiry.rows.some((row) => row.batchId === ids.batchPositive), 'expiry attention derives controlled time-based presentation');
  const missing = deriveStockAttention({ binding, products, batchesMap: { [ids.productA]: batchesMap[ids.productA] }, freshness: null, searchQuery: '', productLimit: 50 });
  check(missing.coverage === 'unknown' && missing.rows.find((row) => row.productId === ids.productB)?.band === 'UNKNOWN', 'missing batch evidence remains unknown rather than zero');
  const empty = deriveStockAttention({ binding, products, batchesMap: { [ids.productA]: [], [ids.productB]: [] }, freshness: null, searchQuery: '', productLimit: 50 });
  check(empty.rows.every((row) => row.cachedProjectedQuantity === 0), 'explicit empty batch evidence is distinct from missing evidence');
  const malformedDate = deriveExpiryAttention({ binding, products, batchesMap: { ...batchesMap, [ids.productA]: [{ ...batchesMap[ids.productA][0], expiry_date: '2026-02-30' }, ...batchesMap[ids.productA].slice(1)] }, freshness, searchQuery: '', productLimit: 50, now: () => Date.parse('2026-10-29T00:00:00Z') });
  check(malformedDate.coverage === 'unknown' && malformedDate.issues.includes('batch_evidence_invalid'), 'invalid dates make expiry evidence unavailable');
  const overflow = deriveStockAttention({ binding, products, batchesMap: { ...batchesMap, [ids.productA]: [{ ...batchesMap[ids.productA][0], projected_stock: Number.MAX_SAFE_INTEGER }, { ...batchesMap[ids.productA][1], projected_stock: 1 }] }, freshness: null, searchQuery: '', productLimit: 50 });
  check(overflow.coverage === 'unknown' && overflow.issues.includes('aggregate_quantity_overflow'), 'safe-integer overflow cannot become stock presentation');

  const detailCoordinator = new ProductDetailLoadCoordinator();
  const detailBinding = { workspaceKey: 'workspace-a', pharmacyId: ids.pharmacyA, productId: ids.productA };
  let currentDetail = detailBinding;
  let publishedDetail = 0;
  const detailResult = await runProductDetailLoad({ coordinator: detailCoordinator, binding: detailBinding, currentBinding: () => currentDetail, load: () => getEligibleBatchesForProduct(ids.pharmacyA, ids.productA, { branchId: ids.branchA, referenceDate: '2026-10-29' }, indexedDB), publishLoading: () => undefined, publishSuccess: (rows) => { publishedDetail = rows.length; }, publishUnavailable: () => undefined });
  check(detailResult === 'published' && publishedDetail === 2, 'product detail publishes inspected branch batch evidence');
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let stalePublished = false;
  const staleLoad = runProductDetailLoad({ coordinator: detailCoordinator, binding: detailBinding, currentBinding: () => currentDetail, load: async () => { await delayed; return batchesMap[ids.productA]; }, publishLoading: () => undefined, publishSuccess: () => { stalePublished = true; }, publishUnavailable: () => { stalePublished = true; } });
  currentDetail = { ...detailBinding, workspaceKey: 'workspace-b' };
  detailCoordinator.invalidate();
  release();
  check(await staleLoad === 'superseded' && !stalePublished, 'workspace switching suppresses stale product-detail publication');
  detailCoordinator.dispose();
  const afterClose = await runProductDetailLoad({ coordinator: detailCoordinator, binding: detailBinding, currentBinding: () => detailBinding, load: async () => batchesMap[ids.productA], publishLoading: () => undefined, publishSuccess: () => { stalePublished = true; }, publishUnavailable: () => { stalePublished = true; } });
  check(afterClose === 'superseded' && !stalePublished, 'close/unmount suppresses product-detail publication');

  const durable = await loadOrCreateDurableCart({ pharmacy_id: ids.pharmacyA, branch_id: ids.branchA, cashier_id: ids.user }, indexedDB);
  const cart = await addItemToCart(durable, { product_id: ids.productA, batch_id: ids.batchPositive, quantity: 1 }, indexedDB);
  const finalized = await finalizePosSale(cart, { payment_method: 'CASH', authenticated_user_id: ids.user, amount_tendered: 1200 }, indexedDB);
  check(finalized.success === true, 'representative checkout is made locally durable before inventory failures');
  const durableBefore = {
    draft: await getCheckoutDraft(cart.checkout_scope_key, indexedDB),
    sale: await getLocalSale(ids.pharmacyA, cart.client_op_id, indexedDB),
    transaction: await getLocalTransaction(ids.pharmacyA, cart.client_op_id, indexedDB),
    queue: await getQueueItem(ids.pharmacyA, cart.client_op_id, indexedDB),
  };

  const duplicate = snapshot('2026-10-29T10:01:00.000Z'); duplicate.products[1].id = duplicate.products[0].id;
  await rejectsWithoutReplacement(duplicate, 'Duplicate product id', 'duplicate product identities');
  const duplicateBatch = snapshot('2026-10-29T10:01:30.000Z'); duplicateBatch.batches[1].id = duplicateBatch.batches[0].id;
  await rejectsWithoutReplacement(duplicateBatch, 'Duplicate batch id', 'duplicate batch identities');
  const orphan = snapshot('2026-10-29T10:01:45.000Z'); orphan.batches[0].product_id = ids.purchase;
  await rejectsWithoutReplacement(orphan, 'outside the snapshot', 'orphan batch association');
  const crossTenant = snapshot('2026-10-29T10:02:00.000Z'); crossTenant.batches[0].pharmacy_id = ids.pharmacyB;
  await rejectsWithoutReplacement(crossTenant, 'does not match snapshot pharmacy', 'cross-tenant batch row');
  const unsafe = snapshot('2026-10-29T10:03:00.000Z'); unsafe.batches[0].quantity = Number.MAX_SAFE_INTEGER + 1;
  await rejectsWithoutReplacement(unsafe, 'quantity must be a safe integer', 'unsafe batch quantity');
  const unsafePrice = snapshot('2026-10-29T10:03:15.000Z'); unsafePrice.products[0].selling_price = Number.MAX_SAFE_INTEGER + 1;
  await rejectsWithoutReplacement(unsafePrice, 'selling_price must be a non-negative integer', 'unsafe product price');
  const invalidSnapshotDate = snapshot('2026-10-29T10:03:30.000Z'); invalidSnapshotDate.batches[0].expiry_date = '2026-02-30';
  await rejectsWithoutReplacement(invalidSnapshotDate, 'exact Gregorian YYYY-MM-DD required', 'invalid snapshot expiry date');
  const cacheBeforeStale = JSON.stringify(await readCompleteInventoryCache());
  const stale = snapshot('2026-10-29T09:00:00.000Z');
  const staleResult = await ingestAuthoritativeSnapshot(stale, { customFactory: indexedDB });
  check(!staleResult.success && staleResult.status === 'STALE_REJECTED', 'stale snapshot generation is rejected');
  check(JSON.stringify(await readCompleteInventoryCache()) === cacheBeforeStale, 'stale rejection preserves complete cache records and metadata');
  const cacheBeforeEmpty = JSON.stringify(await readCompleteInventoryCache());
  const suspiciousEmpty = snapshot('2026-10-29T10:04:00.000Z'); suspiciousEmpty.products = []; suspiciousEmpty.batches = []; suspiciousEmpty.product_count = 0; suspiciousEmpty.batch_count = 0;
  const emptyResult = await ingestAuthoritativeSnapshot(suspiciousEmpty, { customFactory: indexedDB });
  check(!emptyResult.success && emptyResult.status === 'SUSPICIOUS_EMPTY', 'unconfirmed empty snapshot cannot erase valid inventory');
  check(JSON.stringify(await readCompleteInventoryCache()) === cacheBeforeEmpty, 'suspicious-empty rejection preserves complete cache records and metadata');

  const intakeRequest = { pharmacy_id: ids.pharmacyA, branch_id: ids.branchA, client_op_id: ids.opIntake, items: [{ product_id: ids.productA, batch_number: 'NEW', expiry_date: '2027-12-31', quantity: 2, cost_price: 700, selling_price: 1200 }] };
  const adjustmentRequest = { pharmacy_id: ids.pharmacyA, branch_id: ids.branchA, product_id: ids.productA, batch_id: ids.batchPositive, direction: 'INCREASE' as const, quantity: 1, reason: 'COUNT_DISCREPANCY' as const, client_op_id: ids.opAdjustment };
  const dispatchRequest = { pharmacy_id: ids.pharmacyA, source_branch_id: ids.branchA, destination_branch_id: ids.branchB, items: [{ product_id: ids.productA, source_batch_id: ids.batchPositive, quantity: 1 }], client_op_id: ids.opDispatch };
  const receiveRequest = { pharmacy_id: ids.pharmacyA, transfer_id: ids.transfer, client_op_id: ids.opReceive };
  const validRpc = mockClient({ rpc: {
    rpc_receive_inventory_stock: { purchase_id: ids.purchase, status: 'COMPLETED', total_items: 1, total_cost: 1400, processed_at: at },
    rpc_adjust_inventory_stock: { adjustment_id: ids.adjustment, batch_id: ids.batchPositive, previous_quantity: 6, adjustment_quantity: 1, resulting_quantity: 7, adjusted_at: at },
    rpc_dispatch_stock_transfer: { transfer_id: ids.transfer, status: 'DISPATCHED', total_items: 1, dispatched_at: at },
    rpc_receive_stock_transfer: { transfer_id: ids.transfer, status: 'RECEIVED', total_items: 1, received_at: at },
  } });
  const validResults = await Promise.all([
    submitStockIntake(intakeRequest, { customClient: validRpc, customFactory: indexedDB, skipRefresh: true }),
    adjustInventoryStock(adjustmentRequest, { customClient: validRpc, customFactory: indexedDB, skipRefresh: true }),
    dispatchStockTransfer(dispatchRequest, { customClient: validRpc, customFactory: indexedDB, skipRefresh: true }),
    receiveStockTransfer(receiveRequest, { customClient: validRpc, customFactory: indexedDB, skipRefresh: true }),
  ]);
  check(validResults.every((result) => result.success), 'valid intake, adjustment, dispatch and receive responses are preserved');

  const cacheBeforeMalformedRpc = JSON.stringify(await readCompleteInventoryCache());
  const malformedRows = [
    submitStockIntake(intakeRequest, { customClient: mockClient({ rpc: { rpc_receive_inventory_stock: { purchase_id: ids.purchase, total_items: '1' } } }), customFactory: indexedDB, skipRefresh: true }),
    adjustInventoryStock(adjustmentRequest, { customClient: mockClient({ rpc: { rpc_adjust_inventory_stock: { adjustment_id: ids.adjustment, batch_id: ids.batchPositive, previous_quantity: '6', adjustment_quantity: 1, resulting_quantity: 7, adjusted_at: at } } }), customFactory: indexedDB, skipRefresh: true }),
    dispatchStockTransfer(dispatchRequest, { customClient: mockClient({ rpc: { rpc_dispatch_stock_transfer: { transfer_id: ids.transfer, status: 'DISPATCHED', total_items: Number.MAX_SAFE_INTEGER + 1, dispatched_at: at } } }), customFactory: indexedDB, skipRefresh: true }),
    receiveStockTransfer(receiveRequest, { customClient: mockClient({ rpc: { rpc_receive_stock_transfer: { transfer_id: ids.purchase, status: 'RECEIVED', total_items: 1, received_at: 'not-a-date' } } }), customFactory: indexedDB, skipRefresh: true }),
  ];
  const malformedResults = await Promise.all(malformedRows);
  check(malformedResults.every((result) => !result.success && result.errorCode === 'UNEXPECTED_RESPONSE'), 'malformed RPC success rows fail closed without coercion');
  check(JSON.stringify(await readCompleteInventoryCache()) === cacheBeforeMalformedRpc, 'rejected mutation responses preserve complete cache records and metadata');

  const failedRefreshMutation = await adjustInventoryStock(adjustmentRequest, { customClient: mockClient({ networkFail: true, rpc: { rpc_adjust_inventory_stock: { adjustment_id: ids.adjustment, batch_id: ids.batchPositive, previous_quantity: 6, adjustment_quantity: 1, resulting_quantity: 7, adjusted_at: at } } }), customFactory: indexedDB });
  check(failedRefreshMutation.success === true && (await getProductById(ids.pharmacyA, ids.productA, indexedDB))?.name === 'Branch medicine', 'successful mutation response plus failed refresh preserves prior valid cache');

  const refreshedSnapshot = snapshot('2026-10-29T12:00:00.000Z');
  refreshedSnapshot.products[0].name = 'Refreshed branch medicine';
  const successRefreshMutation = await submitStockIntake(intakeRequest, { customClient: mockClient({ rpc: { rpc_receive_inventory_stock: { purchase_id: ids.purchase, status: 'COMPLETED', total_items: 1, total_cost: 1400, processed_at: at } }, products: refreshedSnapshot.products, batches: refreshedSnapshot.batches }), customFactory: indexedDB });
  check(successRefreshMutation.success === true && (await getProductById(ids.pharmacyA, ids.productA, indexedDB))?.name === 'Refreshed branch medicine', 'successful mutation triggers atomic local snapshot refresh');

  let releaseRefresh!: () => void;
  const refreshGate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
  const counts: Record<string, number> = {};
  const overlapClient = mockClient({ products: refreshedSnapshot.products, batches: refreshedSnapshot.batches, delayProducts: () => refreshGate, counts });
  const firstRefresh = refreshInventorySnapshot(overlapClient, ids.pharmacyA, { customFactory: indexedDB, force: true });
  const secondRefresh = refreshInventorySnapshot(overlapClient, ids.pharmacyA, { customFactory: indexedDB, force: true });
  releaseRefresh();
  const [firstResult, secondResult] = await Promise.all([firstRefresh, secondRefresh]);
  check(firstResult.success && secondResult.success && counts.products === 1, 'overlapping refresh requests share one tenant-scoped flight');

  const durableAfter = {
    draft: await getCheckoutDraft(cart.checkout_scope_key, indexedDB),
    sale: await getLocalSale(ids.pharmacyA, cart.client_op_id, indexedDB),
    transaction: await getLocalTransaction(ids.pharmacyA, cart.client_op_id, indexedDB),
    queue: await getQueueItem(ids.pharmacyA, cart.client_op_id, indexedDB),
  };
  check(JSON.stringify(durableAfter.draft) === JSON.stringify(durableBefore.draft), 'inventory workflows preserve the complete durable checkout draft');
  check(JSON.stringify(durableAfter.sale) === JSON.stringify(durableBefore.sale), 'inventory workflows preserve the complete local sale');
  check(JSON.stringify(durableAfter.transaction) === JSON.stringify(durableBefore.transaction), 'inventory workflows preserve the complete local transaction');
  check(JSON.stringify(durableAfter.queue) === JSON.stringify(durableBefore.queue), 'inventory workflows preserve the complete sync queue item');

  console.log(`\nMVP-02-CLOSE integration: ${passed} passed, ${failed} failed, ${passed + failed} total.`);
  if (failed) process.exitCode = 1;
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
