import { indexedDB } from 'fake-indexeddb';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  fetchAuthoritativeSnapshot,
  ingestAuthoritativeSnapshot,
  refreshInventorySnapshot
} from './sync';
import {
  replacePharmacyInventorySnapshot,
  getInventorySnapshotMetadata,
  getProductById,
  getBatchesForProduct
} from './service';
import {
  AuthoritativeSnapshotContract,
  InventorySnapshot
} from './types';
import { openOfflineDb, closeOfflineDb } from '../offline/index';

// Helper to create a mock Supabase Client for testing PostgREST / RLS read paths
function createMockSupabaseClient(config: {
  session?: { user: { id: string } } | null;
  memberships?: Array<{ pharmacy_id: string; user_id: string; role: string; status: string }>;
  products?: Array<any>;
  batches?: Array<any>;
  networkFail?: boolean;
}) {
  return {
    auth: {
      getSession: async () => {
        if (config.networkFail) throw new Error('Network request failed');
        return {
          data: { session: config.session || null },
          error: null
        };
      }
    },
    from: (table: string) => {
      let currentTable = table;
      let eqFilters: Record<string, any> = {};
      let rangeFrom = 0;
      let rangeTo = Infinity;

      const builder: any = {
        select: (cols: string) => builder,
        eq: (col: string, val: any) => {
          eqFilters[col] = String(val).toLowerCase().trim();
          return builder;
        },
        order: (col: string, opts?: any) => builder,
        range: (from: number, to: number) => {
          rangeFrom = from;
          rangeTo = to;
          return builder;
        },
        maybeSingle: async () => {
          if (config.networkFail) throw new Error('Network error');
          if (currentTable === 'pharmacy_members') {
            const mems = config.memberships || [];
            const found = mems.find(
              (m) =>
                m.pharmacy_id.toLowerCase().trim() === eqFilters['pharmacy_id'] &&
                m.user_id.toLowerCase().trim() === eqFilters['user_id'] &&
                (!eqFilters['status'] || m.status.toLowerCase().trim() === eqFilters['status'])
            );
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve: any, reject: any) => {
          if (config.networkFail) {
            reject(new Error('Network error'));
            return;
          }
          let rows: any[] = [];
          if (currentTable === 'products') {
            const prods = config.products || [];
            rows = prods.filter(
              (p) => p.pharmacy_id.toLowerCase().trim() === eqFilters['pharmacy_id']
            );
          } else if (currentTable === 'inventory_batches') {
            const b = config.batches || [];
            rows = b.filter(
              (batch) => batch.pharmacy_id.toLowerCase().trim() === eqFilters['pharmacy_id']
            );
          }
          const paged = rows.slice(rangeFrom, rangeTo + 1);
          resolve({ data: paged, error: null });
        }
      };
      return builder;
    }
  } as unknown as SupabaseClient;
}

async function runSnapshotSyncTestSuite() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${desc}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL: ${desc}`);
    }
  }

  console.log('--- PHARMACYFLOW PHASE 5D-7 AUTHORITATIVE CATALOG SYNC TESTS ---');

  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA = '33333333-3333-4333-8333-333333333333';
  const userA = '55555555-5555-4555-8555-555555555555';
  const userB = '66666666-6666-4666-8666-666666666666';

  const prodA1 = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA2 = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  const batchA1 = 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';
  const batchA2 = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';

  // Seed sample products and batches for Pharmacy A
  const sampleProductsA = [
    {
      id: prodA1,
      pharmacy_id: pharmacyA,
      name: 'Ibuprofen 400mg',
      sku: 'IBU-400',
      barcode: '123456789012',
      generic_name: 'Ibuprofen',
      category: 'Analgesics',
      unit: 'Tablets',
      selling_price: 2000,
      cost_price: 1200,
      status: 'ACTIVE',
      updated_at: '2026-10-01T10:00:00Z'
    },
    {
      id: prodA2,
      pharmacy_id: pharmacyA,
      name: 'Cetirizine 10mg',
      sku: 'CET-10',
      barcode: '123456789034',
      generic_name: 'Cetirizine HCl',
      category: 'Antihistamines',
      unit: 'Tablets',
      selling_price: 1500,
      cost_price: 800,
      status: 'ACTIVE',
      updated_at: '2026-10-02T12:00:00Z'
    }
  ];

  const sampleBatchesA = [
    {
      id: batchA1,
      pharmacy_id: pharmacyA,
      product_id: prodA1,
      branch_id: branchA,
      batch_number: 'LOT-IBU-1',
      expiry_date: '2027-12-31',
      quantity: 150,
      selling_price: 2000,
      cost_price: 1200,
      status: 'ACTIVE',
      updated_at: '2026-10-01T10:00:00Z'
    },
    {
      id: batchA2,
      pharmacy_id: pharmacyA,
      product_id: prodA2,
      branch_id: branchA,
      batch_number: 'LOT-CET-1',
      expiry_date: '2028-06-30',
      quantity: 80,
      selling_price: 1500,
      cost_price: 800,
      status: 'ACTIVE',
      updated_at: '2026-10-02T12:00:00Z'
    }
  ];

  // --- 1. AUTHENTICATION & SESSION GUARDS ---
  console.log('\n[1. Authentication & Session Verification]');

  // Missing session
  const unauthClient = createMockSupabaseClient({ session: null });
  const unauthRes = await fetchAuthoritativeSnapshot(unauthClient, pharmacyA);
  assert(unauthRes.success === false, 'Missing session returns success=false');
  assert(unauthRes.status === 'AUTH_REQUIRED', 'Reports AUTH_REQUIRED status');

  // Valid session
  const authClient = createMockSupabaseClient({
    session: { user: { id: userA } },
    memberships: [{ pharmacy_id: pharmacyA, user_id: userA, role: 'CASHIER', status: 'ACTIVE' }],
    products: sampleProductsA,
    batches: sampleBatchesA
  });
  const authRes = await fetchAuthoritativeSnapshot(authClient, pharmacyA);
  assert(authRes.success === true, 'Authenticated user can fetch snapshot');
  assert(authRes.status === 'FETCHED', 'Reports FETCHED status');
  assert(authRes.snapshot !== undefined, 'Snapshot object returned');

  // --- 2. MEMBERSHIP & TENANT SECURITY ---
  console.log('\n[2. Membership & Tenant Authorization]');

  // User A attempting to query Pharmacy B (unauthorized pharmacy)
  const crossTenantRes = await fetchAuthoritativeSnapshot(authClient, pharmacyB);
  assert(crossTenantRes.success === false, 'User A cannot fetch Pharmacy B snapshot');
  assert(crossTenantRes.status === 'FORBIDDEN', 'Reports FORBIDDEN status');

  // User with suspended membership is rejected
  const suspendedClient = createMockSupabaseClient({
    session: { user: { id: userA } },
    memberships: [{ pharmacy_id: pharmacyA, user_id: userA, role: 'CASHIER', status: 'SUSPENDED' }]
  });
  const suspendedRes = await fetchAuthoritativeSnapshot(suspendedClient, pharmacyA);
  assert(suspendedRes.success === false, 'Suspended member is rejected');
  assert(suspendedRes.status === 'FORBIDDEN', 'Reports FORBIDDEN for suspended membership');

  // --- 3. SNAPSHOT CONTRACT & DATA PURITY ---
  console.log('\n[3. Snapshot Contract & Field Mapping]');

  const snap = authRes.snapshot!;
  assert(snap.pharmacy_id === pharmacyA, 'Snapshot pharmacy_id matches');
  assert(snap.product_count === 2, 'Snapshot product_count is 2');
  assert(snap.batch_count === 2, 'Snapshot batch_count is 2');
  assert(snap.products.length === 2, 'Contains 2 products');
  assert(snap.batches.length === 2, 'Contains 2 batches');
  assert(typeof snap.snapshot_version === 'number' && snap.snapshot_version > 0, 'Has monotonic snapshot_version number');
  assert(snap.source_updated_at === '2026-10-02T12:00:00.000Z', 'source_updated_at reflects latest entity mutation');

  // Verify product fields
  const p1 = snap.products[0];
  assert(p1.id === prodA1, 'Product ID matches');
  assert(p1.selling_price === 2000, 'Product selling price is in integer minor units');
  assert(p1.cost_price === 1200, 'Product cost price is in integer minor units');

  // Verify batch fields & non-authoritative projected quantity mapping
  const b1 = snap.batches[0];
  assert(b1.id === batchA1, 'Batch ID matches');
  assert(b1.quantity === 150, 'Batch quantity matches server authoritative count');
  assert(b1.branch_id === branchA, 'Batch preserves branch context');

  // --- 4. ATOMIC LOCAL REFRESH VIA PHASE 5D-4 ---
  console.log('\n[4. Atomic Local Snapshot Ingestion]');

  const ingestRes = await ingestAuthoritativeSnapshot(snap, { customFactory: indexedDB });
  assert(ingestRes.success === true, 'ingestAuthoritativeSnapshot succeeded');
  assert(ingestRes.status === 'SYNCED', 'Reports SYNCED status');
  assert(ingestRes.products_synced === 2, '2 products ingested');
  assert(ingestRes.batches_synced === 2, '2 batches ingested');

  // Verify in IndexedDB
  const storedProd1 = await getProductById(pharmacyA, prodA1, indexedDB);
  assert(storedProd1 !== null, 'Product 1 readable from IndexedDB');
  assert(storedProd1?.name === 'Ibuprofen 400mg', 'Product 1 name matches');

  const storedBatches = await getBatchesForProduct(pharmacyA, prodA1, branchA, indexedDB);
  assert(storedBatches.length === 1, 'Batch 1 readable from IndexedDB');
  assert(storedBatches[0].projected_stock === 150, 'Authoritative quantity correctly mapped to projected_stock');

  const meta = await getInventorySnapshotMetadata(pharmacyA, indexedDB);
  assert(meta !== null, 'Snapshot metadata recorded');
  assert(meta?.product_count === 2, 'Metadata product_count is 2');

  // --- 5. MONOTONIC REVISION & STALE RESPONSE GUARDS ---
  console.log('\n[5. Revision & Staleness Protection]');

  // Ingesting the identical snapshot again without force -> returns ALREADY_CURRENT
  const duplicateRes = await ingestAuthoritativeSnapshot(snap, { customFactory: indexedDB });
  assert(duplicateRes.success === true, 'Duplicate snapshot ingestion handled safely');
  assert(duplicateRes.status === 'ALREADY_CURRENT', 'Reports ALREADY_CURRENT without redundant write');

  // Stale snapshot with older snapshot_version is strictly rejected
  const staleSnapshot: AuthoritativeSnapshotContract = {
    ...snap,
    snapshot_version: new Date('2025-01-01T00:00:00Z').getTime(),
    source_updated_at: '2025-01-01T00:00:00.000Z'
  };

  const staleRes = await ingestAuthoritativeSnapshot(staleSnapshot, { customFactory: indexedDB });
  assert(staleRes.success === false, 'Older snapshot is strictly rejected');
  assert(staleRes.status === 'STALE_REJECTED', 'Reports STALE_REJECTED status');

  // Confirm local data was NOT replaced with stale data
  const metaAfterStale = await getInventorySnapshotMetadata(pharmacyA, indexedDB);
  assert(metaAfterStale?.source_updated_at === snap.source_updated_at, 'Local metadata untouched after stale attempt');

  // --- 6. EMPTY SNAPSHOT ACCIDENTAL DESTRUCTION GUARD ---
  console.log('\n[6. Empty Snapshot Safety]');

  // Server unexpectedly returns 0 products without allowEmptyCatalog confirmation
  const emptySnapshot: AuthoritativeSnapshotContract = {
    pharmacy_id: pharmacyA,
    snapshot_version: new Date('2026-10-03T10:00:00Z').getTime(),
    generated_at: '2026-10-03T10:00:00.000Z',
    source_updated_at: '2026-10-03T10:00:00.000Z',
    product_count: 0,
    batch_count: 0,
    products: [],
    batches: []
  };

  const emptyRes = await ingestAuthoritativeSnapshot(emptySnapshot, { customFactory: indexedDB });
  assert(emptyRes.success === false, 'Unexpected empty catalog update is blocked');
  assert(emptyRes.status === 'SUSPICIOUS_EMPTY', 'Reports SUSPICIOUS_EMPTY status');

  // Confirm existing 2 products are still safe in IndexedDB
  const prodAfterEmpty = await getProductById(pharmacyA, prodA1, indexedDB);
  assert(prodAfterEmpty !== null, 'Existing products preserved during suspicious empty response');

  // Legitimate empty catalog with explicit flag -> succeeds
  const legitEmptyRes = await ingestAuthoritativeSnapshot(emptySnapshot, {
    customFactory: indexedDB,
    allowEmptyCatalog: true
  });
  assert(legitEmptyRes.success === true, 'Legitimate empty catalog accepted with allowEmptyCatalog=true');
  const emptyMeta = await getInventorySnapshotMetadata(pharmacyA, indexedDB);
  assert(emptyMeta?.product_count === 0, 'Catalog now legitimately empty');

  // --- 7. ATOMIC ROLLBACK ON VALIDATION FAILURE ---
  console.log('\n[7. Validation Failure Rollback]');

  // Re-seed Pharmacy A with valid newer snapshot (2026-10-04)
  const reseedSnapshot: AuthoritativeSnapshotContract = {
    ...snap,
    snapshot_version: new Date('2026-10-04T10:00:00Z').getTime(),
    source_updated_at: '2026-10-04T10:00:00.000Z'
  };
  await ingestAuthoritativeSnapshot(reseedSnapshot, { customFactory: indexedDB });
  assert((await getInventorySnapshotMetadata(pharmacyA, indexedDB))?.product_count === 2, 'Re-seeded with 2 products');

  // Corrupt snapshot (invalid UUID and negative price) with newer timestamp (2026-10-05)
  const corruptSnapshot: AuthoritativeSnapshotContract = {
    ...reseedSnapshot,
    snapshot_version: new Date('2026-10-05T10:00:00Z').getTime(),
    source_updated_at: '2026-10-05T10:00:00.000Z',
    products: [
      {
        ...snap.products[0],
        id: 'not-a-valid-uuid',
        selling_price: -500
      }
    ]
  };

  let corruptCaught = false;
  try {
    await ingestAuthoritativeSnapshot(corruptSnapshot, { customFactory: indexedDB });
  } catch (err: unknown) {
    corruptCaught = true;
  }
  assert(corruptCaught === true, 'Malformed snapshot throws during validation');

  // Verify previous valid snapshot remains completely intact in IndexedDB
  const prodAfterCorrupt = await getProductById(pharmacyA, prodA1, indexedDB);
  assert(prodAfterCorrupt !== null, 'Previous valid product 1 preserved after rollback');
  assert(prodAfterCorrupt?.selling_price === 2000, 'Price intact');

  // --- 8. PAGINATED SERVER FETCHING ---
  console.log('\n[8. Pagination Handling]');

  // 4 products fetched with pageSize = 2
  const pagedProds = [
    { ...sampleProductsA[0], id: '11111111-aaaa-4aaa-8aaa-111111111111', updated_at: '2026-10-01T01:00:00Z' },
    { ...sampleProductsA[0], id: '11111111-aaaa-4aaa-8aaa-222222222222', updated_at: '2026-10-01T02:00:00Z' },
    { ...sampleProductsA[0], id: '11111111-aaaa-4aaa-8aaa-333333333333', updated_at: '2026-10-01T03:00:00Z' },
    { ...sampleProductsA[0], id: '11111111-aaaa-4aaa-8aaa-444444444444', updated_at: '2026-10-01T04:00:00Z' }
  ];

  const pagedClient = createMockSupabaseClient({
    session: { user: { id: userA } },
    memberships: [{ pharmacy_id: pharmacyA, user_id: userA, role: 'CASHIER', status: 'ACTIVE' }],
    products: pagedProds,
    batches: []
  });

  const pagedFetchRes = await fetchAuthoritativeSnapshot(pagedClient, pharmacyA, { pageSize: 2 });
  assert(pagedFetchRes.success === true, 'Paginated fetch succeeded');
  assert(pagedFetchRes.snapshot?.products.length === 4, 'Assembled all 4 items across 2 pages into one snapshot');

  // --- 9. CONCURRENCY MUTEX & DEDUPLICATION ---
  console.log('\n[9. Concurrency & Deduplication]');

  const concurrentProducts = sampleProductsA.map(p => ({
    ...p,
    updated_at: '2026-10-06T10:00:00Z'
  }));
  const concurrentBatches = sampleBatchesA.map(b => ({
    ...b,
    updated_at: '2026-10-06T10:00:00Z'
  }));

  const concurrentClient = createMockSupabaseClient({
    session: { user: { id: userA } },
    memberships: [{ pharmacy_id: pharmacyA, user_id: userA, role: 'CASHIER', status: 'ACTIVE' }],
    products: concurrentProducts,
    batches: concurrentBatches
  });

  // Dispatched simultaneously for same pharmacy
  const p1Sync = refreshInventorySnapshot(concurrentClient, pharmacyA, { customFactory: indexedDB, force: true });
  const p2Sync = refreshInventorySnapshot(concurrentClient, pharmacyA, { customFactory: indexedDB, force: true });

  const [r1, r2] = await Promise.all([p1Sync, p2Sync]);
  assert(r1.success === true && r2.success === true, 'Both concurrent calls resolved successfully');
  assert(r1 === r2, 'Both simultaneous sync calls shared the exact same in-flight promise (deduplicated)');

  // --- 10. MULTI-TENANT SWITCHING ISOLATION ---
  console.log('\n[10. Multi-Tenant Switching Isolation]');

  const multiTenantProds = [
    { ...sampleProductsA[0], pharmacy_id: pharmacyA, updated_at: '2026-10-07T10:00:00Z' },
    {
      id: '99999999-9999-4999-8999-999999999999',
      pharmacy_id: pharmacyB,
      name: 'Pharmacy B Exclusive Salve',
      sku: 'B-SALVE',
      selling_price: 5000,
      cost_price: 2500,
      status: 'ACTIVE',
      updated_at: '2026-10-07T12:00:00Z'
    }
  ];

  // User has memberships in both Pharmacy A and Pharmacy B
  const multiMemberClient = createMockSupabaseClient({
    session: { user: { id: userA } },
    memberships: [
      { pharmacy_id: pharmacyA, user_id: userA, role: 'CASHIER', status: 'ACTIVE' },
      { pharmacy_id: pharmacyB, user_id: userA, role: 'CASHIER', status: 'ACTIVE' }
    ],
    products: multiTenantProds,
    batches: []
  });

  // Sync Pharmacy A
  const syncARes = await refreshInventorySnapshot(multiMemberClient, pharmacyA, { customFactory: indexedDB, force: true });
  assert(syncARes.success === true, 'Synced Pharmacy A');

  // Sync Pharmacy B
  const syncBRes = await refreshInventorySnapshot(multiMemberClient, pharmacyB, { customFactory: indexedDB, force: true });
  assert(syncBRes.success === true, 'Synced Pharmacy B');

  // Verify Pharmacy A partition does NOT contain Pharmacy B product
  const prodInA = await getProductById(pharmacyA, '99999999-9999-4999-8999-999999999999', indexedDB);
  assert(prodInA === null, 'Pharmacy B product not present in Pharmacy A IndexedDB partition');

  // Verify Pharmacy B partition contains Pharmacy B product
  const prodInB = await getProductById(pharmacyB, '99999999-9999-4999-8999-999999999999', indexedDB);
  assert(prodInB !== null, 'Pharmacy B product verified in Pharmacy B partition');

  // --- 11. SECURITY & NON-LEAKAGE INVARIANTS ---
  console.log('\n[11. Security & Non-Leakage Invariants]');

  const serializedSnap = JSON.stringify(snap);
  assert(!serializedSnap.includes('privateKey'), 'No privateKey in snapshot');
  assert(!serializedSnap.includes('access_token'), 'No access_token in snapshot');
  assert(!serializedSnap.includes('service_role'), 'No service_role in snapshot');

  closeOfflineDb();

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-7 AUTHORITATIVE SYNC TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runSnapshotSyncTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
