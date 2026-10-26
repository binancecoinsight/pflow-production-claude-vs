import { indexedDB } from 'fake-indexeddb';
import {
  createCart,
  createCartFromSession,
  addItemToCart,
  updateCartItemQuantity,
  removeCartItem,
  clearCart,
  finalizePosSale,
  checkCatalogFreshness,
  loadOrCreateDurableCart
} from '../../lib/pos/index';
import {
  replacePharmacyInventorySnapshot,
  searchProducts,
  findProductByBarcode,
  findProductBySku,
  listLocalProducts,
  InventorySnapshot
} from '../../lib/inventory/index';
import { openOfflineDb, closeOfflineDb, getQueueItem } from '../../lib/offline/index';
import { getLocalSale } from '../../lib/sales/index';
import { formatMinorUnits, formatDate } from './formatters';

async function runPosUiTestSuite() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-6 POS UI & DOMAIN INTEGRATION TESTS ---');

  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA = '33333333-3333-4333-8333-333333333333';
  const branchB = '44444444-4444-4444-8444-444444444444';
  const userA = '55555555-5555-4555-8555-555555555555'; // Supabase auth.users(id)
  const userB = '66666666-6666-4666-8666-666666666666';

  const prodA1 = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA2 = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA3Expired = 'aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa';
  const batchA1 = 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';
  const batchA2 = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
  const batchA3Expired = 'bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb';

  // Seed Pharmacy A local catalog snapshot into Phase 5D-4 IndexedDB
  const snapshotA: InventorySnapshot = {
    pharmacy_id: pharmacyA,
    products: [
      {
        id: prodA1,
        name: 'Paracetamol 500mg Tablets',
        generic_name: 'Acetaminophen',
        sku: 'PARA-500-TAB',
        barcode: '9780201379624',
        selling_price: 1500, // ₦15.00
        category: 'Analgesics',
        status: 'ACTIVE'
      },
      {
        id: prodA2,
        name: 'Amoxicillin 250mg Suspension',
        generic_name: 'Amoxicillin Trihydrate',
        sku: 'AMOX-250-SUSP',
        barcode: '9780201379631',
        selling_price: 3200, // ₦32.00
        category: 'Antibiotics',
        status: 'ACTIVE'
      },
      {
        id: prodA3Expired,
        name: 'Expired Test Syrups',
        sku: 'EXP-SYR-001',
        selling_price: 500,
        status: 'ACTIVE'
      }
    ],
    batches: [
      {
        id: batchA1,
        product_id: prodA1,
        branch_id: branchA,
        batch_number: 'LOT-A1-2027',
        expiry_date: '2027-12-31',
        quantity: 120,
        selling_price: 1500,
        status: 'ACTIVE'
      },
      {
        id: batchA2,
        product_id: prodA2,
        branch_id: branchA,
        batch_number: 'LOT-A2-2028',
        expiry_date: '2028-06-30',
        quantity: 50,
        selling_price: 3200,
        status: 'ACTIVE'
      },
      {
        id: batchA3Expired,
        product_id: prodA3Expired,
        branch_id: branchA,
        batch_number: 'LOT-EXPIRED',
        expiry_date: '2023-01-01',
        quantity: 10,
        selling_price: 500,
        status: 'EXPIRED'
      }
    ]
  };

  await replacePharmacyInventorySnapshot(pharmacyA, snapshotA, indexedDB);

  // Seed Pharmacy B catalog to test tenant isolation
  const prodB1 = 'cccccccc-1111-4ccc-8ccc-cccccccccccc';
  const batchB1 = 'dddddddd-1111-4ddd-8ddd-dddddddddddd';
  const snapshotB: InventorySnapshot = {
    pharmacy_id: pharmacyB,
    products: [
      {
        id: prodB1,
        name: 'Pharmacy B Proprietary Ointment',
        sku: 'PHARM-B-OINT',
        barcode: '9780201379648',
        selling_price: 6000,
        status: 'ACTIVE'
      }
    ],
    batches: [
      {
        id: batchB1,
        product_id: prodB1,
        branch_id: branchB,
        batch_number: 'LOT-B1',
        expiry_date: '2027-01-01',
        quantity: 20,
        selling_price: 6000,
        status: 'ACTIVE'
      }
    ]
  };

  await replacePharmacyInventorySnapshot(pharmacyB, snapshotB, indexedDB);

  // --- 1. UI FORMATTERS & MONETARY CALCULATION DISPLAY ---
  console.log('\n[1. UI Formatters & Monetary Precision]');

  assert(formatMinorUnits(1500, 'NGN') === '₦15.00', '1500 kobo formats as ₦15.00');
  assert(formatMinorUnits(0, 'NGN') === '₦0.00', '0 kobo formats as ₦0.00');
  assert(formatMinorUnits(3200, 'USD') === '$32.00', 'USD currency symbol correctly formatted');
  assert(formatDate('2027-12-31').length > 0, 'Date string is formatted');

  // --- 2. LOCAL READ-MODEL PRODUCT SEARCH ---
  console.log('\n[2. Product Search in Local Read Model]');

  // A. Search by Name
  const nameResults = await searchProducts(pharmacyA, 'Paracetamol', 10, indexedDB);
  assert(nameResults.length === 1, 'Search by product name returns matching item');
  assert(nameResults[0].id === prodA1, 'Matched correct product ID');

  // B. Search by Generic Name
  const genericResults = await searchProducts(pharmacyA, 'Acetaminophen', 10, indexedDB);
  assert(genericResults.length === 1, 'Search by generic name returns matching item');

  // C. Search by SKU
  const skuResult = await findProductBySku(pharmacyA, 'AMOX-250-SUSP', indexedDB);
  assert(skuResult !== null, 'Found product by exact SKU');
  assert(skuResult?.id === prodA2, 'Matched correct product for SKU');

  // D. Search by Barcode
  const barcodeResult = await findProductByBarcode(pharmacyA, '9780201379624', indexedDB);
  assert(barcodeResult !== null, 'Found product by exact barcode');
  assert(barcodeResult?.id === prodA1, 'Matched correct product for barcode');

  // E. No Results Search
  const emptyResults = await searchProducts(pharmacyA, 'NonExistentMedicineXYZ', 10, indexedDB);
  assert(emptyResults.length === 0, 'Empty result set for non-matching query');

  // F. List Initial Products
  const listed = await listLocalProducts(pharmacyA, 10, indexedDB);
  assert(listed.length === 3, 'listLocalProducts returns all 3 local products for Pharmacy A');

  // --- 3. CART OPERATIONS & STATE TRANSITIONS ---
  console.log('\n[3. Cart Operations & Calculations]');

  // Initialize cart bound to session
  let cart = createCartFromSession({
    user: { id: userA },
    pharmacy: { id: pharmacyA },
    branch: { id: branchA }
  }, 'NGN');

  assert(cart.pharmacy_id === pharmacyA, 'Cart initialized with active pharmacy_id');
  assert(cart.cashier_id === userA, 'Cart cashier_id bound to authenticated user.id');
  assert(cart.line_items.length === 0, 'Cart starts empty');
  assert(cart.total === 0, 'Initial cart total is 0');

  // Add Item 1 (Auto-selects FEFO batch)
  cart = await addItemToCart(cart, { product_id: prodA1, quantity: 2 }, indexedDB);
  assert(cart.line_items.length === 1, 'Added first item to cart');
  assert(cart.line_items[0].product_id === prodA1, 'Line 1 product matches');
  assert(cart.line_items[0].batch_id === batchA1, 'Line 1 auto-selected batch LOT-A1-2027');
  assert(cart.line_items[0].quantity === 2, 'Line 1 quantity is 2');
  assert(cart.line_items[0].unit_price === 1500, 'Unit price is 1500 minor units');
  assert(cart.line_items[0].line_total === 3000, 'Line 1 total is 2 * 1500 = 3000');
  assert(cart.total === 3000, 'Cart total is 3000 (₦30.00)');

  // Add Item 2
  cart = await addItemToCart(cart, { product_id: prodA2, quantity: 1 }, indexedDB);
  assert(cart.line_items.length === 2, 'Added second item to cart');
  assert(cart.line_items[1].product_id === prodA2, 'Line 2 product matches');
  assert(cart.line_items[1].line_total === 3200, 'Line 2 total is 3200 (₦32.00)');
  assert(cart.subtotal === 6200, 'Cart subtotal is 3000 + 3200 = 6200');
  assert(cart.total === 6200, 'Cart total is 6200 (₦62.00)');

  // Increase Quantity of Item 1
  const line1Id = cart.line_items[0].id;
  cart = updateCartItemQuantity(cart, line1Id, 4);
  assert(cart.line_items[0].quantity === 4, 'Updated quantity to 4');
  assert(cart.line_items[0].line_total === 6000, 'Line 1 total is 4 * 1500 = 6000');
  assert(cart.total === 9200, 'Cart total updated to 6000 + 3200 = 9200');

  // Decrease Quantity of Item 1
  cart = updateCartItemQuantity(cart, line1Id, 3);
  assert(cart.line_items[0].quantity === 3, 'Decreased quantity to 3');
  assert(cart.line_items[0].line_total === 4500, 'Line 1 total is 3 * 1500 = 4500');
  assert(cart.total === 7700, 'Cart total updated to 4500 + 3200 = 7700');

  // Remove Item 2
  const line2Id = cart.line_items[1].id;
  cart = removeCartItem(cart, line2Id);
  assert(cart.line_items.length === 1, 'Removed item 2 from cart');
  assert(cart.total === 4500, 'Cart total reflects removal');

  // Clear Cart
  const clearedCart = clearCart(cart);
  assert(clearedCart.line_items.length === 0, 'Cleared cart has 0 line items');
  assert(clearedCart.total === 0, 'Cleared cart total is 0');
  assert(clearedCart.pharmacy_id === pharmacyA, 'Cleared cart preserves active pharmacy_id context');

  // --- 4. BATCH SAFETY & EXPIRED BATCH REJECTION ---
  console.log('\n[4. Batch Safety & Expiry Rejection]');

  let expiredRejectionCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodA3Expired }, indexedDB);
  } catch (err: unknown) {
    expiredRejectionCaught = true;
  }
  assert(expiredRejectionCaught === true, 'Adding product with only expired batches is strictly rejected');

  // --- 5. TENANT ISOLATION & PHARMACY SWITCHING SAFETY ---
  console.log('\n[5. Tenant Safety on Pharmacy Switching]');

  // A. Pharmacy B product cannot be added to Pharmacy A cart
  let crossPharmacyProdCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodB1 }, indexedDB);
  } catch {
    crossPharmacyProdCaught = true;
  }
  assert(crossPharmacyProdCaught === true, 'Attempting to add Pharmacy B product to Pharmacy A cart is blocked');

  // B. Simulating pharmacy switch: switching context from Pharmacy A to Pharmacy B
  // creates a fresh cart and invalidates previous cart context
  const switchedCart = createCartFromSession({
    user: { id: userA },
    pharmacy: { id: pharmacyB },
    branch: { id: branchB }
  });
  assert(switchedCart.pharmacy_id === pharmacyB, 'Switched cart is bound strictly to Pharmacy B');
  assert(switchedCart.line_items.length === 0, 'Switched cart starts with clean line items (no leakage)');

  // --- 6. COMPLETE SALE FLOW & OFFLINE DURABILITY ---
  console.log('\n[6. Complete Sale Flow & Offline Durability]');

  // Re-populate cart with 2 items for Pharmacy A
  let saleCart = await loadOrCreateDurableCart({
    pharmacy_id: pharmacyA, branch_id: branchA, cashier_id: userA, authenticated_user_id: userA, currency: 'NGN'
  }, indexedDB);
  saleCart = await addItemToCart(saleCart, { product_id: prodA1, quantity: 2 }, indexedDB); // 3000
  saleCart = await addItemToCart(saleCart, { product_id: prodA2, quantity: 1 }, indexedDB); // 3200
  assert(saleCart.total === 6200, 'Sale cart total is 6200');

  // Empty cart cannot finalize
  const emptyFinalizeRes = await finalizePosSale(
    clearCart(saleCart),
    { payment_method: 'CASH', authenticated_user_id: userA },
    indexedDB
  );
  assert(emptyFinalizeRes.success === false, 'Finalizing empty cart is rejected by domain layer');
  assert(Boolean(emptyFinalizeRes.errors?.[0]?.includes('Cart is empty')), 'Reports empty cart error message');

  // Finalize Sale
  const finalizationResult = await finalizePosSale(
    saleCart,
    { payment_method: 'CASH', authenticated_user_id: userA },
    indexedDB
  );

  assert(finalizationResult.success === true, 'finalizePosSale succeeded');
  assert(finalizationResult.sale !== undefined, 'Sale entity created');
  assert(finalizationResult.transaction !== undefined, 'LocalTransaction created');
  assert(finalizationResult.queueItem !== undefined, 'SyncQueueItem created');
  assert(finalizationResult.sale?.cashier_id === userA, 'Sale cashier_id matches authenticated user');
  assert(finalizationResult.sale?.payment_method === 'CASH', 'Payment method is CASH');
  assert(finalizationResult.sale?.total === 6200, 'Sale total is 6200 minor units');

  // Verify transaction status is PENDING (committed locally, queued for background sync)
  assert(finalizationResult.transaction?.status === 'PENDING', 'Transaction status is PENDING (Local Ledger)');
  assert(finalizationResult.queueItem?.status === 'PENDING', 'Queue item status is PENDING (Sync Queue)');

  // Verify persistence in IndexedDB via Phase 5D-3 reader
  const storedSale = await getLocalSale(pharmacyA, finalizationResult.sale!.client_op_id, indexedDB);
  assert(storedSale !== null, 'Sale verified in local IndexedDB storage');
  assert(storedSale?.id === finalizationResult.sale?.id, 'Stored sale ID matches domain entity');

  // Verify queue item in IndexedDB via Phase 5D-2 reader
  const storedQueueItem = await getQueueItem(pharmacyA, finalizationResult.sale!.client_op_id, indexedDB);
  assert(storedQueueItem !== null, 'Queue item verified in local sync_queue');
  assert(storedQueueItem?.client_op_id === finalizationResult.sale?.client_op_id, 'Queue item client_op_id matches');

  // --- 7. DOUBLE-SUBMISSION PROTECTION & IDEMPOTENCY ---
  console.log('\n[7. Double-Submission Protection & Idempotency]');

  const explicitOpId = '88888888-8888-4888-8888-888888888888';
  const firstSubmission = await finalizePosSale(
    saleCart,
    { payment_method: 'CARD', client_op_id: explicitOpId, authenticated_user_id: userA },
    indexedDB
  );
  assert(firstSubmission.success === false, 'Caller cannot replace the checkout-reserved client_op_id');

  // Repeating the reserved checkout retrieves the already durable operation.
  const duplicateSubmission = await finalizePosSale(
    saleCart,
    { payment_method: 'CARD', client_op_id: saleCart.client_op_id, authenticated_user_id: userA },
    indexedDB
  );
  assert(duplicateSubmission.success === true && duplicateSubmission.transaction?.id === finalizationResult.transaction?.id,
    'Retry retrieves the first durable checkout operation without duplication');

  // --- 8. CATALOG FRESHNESS INDICATOR ---
  console.log('\n[8. Catalog Freshness Verification]');

  const freshnessStatus = await checkCatalogFreshness(pharmacyA, indexedDB);
  assert(freshnessStatus.isStale === false, 'Catalog is fresh');
  assert(freshnessStatus.productCount === 3, 'Catalog contains 3 products');
  assert(freshnessStatus.batchCount === 3, 'Catalog contains 3 batches');

  // --- 9. SECURITY & NON-LEAKAGE INVARIANTS ---
  console.log('\n[9. Security & Non-Leakage Invariants]');

  const cartDump = JSON.stringify(saleCart);
  assert(!cartDump.includes('privateKey'), 'No privateKey in POS cart');
  assert(!cartDump.includes('access_token'), 'No access_token in POS cart');
  assert(!cartDump.includes('service_role'), 'No service_role in POS cart');

  closeOfflineDb();

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-6 POS UI TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runPosUiTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
