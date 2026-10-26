import { indexedDB } from 'fake-indexeddb';
import {
  replacePharmacyInventorySnapshot,
  getProductById,
  findProductByBarcode,
  findProductBySku,
  searchProducts,
  getBatchesForProduct,
  getEligibleBatchesForProduct,
  selectRecommendedBatch,
  getInventorySnapshotMetadata,
  isSnapshotStale,
  populateSaleLineItemFromReadModel,
  computeExpiryInfo,
  validateSnapshot,
  InventorySnapshot
} from './index';
import { openOfflineDb, closeOfflineDb, clearPharmacyOfflineData } from '../offline/db';
import { createLocalSale, getLocalSale } from '../sales/index';

async function runInventoryTestSuite() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-4 INVENTORY READ MODEL TESTS ---');

  // Open DB
  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA1 = '33333333-3333-4333-8333-333333333333';
  const branchA2 = '44444444-4444-4444-8444-444444444444';
  const cashierA = '55555555-5555-4555-8555-555555555555';

  const productA1Id = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const productA2Id = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  const batchA1Id = 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';
  const batchA2Id = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
  const batchA3ExpiredId = 'bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb';

  // --- 1. EXPIRY EVALUATION ENGINE TESTS ---
  console.log('\n[1. Deterministic Expiry Evaluation]');

  const testRefDate = new Date('2026-10-04T12:00:00Z');

  // Past expiry
  const pastExpiry = computeExpiryInfo('2026-09-01', testRefDate);
  assert(pastExpiry.is_expired === true, 'Past date (2026-09-01) is correctly marked expired');
  assert(pastExpiry.days_until_expiry < 0, 'Past date has negative days_until_expiry');

  // Future expiry
  const futureExpiry = computeExpiryInfo('2026-12-01', testRefDate);
  assert(futureExpiry.is_expired === false, 'Future date (2026-12-01) is not expired');
  assert(futureExpiry.days_until_expiry > 0, 'Future date has positive days_until_expiry');

  // Same-day boundary
  const sameDayExpiry = computeExpiryInfo('2026-10-04', testRefDate);
  assert(sameDayExpiry.is_expired === true, 'Same-day boundary is safely classified as expired');
  assert(sameDayExpiry.days_until_expiry === 0, 'Same-day boundary days_until_expiry is 0');

  // Next-day boundary
  const nextDayExpiry = computeExpiryInfo('2026-10-05', testRefDate);
  assert(nextDayExpiry.is_expired === false, 'Next-day boundary is not expired');
  assert(nextDayExpiry.days_until_expiry === 1, 'Next-day boundary is 1 day until expiry');

  // --- 2. SNAPSHOT VALIDATION INVARIANTS ---
  console.log('\n[2. Snapshot Validation & Boundary Enforcement]');

  const validSnapshotA: InventorySnapshot = {
    pharmacy_id: pharmacyA,
    products: [
      {
        id: productA1Id,
        name: 'Paracetamol 500mg Tablets',
        sku: 'PARA-500',
        barcode: '1234567890128',
        generic_name: 'Acetaminophen',
        category: 'Analgesics',
        unit: 'Pack',
        selling_price: 1500, // 15.00 NGN
        cost_price: 1000,
        status: 'ACTIVE'
      },
      {
        id: productA2Id,
        name: 'Amoxicillin 250mg Capsules',
        sku: 'AMOX-250',
        barcode: '9876543210987',
        generic_name: 'Amoxicillin',
        category: 'Antibiotics',
        unit: 'Bottle',
        selling_price: 3500,
        cost_price: 2500,
        status: 'ACTIVE'
      }
    ],
    batches: [
      {
        id: batchA1Id,
        product_id: productA1Id,
        branch_id: branchA1,
        batch_number: 'BATCH-2026-A1',
        expiry_date: '2027-06-30',
        quantity: 100, // Projected stock
        selling_price: 1500,
        cost_price: 1000,
        status: 'ACTIVE'
      },
      {
        id: batchA2Id,
        product_id: productA1Id,
        branch_id: branchA2,
        batch_number: 'BATCH-2026-A2',
        expiry_date: '2027-03-31',
        quantity: 50,
        selling_price: 1500,
        cost_price: 1000,
        status: 'ACTIVE'
      },
      {
        id: batchA3ExpiredId,
        product_id: productA1Id,
        branch_id: branchA1,
        batch_number: 'BATCH-2025-EXP',
        expiry_date: '2025-01-01',
        quantity: 20,
        selling_price: 1500,
        cost_price: 1000,
        status: 'EXPIRED'
      }
    ],
    source_updated_at: '2026-10-04T10:00:00Z'
  };

  // Valid snapshot passes
  const validVal = validateSnapshot(validSnapshotA, pharmacyA);
  assert(validVal.isValid === true, 'Valid snapshot passes validation');
  assert(validVal.validatedProducts.length === 2, '2 validated products returned');
  assert(validVal.validatedBatches.length === 3, '3 validated batches returned');

  // Mismatched pharmacy target rejected
  const mismatchVal = validateSnapshot(validSnapshotA, pharmacyB);
  assert(mismatchVal.isValid === false, 'Pharmacy mismatch in snapshot rejected');
  assert(mismatchVal.errors[0].includes('Snapshot target mismatch'), 'Reports mismatch error message');

  // Malformed product ID rejected
  const badProdVal = validateSnapshot(
    {
      ...validSnapshotA,
      products: [{ ...validSnapshotA.products[0], id: 'not-a-uuid' }]
    },
    pharmacyA
  );
  assert(badProdVal.isValid === false, 'Malformed product ID rejected');

  // Negative selling price rejected
  const negPriceVal = validateSnapshot(
    {
      ...validSnapshotA,
      products: [{ ...validSnapshotA.products[0], selling_price: -50 }]
    },
    pharmacyA
  );
  assert(negPriceVal.isValid === false, 'Negative selling price rejected');

  // Malformed batch expiry rejected
  const badExpiryVal = validateSnapshot(
    {
      ...validSnapshotA,
      batches: [{ ...validSnapshotA.batches[0], expiry_date: 'invalid-date' }]
    },
    pharmacyA
  );
  assert(badExpiryVal.isValid === false, 'Malformed batch expiry date rejected');

  // --- 3. ATOMIC SNAPSHOT INGESTION & METADATA ---
  console.log('\n[3. Atomic Snapshot Ingestion & Metadata]');

  const metadataA = await replacePharmacyInventorySnapshot(pharmacyA, validSnapshotA, indexedDB);
  assert(metadataA.pharmacy_id === pharmacyA, 'Snapshot ingested for Pharmacy A');
  assert(metadataA.product_count === 2, 'Recorded 2 products in metadata');
  assert(metadataA.batch_count === 3, 'Recorded 3 batches in metadata');
  assert(metadataA.synced_at > 0, 'Recorded valid synced_at timestamp');

  // Read metadata back from DB
  const storedMeta = await getInventorySnapshotMetadata(pharmacyA, indexedDB);
  assert(storedMeta !== null, 'Read snapshot metadata from IndexedDB');
  assert(storedMeta?.product_count === 2, 'Metadata product_count matches');

  // Staleness check
  assert(isSnapshotStale(storedMeta, 1000 * 60 * 60) === false, 'Fresh snapshot is not stale');
  assert(isSnapshotStale({ ...storedMeta!, synced_at: Date.now() - 90_000_000 }), 'Old snapshot (> 24h) is marked stale');

  // --- 4. PRODUCT LOOKUP & SEARCH TESTS ---
  console.log('\n[4. Product Lookup & Local Offline Search]');

  // Product by ID
  const p1 = await getProductById(pharmacyA, productA1Id, indexedDB);
  assert(p1 !== null, 'Retrieved product by ID');
  assert(p1?.name === 'Paracetamol 500mg Tablets', 'Product name matches');
  assert(p1?.selling_price === 1500, 'Product selling_price matches');

  // Product by Barcode
  const pByBarcode = await findProductByBarcode(pharmacyA, '1234567890128', indexedDB);
  assert(pByBarcode !== null, 'Found product by exact barcode');
  assert(pByBarcode?.id === productA1Id, 'Barcode lookup returned correct product ID');

  // Product by SKU
  const pBySku = await findProductBySku(pharmacyA, 'AMOX-250', indexedDB);
  assert(pBySku !== null, 'Found product by exact SKU');
  assert(pBySku?.id === productA2Id, 'SKU lookup returned correct product ID');

  // Offline Search (Name, Generic Name, Category)
  const nameSearch = await searchProducts(pharmacyA, 'paracetamol', 10, indexedDB);
  assert(nameSearch.length === 1 && nameSearch[0].id === productA1Id, 'Search by name returns match');

  const genericSearch = await searchProducts(pharmacyA, 'acetaminophen', 10, indexedDB);
  assert(genericSearch.length === 1 && genericSearch[0].id === productA1Id, 'Search by generic_name returns match');

  const categorySearch = await searchProducts(pharmacyA, 'antibiotics', 10, indexedDB);
  assert(categorySearch.length === 1 && categorySearch[0].id === productA2Id, 'Search by category returns match');

  const emptySearch = await searchProducts(pharmacyA, 'nonexistent-drug', 10, indexedDB);
  assert(emptySearch.length === 0, 'Unmatched search query returns empty array');

  // --- 5. BATCH LOOKUP & DETERMINISTIC SELECTION ---
  console.log('\n[5. Batch Lookup & Deterministic Selection]');

  // Batches for product across all branches
  const allBatches = await getBatchesForProduct(pharmacyA, productA1Id, undefined, indexedDB);
  assert(allBatches.length === 3, 'Found 3 total batches for product across all branches');

  // Batches filtered by branch
  const branch1Batches = await getBatchesForProduct(pharmacyA, productA1Id, branchA1, indexedDB);
  assert(branch1Batches.length === 2, 'Found 2 batches for product in branch 1');

  // Eligible batches with expiry evaluation (excluding expired by default)
  const eligibleBatches = await getEligibleBatchesForProduct(
    pharmacyA,
    productA1Id,
    { referenceDate: testRefDate },
    indexedDB
  );
  assert(eligibleBatches.length === 2, 'Eligible batches excludes expired batch by default');
  assert(eligibleBatches.every((b) => !b.expiry.is_expired), 'All eligible batches are non-expired');

  // Deterministic ordering: earliest expiry date first
  // batchA2 expires 2027-03-31, batchA1 expires 2027-06-30
  assert(eligibleBatches[0].id === batchA2Id, 'Earliest expiry batch (2027-03-31) is sorted first');
  assert(eligibleBatches[1].id === batchA1Id, 'Later expiry batch (2027-06-30) is sorted second');

  // Recommended batch selection utility
  const recommended = selectRecommendedBatch(allBatches, { referenceDate: testRefDate });
  assert(recommended !== null, 'Recommended batch selected');
  assert(recommended?.id === batchA2Id, 'Recommended batch matches earliest non-expired batch');

  // --- 6. PHARMACY ISOLATION & MULTI-TENANT SECURITY ---
  console.log('\n[6. Multi-Tenant Pharmacy Partitioning]');

  // Ingest different catalog for Pharmacy B with colliding SKU and barcode
  const productB1Id = 'bbbbbbbb-0000-4bbb-8bbb-000000000001';
  const batchB1Id = 'bbbbbbbb-0000-4bbb-8bbb-000000000002';
  const branchB1 = 'cccccccc-0000-4ccc-8ccc-000000000001';

  const snapshotB: InventorySnapshot = {
    pharmacy_id: pharmacyB,
    products: [
      {
        id: productB1Id,
        name: 'Pharmacy B Paracetamol (Different Catalog)',
        sku: 'PARA-500', // IDENTICAL SKU
        barcode: '1234567890128', // IDENTICAL BARCODE
        generic_name: 'Acetaminophen',
        category: 'Analgesics',
        unit: 'Box',
        selling_price: 2000,
        cost_price: 1200,
        status: 'ACTIVE'
      }
    ],
    batches: [
      {
        id: batchB1Id,
        product_id: productB1Id,
        branch_id: branchB1,
        batch_number: 'PHARM-B-BATCH-1',
        expiry_date: '2028-01-01',
        quantity: 300,
        selling_price: 2000,
        cost_price: 1200,
        status: 'ACTIVE'
      }
    ]
  };

  await replacePharmacyInventorySnapshot(pharmacyB, snapshotB, indexedDB);

  // Cross-tenant product ID lookup
  const crossProdLookup = await getProductById(pharmacyB, productA1Id, indexedDB);
  assert(crossProdLookup === null, 'Querying Pharmacy B for Pharmacy A product ID returns null');

  // Same barcode queried under Pharmacy A returns Pharmacy A product ONLY
  const barcodeA = await findProductByBarcode(pharmacyA, '1234567890128', indexedDB);
  assert(barcodeA?.id === productA1Id, 'Pharmacy A barcode returns Pharmacy A product');
  assert(barcodeA?.name === 'Paracetamol 500mg Tablets', 'Pharmacy A name confirmed');

  // Same barcode queried under Pharmacy B returns Pharmacy B product ONLY
  const barcodeB = await findProductByBarcode(pharmacyB, '1234567890128', indexedDB);
  assert(barcodeB?.id === productB1Id, 'Pharmacy B barcode returns Pharmacy B product');
  assert(barcodeB?.name === 'Pharmacy B Paracetamol (Different Catalog)', 'Pharmacy B name confirmed');

  // Same SKU queried under Pharmacy A vs B
  const skuA = await findProductBySku(pharmacyA, 'PARA-500', indexedDB);
  const skuB = await findProductBySku(pharmacyB, 'PARA-500', indexedDB);
  assert(skuA?.id === productA1Id && skuB?.id === productB1Id, 'SKU queries strictly isolated across tenants');

  // Batches for product across pharmacies
  const crossBatch = await getBatchesForProduct(pharmacyB, productA1Id, undefined, indexedDB);
  assert(crossBatch.length === 0, 'Pharmacy B queries return 0 batches for Pharmacy A product');

  // --- 7. SNAPSHOT REPLACEMENT BEHAVIOR ---
  console.log('\n[7. Snapshot Replacement & Purge Behavior]');

  // Replacing snapshot for Pharmacy A with a single product removes old unreferenced products
  const productA3Id = 'aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa';
  const updatedSnapshotA: InventorySnapshot = {
    pharmacy_id: pharmacyA,
    products: [
      {
        id: productA3Id,
        name: 'Ibuprofen 400mg',
        sku: 'IBU-400',
        selling_price: 1800,
        status: 'ACTIVE'
      }
    ],
    batches: []
  };

  await replacePharmacyInventorySnapshot(pharmacyA, updatedSnapshotA, indexedDB);

  // Previous products for Pharmacy A should be cleared
  const oldProduct = await getProductById(pharmacyA, productA1Id, indexedDB);
  assert(oldProduct === null, 'Old product A1 removed on complete snapshot replacement');

  const newProduct = await getProductById(pharmacyA, productA3Id, indexedDB);
  assert(newProduct !== null, 'New product A3 present after snapshot replacement');

  // Pharmacy B products remain completely intact
  const intactProdB = await getProductById(pharmacyB, productB1Id, indexedDB);
  assert(intactProdB !== null, 'Pharmacy B product remained completely intact during Pharmacy A replacement');

  // Clear Pharmacy A data using clearPharmacyOfflineData
  await clearPharmacyOfflineData(pharmacyA, indexedDB);
  const clearedA = await getProductById(pharmacyA, productA3Id, indexedDB);
  assert(clearedA === null, 'Pharmacy A catalog cleared by clearPharmacyOfflineData');

  const stillIntactB = await getProductById(pharmacyB, productB1Id, indexedDB);
  assert(stillIntactB !== null, 'Pharmacy B catalog remains completely intact after Pharmacy A purge');

  // Re-ingest validSnapshotA for subsequent integration tests
  await replacePharmacyInventorySnapshot(pharmacyA, validSnapshotA, indexedDB);

  // --- 8. INTEGRATION WITH PHASE 5D-3 SALE DOMAIN ---
  console.log('\n[8. Integration with Phase 5D-3 Local Sales Domain]');

  // Populate sale line item from read model
  const populatedLine = await populateSaleLineItemFromReadModel(
    pharmacyA,
    productA1Id,
    batchA1Id,
    3,
    indexedDB
  );

  assert(populatedLine.product_id === productA1Id, 'Populated line item has correct product_id');
  assert(populatedLine.batch_id === batchA1Id, 'Populated line item has correct batch_id');
  assert(populatedLine.quantity === 3, 'Populated line item has correct quantity (3)');
  assert(populatedLine.unit_price === 1500, 'Populated line item extracted correct unit_price (1500 minor units)');

  // Feed populated line item directly into Phase 5D-3 createLocalSale
  const saleRes = await createLocalSale(
    {
      compatibility_non_draft: true,
      pharmacy_id: pharmacyA,
      branch_id: branchA1,
      cashier_id: cashierA,
      customer_id: null,
      currency: 'NGN',
      payment_method: 'CASH',
      line_items: [populatedLine]
    },
    indexedDB
  );

  assert(saleRes.success === true, 'Phase 5D-3 createLocalSale succeeded with read-model line item');
  assert(saleRes.sale?.subtotal === 4500, 'Sale subtotal is 3 * 1500 = 4500');
  assert(saleRes.sale?.total === 4500, 'Sale total is 4500');
  assert(saleRes.transaction?.status === 'PENDING', 'Created transaction is PENDING');
  assert(saleRes.queueItem?.status === 'PENDING', 'Created queue item is PENDING');
  assert(saleRes.transaction?.payload_hash.length === 64, 'Transaction has valid 64-char SHA-256 payload hash');

  const readBackSale = await getLocalSale(pharmacyA, saleRes.sale!.client_op_id, indexedDB);
  assert(readBackSale !== null, 'Sale verified in local transaction store');
  assert(readBackSale?.line_items[0].product_id === productA1Id, 'Stored sale line item product matches');

  // --- 9. SECURITY & NON-AUTHORITATIVE INVARIANTS ---
  console.log('\n[9. Security & Non-Authoritative Invariants]');

  const serializedProd = JSON.stringify(p1);
  assert(!serializedProd.includes('privateKey'), 'No privateKey in local product record');
  assert(!serializedProd.includes('access_token'), 'No access_token in local product record');
  assert(!serializedProd.includes('service_role'), 'No service_role in local product record');

  const serializedBatch = JSON.stringify(batchA1Id);
  assert(!serializedBatch.includes('privateKey'), 'No privateKey in local batch record');

  closeOfflineDb();

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-4 INVENTORY READ MODEL TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runInventoryTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
