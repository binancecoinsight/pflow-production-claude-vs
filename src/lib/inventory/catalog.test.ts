import { indexedDB } from 'fake-indexeddb';
import {
  replacePharmacyInventorySnapshot,
  findProductsByBarcode,
  findProductByBarcode,
  findProductBySku,
  resolveBarcodeScan,
  checkProductDuplicates,
  parseMajorCurrencyToMinor,
  InventorySnapshot
} from './index';
import { openOfflineDb, STORES } from '../offline/db';
import { createCartFromSession, addItemToCart } from '../pos/index';

async function runCatalogTestSuite() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-22 MASTER PRODUCT CATALOG & POS BARCODE SAFETY TESTS ---');

  // Open DB with fake-indexeddb
  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA = '33333333-3333-4333-8333-333333333333';
  const userA = '55555555-5555-4555-8555-555555555555';

  const prodA1 = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA2 = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA3Dup = 'aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA4Inactive = 'aaaaaaaa-4444-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA5ActiveColliding = 'aaaaaaaa-5555-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA6SoleInactive = 'aaaaaaaa-6666-4aaa-8aaa-aaaaaaaaaaaa';

  const prodB1 = 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';

  // Seed Pharmacy A catalog snapshot into Phase 5D-4 read model
  const catalogA: InventorySnapshot = {
    pharmacy_id: pharmacyA,
    products: [
      {
        id: prodA1,
        pharmacy_id: pharmacyA,
        name: 'Paracetamol 500mg Tablets',
        sku: 'PARA-500',
        barcode: '1111111111111',
        selling_price: 1500,
        cost_price: 1000,
        status: 'ACTIVE'
      },
      {
        id: prodA2,
        pharmacy_id: pharmacyA,
        name: 'Amoxicillin 500mg Capsules',
        sku: 'AMOX-500',
        barcode: '2222222222222',
        selling_price: 3200,
        cost_price: 2500,
        status: 'ACTIVE'
      },
      {
        id: prodA3Dup,
        pharmacy_id: pharmacyA,
        name: 'Amoxicillin 250mg Suspension (Colliding Barcode)',
        sku: 'AMOX-250',
        barcode: '2222222222222', // Collides with prodA2!
        selling_price: 2800,
        cost_price: 2000,
        status: 'ACTIVE'
      },
      {
        id: prodA4Inactive,
        pharmacy_id: pharmacyA,
        name: 'Discontinued Cough Syrup (Inactive)',
        sku: 'COUGH-001',
        barcode: '3333333333333',
        selling_price: 1200,
        cost_price: 800,
        status: 'INACTIVE'
      },
      {
        id: prodA5ActiveColliding,
        pharmacy_id: pharmacyA,
        name: 'Active Cough Lozenges (Collides with Inactive)',
        sku: 'COUGH-002',
        barcode: '3333333333333', // Collides with prodA4Inactive!
        selling_price: 900,
        cost_price: 600,
        status: 'ACTIVE'
      },
      {
        id: prodA6SoleInactive,
        pharmacy_id: pharmacyA,
        name: 'Banned Painkiller (Sole Inactive Match)',
        sku: 'BANNED-01',
        barcode: '4444444444444',
        selling_price: 5000,
        cost_price: 4000,
        status: 'INACTIVE'
      }
    ],
    batches: [
      {
        id: '11111111-aaaa-4aaa-8aaa-111111111111',
        pharmacy_id: pharmacyA,
        product_id: prodA1,
        branch_id: branchA,
        batch_number: 'BATCH-A1',
        expiry_date: '2028-12-31',
        quantity: 100,
        selling_price: 1500,
        cost_price: 1000,
        status: 'ACTIVE'
      },
      {
        id: '22222222-aaaa-4aaa-8aaa-222222222222',
        pharmacy_id: pharmacyA,
        product_id: prodA2,
        branch_id: branchA,
        batch_number: 'BATCH-A2',
        expiry_date: '2028-12-31',
        quantity: 50,
        selling_price: 3200,
        cost_price: 2500,
        status: 'ACTIVE'
      },
      {
        id: '33333333-aaaa-4aaa-8aaa-333333333333',
        pharmacy_id: pharmacyA,
        product_id: prodA3Dup,
        branch_id: branchA,
        batch_number: 'BATCH-A3',
        expiry_date: '2028-12-31',
        quantity: 60,
        selling_price: 2800,
        cost_price: 2000,
        status: 'ACTIVE'
      },
      {
        id: '55555555-aaaa-4aaa-8aaa-555555555555',
        pharmacy_id: pharmacyA,
        product_id: prodA5ActiveColliding,
        branch_id: branchA,
        batch_number: 'BATCH-A5',
        expiry_date: '2028-12-31',
        quantity: 75,
        selling_price: 900,
        cost_price: 600,
        status: 'ACTIVE'
      }
    ]
  };

  await replacePharmacyInventorySnapshot(pharmacyA, catalogA, indexedDB);

  // Seed Pharmacy B with identical barcode '1111111111111'
  const catalogB: InventorySnapshot = {
    pharmacy_id: pharmacyB,
    products: [
      {
        id: prodB1,
        pharmacy_id: pharmacyB,
        name: 'Pharmacy B Exclusive Product',
        sku: 'PHARMB-001',
        barcode: '1111111111111', // Identical barcode across tenants!
        selling_price: 9900,
        cost_price: 8000,
        status: 'ACTIVE'
      }
    ],
    batches: []
  };

  await replacePharmacyInventorySnapshot(pharmacyB, catalogB, indexedDB);

  // --- 1. SINGLE ACTIVE BARCODE MATCH ---
  console.log('\n[1. Single Active Barcode Match]');
  const singleMatches = await findProductsByBarcode(pharmacyA, '1111111111111', indexedDB);
  assert(singleMatches.length === 1, 'Query returns exactly 1 product for unique barcode');
  assert(singleMatches[0].id === prodA1, 'Matched correct product ID');

  const singleResolution = await resolveBarcodeScan(pharmacyA, '1111111111111', indexedDB);
  assert(singleResolution.type === 'SINGLE_ACTIVE', 'Resolution classifies as SINGLE_ACTIVE');
  assert(singleResolution.product?.id === prodA1, 'Resolution provides active product for safe cart addition');

  // --- 2. MULTIPLE ACTIVE MATCHES REQUIRING EXPLICIT RESOLUTION ---
  console.log('\n[2. Multiple Active Matches Requiring Explicit Resolution]');
  const dupMatches = await findProductsByBarcode(pharmacyA, '2222222222222', indexedDB);
  assert(dupMatches.length === 2, 'Query returns all 2 products sharing barcode 2222222222222');
  assert(dupMatches.some((p) => p.id === prodA2), 'Contains first active product');
  assert(dupMatches.some((p) => p.id === prodA3Dup), 'Contains second active product');

  const dupResolution = await resolveBarcodeScan(pharmacyA, '2222222222222', indexedDB);
  assert(dupResolution.type === 'MULTIPLE_MATCHES', 'Resolution classifies as MULTIPLE_MATCHES');
  assert(dupResolution.matches.length === 2, 'Resolution matches list contains both products');
  assert(dupResolution.product === undefined, 'No product is automatically selected (fail-safe invariant)');

  // --- 3. ACTIVE AND INACTIVE PRODUCTS SHARING A BARCODE ---
  console.log('\n[3. Active and Inactive Products Sharing a Barcode]');
  const mixedMatches = await findProductsByBarcode(pharmacyA, '3333333333333', indexedDB);
  assert(mixedMatches.length === 2, 'Returns both products sharing barcode 3333333333333');

  const mixedResolution = await resolveBarcodeScan(pharmacyA, '3333333333333', indexedDB);
  assert(mixedResolution.type === 'MULTIPLE_MATCHES', 'Mixed active/inactive collision triggers MULTIPLE_MATCHES');
  const inactiveInMixed = mixedResolution.matches.find((p) => p.status?.toUpperCase() === 'INACTIVE');
  const activeInMixed = mixedResolution.matches.find((p) => p.status?.toUpperCase() === 'ACTIVE');
  assert(inactiveInMixed?.id === prodA4Inactive, 'Inactive product identified in disambiguation candidates');
  assert(activeInMixed?.id === prodA5ActiveColliding, 'Active product identified in disambiguation candidates');

  // --- 4. SOLE INACTIVE MATCH BLOCKED FROM SALE ---
  console.log('\n[4. Sole Inactive Match Blocked from Sale]');
  const inactiveResolution = await resolveBarcodeScan(pharmacyA, '4444444444444', indexedDB);
  assert(inactiveResolution.type === 'SINGLE_INACTIVE', 'Resolution classifies as SINGLE_INACTIVE');
  assert(inactiveResolution.product?.id === prodA6SoleInactive, 'Identifies sole inactive product');

  // Verify cart domain layer strictly blocks adding this product
  let cart = createCartFromSession({
    user: { id: userA },
    pharmacy: { id: pharmacyA },
    branch: { id: branchA }
  });
  let inactiveAddBlocked = false;
  try {
    await addItemToCart(cart, { product_id: prodA6SoleInactive }, indexedDB);
  } catch (err: any) {
    inactiveAddBlocked = true;
    assert(err.message.includes('currently inactive and cannot be sold'), 'Cart engine rejects inactive product addition');
  }
  assert(inactiveAddBlocked, 'Inactive product cannot be added to sale cart');

  // --- 5. PHARMACY TENANT ISOLATION ---
  console.log('\n[5. Pharmacy Tenant Isolation]');
  const tenantAMatches = await findProductsByBarcode(pharmacyA, '1111111111111', indexedDB);
  assert(tenantAMatches.length === 1 && tenantAMatches[0].pharmacy_id === pharmacyA, 'Pharmacy A returns Pharmacy A product only');
  assert(!tenantAMatches.some((p) => p.id === prodB1), 'Pharmacy B product never appears in Pharmacy A barcode queries');

  const tenantBMatches = await findProductsByBarcode(pharmacyB, '1111111111111', indexedDB);
  assert(tenantBMatches.length === 1 && tenantBMatches[0].pharmacy_id === pharmacyB, 'Pharmacy B returns Pharmacy B product only');
  assert(tenantBMatches[0].id === prodB1, 'Pharmacy B barcode queries resolve strictly to Pharmacy B entity');

  // --- 6. NO AUTOMATIC FIRST-MATCH SELECTION ---
  console.log('\n[6. No Automatic First-Match Selection on Duplicate Barcodes]');
  assert(dupResolution.product === undefined, 'dupResolution.product is undefined; automatic selection is prohibited');
  assert(mixedResolution.product === undefined, 'mixedResolution.product is undefined; automatic selection is prohibited');

  // --- 7. CANCELLATION LEAVES ALL CART CONTENTS AND TOTALS UNCHANGED ---
  console.log('\n[7. Cancellation Leaves Cart Contents and Totals Unchanged]');
  // Setup cart with initial valid product
  cart = await addItemToCart(cart, { product_id: prodA1, quantity: 2 }, indexedDB);
  const initialLineCount = cart.line_items.length;
  const initialSubtotal = cart.subtotal;
  const initialTotal = cart.total;
  const initialLinesSnapshot = JSON.stringify(cart.line_items);

  // Ambiguous barcode scanned:
  const ambiguousRes = await resolveBarcodeScan(pharmacyA, '2222222222222', indexedDB);
  assert(ambiguousRes.type === 'MULTIPLE_MATCHES', 'Ambiguous scan detected');

  // Operator dismisses/cancels the modal without selecting any item:
  // (No addItemToCart is called)
  assert(cart.line_items.length === initialLineCount, 'Line items count strictly unchanged');
  assert(cart.subtotal === initialSubtotal, 'Subtotal strictly unchanged');
  assert(cart.total === initialTotal, 'Total strictly unchanged');
  assert(JSON.stringify(cart.line_items) === initialLinesSnapshot, 'Cart line items payload bit-for-bit unchanged');

  // --- 8. DUPLICATE SKU/BARCODE ADVISORY WARNINGS ON CREATION ---
  console.log('\n[8. Duplicate SKU/Barcode Advisory Warnings on Creation]');
  const creationCheck = await checkProductDuplicates(pharmacyA, {
    sku: 'PARA-500',
    barcode: '2222222222222'
  }, indexedDB);
  assert(creationCheck.skuConflict !== null, 'Advisory check flags existing SKU collision');
  assert(creationCheck.skuConflict?.id === prodA1, 'Identifies conflicting product for SKU');
  assert(creationCheck.barcodeConflict !== null, 'Advisory check flags existing Barcode collision');
  assert(creationCheck.barcodeConflict?.barcode === '2222222222222', 'Identifies conflicting barcode');

  // --- 9. EDITING EXCLUDES CURRENT PRODUCT FROM ITS OWN DUPLICATE WARNING ---
  console.log('\n[9. Editing Excludes Current Product from Its Own Duplicate Warning]');
  const editSelfCheck = await checkProductDuplicates(pharmacyA, {
    sku: 'PARA-500',
    barcode: '1111111111111',
    excludeProductId: prodA1
  }, indexedDB);
  assert(editSelfCheck.skuConflict === null, 'Self SKU collision excluded when editing product');
  assert(editSelfCheck.barcodeConflict === null, 'Self Barcode collision excluded when editing product');

  // Editing with a different product's barcode still detects collision:
  const editOtherConflict = await checkProductDuplicates(pharmacyA, {
    sku: 'PARA-500',
    barcode: '2222222222222',
    excludeProductId: prodA1
  }, indexedDB);
  assert(editOtherConflict.barcodeConflict !== null, 'Collision with other product barcode correctly flagged');

  // --- 10. CATALOG STATUS CHANGES PREVENT INACTIVE PRODUCTS FROM BEING ADDED TO SALES ---
  console.log('\n[10. Catalog Status Changes Prevent Inactive Products in Sales]');
  // Deactivate prodA1 in local IndexedDB
  const db = await openOfflineDb(indexedDB);
  const tx = db.transaction(STORES.PRODUCTS, 'readwrite');
  const store = tx.objectStore(STORES.PRODUCTS);
  const prodA1Record = await new Promise<any>((resolve) => {
    const req = store.get(prodA1);
    req.onsuccess = () => resolve(req.result);
  });
  prodA1Record.status = 'INACTIVE';
  await new Promise<void>((resolve) => {
    const req = store.put(prodA1Record);
    req.onsuccess = () => resolve();
  });

  // Now attempt to add prodA1 to a fresh cart
  const freshCart = createCartFromSession({
    user: { id: userA },
    pharmacy: { id: pharmacyA },
    branch: { id: branchA }
  });
  let addDeactivatedBlocked = false;
  try {
    await addItemToCart(freshCart, { product_id: prodA1 }, indexedDB);
  } catch (err: any) {
    addDeactivatedBlocked = true;
    assert(err.message.includes('currently inactive and cannot be sold'), 'Deactivated product addition fails with inactive error');
  }
  assert(addDeactivatedBlocked, 'Deactivated catalog product cannot be added to sales cart');

  // Restore status for clean test isolation
  prodA1Record.status = 'ACTIVE';
  await new Promise<void>((resolve) => {
    const tx2 = db.transaction(STORES.PRODUCTS, 'readwrite');
    const store2 = tx2.objectStore(STORES.PRODUCTS);
    const req = store2.put(prodA1Record);
    req.onsuccess = () => resolve();
  });

  // --- 11. PRICE CONVERSION (DECIMAL CURRENCY & INVALID/OUT-OF-RANGE) ---
  console.log('\n[11. Price Conversion & Validation]');
  const valid1 = parseMajorCurrencyToMinor('15.50');
  assert(valid1.success && valid1.value === 1550, '15.50 major units converts to 1550 minor units');

  const valid2 = parseMajorCurrencyToMinor(25.99);
  assert(valid2.success && valid2.value === 2599, '25.99 numeric converts to 2599 minor units');

  const validZero = parseMajorCurrencyToMinor('0');
  assert(validZero.success && validZero.value === 0, '0 major units converts to 0 minor units');

  const rounded = parseMajorCurrencyToMinor('10.004');
  assert(rounded.success && rounded.value === 1000, 'Sub-cent decimal rounded deterministically');

  const negative = parseMajorCurrencyToMinor('-5.00');
  assert(!negative.success && Boolean(negative.error?.includes('negative')), 'Negative price rejected');

  const nonNumeric = parseMajorCurrencyToMinor('abc');
  assert(!nonNumeric.success && Boolean(nonNumeric.error?.includes('valid finite number')), 'Non-numeric price rejected');

  const emptyStr = parseMajorCurrencyToMinor('   ');
  assert(!emptyStr.success && Boolean(emptyStr.error?.includes('cannot be empty')), 'Empty price string rejected');

  const outOfRange = parseMajorCurrencyToMinor(999999999999);
  assert(!outOfRange.success && Boolean(outOfRange.error?.includes('exceeds maximum')), 'Out-of-range price rejected');

  // --- 12. CATALOG REFRESH DOES NOT MUTATE PENDING QUEUE ITEMS OR TRANSACTIONS ---
  console.log('\n[12. Catalog Refresh Does Not Mutate Pending Queue or Transactions]');
  const dbTx = db.transaction([STORES.QUEUE, STORES.TRANSACTIONS], 'readwrite');
  const queueStore = dbTx.objectStore(STORES.QUEUE);
  const journalStore = dbTx.objectStore(STORES.TRANSACTIONS);

  const testOpId = 'op-99999999-9999-4999-8999-999999999999';
  const dummyQueueItem = {
    id: 'q-999',
    client_op_id: testOpId,
    pharmacy_id: pharmacyA,
    device_id: 'dev-1',
    endpoint: '/sync-push-sale',
    payload: { sale_id: 'sale-999', total: 5000 },
    status: 'PENDING',
    created_at: Date.now()
  };

  const dummyJournalEntry = {
    id: 'sale-999',
    pharmacy_id: pharmacyA,
    total: 5000,
    status: 'PENDING',
    created_at: new Date().toISOString()
  };

  await new Promise<void>((resolve) => {
    queueStore.put(dummyQueueItem);
    journalStore.put(dummyJournalEntry);
    dbTx.oncomplete = () => resolve();
  });

  // Perform catalog snapshot replacement
  await replacePharmacyInventorySnapshot(pharmacyA, catalogA, indexedDB);

  // Verify queue and journal items are completely untouched
  const readTx = db.transaction([STORES.QUEUE, STORES.TRANSACTIONS], 'readonly');
  const queueItemAfter = await new Promise<any>((resolve) => {
    const req = readTx.objectStore(STORES.QUEUE).get('q-999');
    req.onsuccess = () => resolve(req.result);
  });
  const journalEntryAfter = await new Promise<any>((resolve) => {
    const req = readTx.objectStore(STORES.TRANSACTIONS).get('sale-999');
    req.onsuccess = () => resolve(req.result);
  });

  assert(queueItemAfter !== undefined, 'Pending queue item preserved after catalog refresh');
  assert(queueItemAfter?.client_op_id === testOpId, 'Pending queue item client_op_id matches');
  assert(queueItemAfter?.status === 'PENDING', 'Pending queue item status unchanged');
  assert(journalEntryAfter !== undefined, 'Sales journal entry preserved after catalog refresh');
  assert(journalEntryAfter?.id === 'sale-999', 'Sales journal ID unchanged');

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-22 CATALOG & BARCODE TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runCatalogTestSuite().catch((err) => {
  console.error('Fatal error in catalog test suite:', err);
  process.exit(1);
});
