import { indexedDB } from 'fake-indexeddb';
import {
  createCart,
  createCartFromSession,
  addItemToCart,
  updateCartItemQuantity,
  removeCartItem,
  setCartDiscountsAndTaxes,
  clearCart,
  finalizePosSale,
  checkCatalogFreshness,
  loadOrCreateDurableCart,
  PosSessionContext
} from './index';
import { replacePharmacyInventorySnapshot, InventorySnapshot } from '../inventory/index';
import { openOfflineDb, closeOfflineDb } from '../offline/index';
import { getLocalSale } from '../sales/index';

async function runPosTestSuite() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-5 OFFLINE POS ORCHESTRATION TESTS ---');

  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA = '33333333-3333-4333-8333-333333333333';
  const branchB = '44444444-4444-4444-8444-444444444444';
  const cashierA = '55555555-5555-4555-8555-555555555555'; // Supabase auth.users(id)

  const prodA1 = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA2 = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  const prodA3Inactive = 'aaaaaaaa-3333-4aaa-8aaa-aaaaaaaaaaaa';
  const batchA1 = 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';
  const batchA2 = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';
  const batchA3Expired = 'bbbbbbbb-3333-4bbb-8bbb-bbbbbbbbbbbb';

  // Seed Pharmacy A catalog snapshot into Phase 5D-4 read model
  const catalogA: InventorySnapshot = {
    pharmacy_id: pharmacyA,
    products: [
      {
        id: prodA1,
        name: 'Paracetamol 500mg',
        sku: 'PARA-500',
        barcode: '1111111111111',
        selling_price: 1000, // 10.00 NGN
        status: 'ACTIVE'
      },
      {
        id: prodA2,
        name: 'Amoxicillin 500mg',
        sku: 'AMOX-500',
        barcode: '2222222222222',
        selling_price: 2500, // 25.00 NGN
        status: 'ACTIVE'
      },
      {
        id: prodA3Inactive,
        name: 'Discontinued Cough Syrup',
        sku: 'COUGH-001',
        selling_price: 1500,
        status: 'INACTIVE'
      }
    ],
    batches: [
      {
        id: batchA1,
        product_id: prodA1,
        branch_id: branchA,
        batch_number: 'LOT-A1',
        expiry_date: '2027-12-31',
        quantity: 150,
        selling_price: 1000,
        status: 'ACTIVE'
      },
      {
        id: batchA2,
        product_id: prodA2,
        branch_id: branchA,
        batch_number: 'LOT-A2',
        expiry_date: '2027-06-30',
        quantity: 80,
        selling_price: 2500,
        status: 'ACTIVE'
      },
      {
        id: batchA3Expired,
        product_id: prodA1,
        branch_id: branchA,
        batch_number: 'LOT-EXP',
        expiry_date: '2024-01-01',
        quantity: 10,
        selling_price: 1000,
        status: 'EXPIRED'
      }
    ]
  };

  await replacePharmacyInventorySnapshot(pharmacyA, catalogA, indexedDB);

  // Seed Pharmacy B catalog with distinct product
  const prodB1 = 'cccccccc-1111-4ccc-8ccc-cccccccccccc';
  const batchB1 = 'dddddddd-1111-4ddd-8ddd-dddddddddddd';
  const catalogB: InventorySnapshot = {
    pharmacy_id: pharmacyB,
    products: [
      {
        id: prodB1,
        name: 'Pharmacy B Item',
        selling_price: 5000,
        status: 'ACTIVE'
      }
    ],
    batches: [
      {
        id: batchB1,
        product_id: prodB1,
        branch_id: branchB,
        batch_number: 'LOT-B1',
        expiry_date: '2028-01-01',
        quantity: 50,
        selling_price: 5000,
        status: 'ACTIVE'
      }
    ]
  };

  await replacePharmacyInventorySnapshot(pharmacyB, catalogB, indexedDB);

  const contextA: PosSessionContext = {
    pharmacy_id: pharmacyA,
    branch_id: branchA,
    cashier_id: cashierA,
    currency: 'NGN'
  };

  // --- 1. CART INITIALIZATION & EMPTY STATE ---
  console.log('\n[1. Cart Initialization]');

  const cart = createCart(contextA);
  assert(cart.pharmacy_id === pharmacyA, 'Cart initialized with pharmacy_id');
  assert(cart.branch_id === branchA, 'Cart initialized with branch_id');
  assert(cart.cashier_id === cashierA, 'Cart initialized with cashier_id');
  assert(cart.currency === 'NGN', 'Cart initialized with default currency NGN');
  assert(cart.line_items.length === 0, 'New cart has 0 line items');
  assert(cart.total === 0, 'New cart total is 0');

  // --- 2. ADD ITEM & AUTO-BATCH RECOMMENDATION ---
  console.log('\n[2. Add Item & Batch Selection]');

  // Add Item with auto-batch selection
  const cartWithP1 = await addItemToCart(cart, { product_id: prodA1, quantity: 2 }, indexedDB);
  assert(cartWithP1.line_items.length === 1, 'Added item with auto-batch selection');
  assert(cartWithP1.line_items[0].product_id === prodA1, 'Line item has correct product_id');
  assert(cartWithP1.line_items[0].batch_id === batchA1, 'Auto-selected non-expired batch LOT-A1');
  assert(cartWithP1.line_items[0].quantity === 2, 'Quantity is 2');
  assert(cartWithP1.line_items[0].unit_price === 1000, 'Unit price is 1000 minor units');
  assert(cartWithP1.line_items[0].line_total === 2000, 'Line total is 2000 minor units');
  assert(cartWithP1.subtotal === 2000, 'Cart subtotal is 2000');
  assert(cartWithP1.total === 2000, 'Cart total is 2000');

  // Add Item with explicit batch selection
  const cartWithP2 = await addItemToCart(
    cartWithP1,
    { product_id: prodA2, batch_id: batchA2, quantity: 3, discount: 500, tax: 200 },
    indexedDB
  );
  assert(cartWithP2.line_items.length === 2, 'Added second product with explicit batch');
  assert(cartWithP2.line_items[1].batch_id === batchA2, 'Explicit batch retained');
  assert(cartWithP2.line_items[1].line_subtotal === 7500, 'Line 2 subtotal is 3 * 2500 = 7500');
  assert(cartWithP2.line_items[1].line_total === 7200, 'Line 2 total is 7500 - 500 + 200 = 7200');
  assert(cartWithP2.subtotal === 9500, 'Cart subtotal is 2000 + 7500 = 9500');
  assert(cartWithP2.total === 9200, 'Cart total is 2000 + 7200 = 9200');

  // Adding same product & batch merges into existing line
  const mergedCart = await addItemToCart(cartWithP2, { product_id: prodA1, quantity: 3 }, indexedDB);
  assert(mergedCart.line_items.length === 2, 'Adding same product and batch did not create duplicate line');
  assert(mergedCart.line_items[0].quantity === 5, 'Merged quantity is 2 + 3 = 5');
  assert(mergedCart.line_items[0].line_total === 5000, 'Merged line total is 5000');

  // --- 3. QUANTITY UPDATES & REMOVALS ---
  console.log('\n[3. Quantity Updates & Removals]');

  const p1LineId = mergedCart.line_items[0].id;
  const updatedQtyCart = updateCartItemQuantity(mergedCart, p1LineId, 10);
  assert(updatedQtyCart.line_items[0].quantity === 10, 'Updated quantity to 10');
  assert(updatedQtyCart.line_items[0].line_total === 10000, 'Updated line total is 10000');

  // Remove Line
  const removedCart = removeCartItem(updatedQtyCart, p1LineId);
  assert(removedCart.line_items.length === 1, 'Removed line item from cart');
  assert(removedCart.line_items[0].product_id === prodA2, 'Remaining line item is prodA2');
  assert(removedCart.total === 7200, 'Totals recalculated after removal');

  // Global discounts and taxes
  const discountedCart = setCartDiscountsAndTaxes(removedCart, 200, 100);
  assert(discountedCart.sale_discount === 200, 'Global sale discount set to 200');
  assert(discountedCart.sale_tax === 100, 'Global sale tax set to 100');
  assert(discountedCart.total_discount === 700, 'Total discount is 500 (line) + 200 (sale) = 700');
  assert(discountedCart.total_tax === 300, 'Total tax is 200 (line) + 100 (sale) = 300');
  assert(discountedCart.total === 7100, 'Final total is 7500 - 700 + 300 = 7100');

  // Clear Cart
  const cleared = clearCart(discountedCart);
  assert(cleared.line_items.length === 0, 'Cleared cart has 0 lines');
  assert(cleared.total === 0, 'Cleared cart has 0 total');
  assert(cleared.pharmacy_id === pharmacyA, 'Cleared cart preserves pharmacy_id context');

  // --- 4. VALIDATION & BOUNDARY ENFORCEMENT ---
  console.log('\n[4. Validation & Boundary Enforcement]');

  // Reject zero quantity
  let zeroQtyCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodA1, quantity: 0 }, indexedDB);
  } catch {
    zeroQtyCaught = true;
  }
  assert(zeroQtyCaught === true, 'Adding item with 0 quantity is rejected');

  // Reject negative quantity
  let negQtyCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodA1, quantity: -2 }, indexedDB);
  } catch {
    negQtyCaught = true;
  }
  assert(negQtyCaught === true, 'Adding item with negative quantity is rejected');

  // Reject fractional quantity
  let fracQtyCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodA1, quantity: 1.5 }, indexedDB);
  } catch {
    fracQtyCaught = true;
  }
  assert(fracQtyCaught === true, 'Adding item with fractional quantity is rejected');

  // Reject unknown product
  let unknownProdCaught = false;
  try {
    await addItemToCart(cart, { product_id: '99999999-9999-4999-8999-999999999999' }, indexedDB);
  } catch {
    unknownProdCaught = true;
  }
  assert(unknownProdCaught === true, 'Adding unknown product ID is rejected');

  // Reject inactive product
  let inactiveProdCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodA3Inactive }, indexedDB);
  } catch {
    inactiveProdCaught = true;
  }
  assert(inactiveProdCaught === true, 'Adding inactive product is rejected');

  // Reject expired batch
  let expiredBatchCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodA1, batch_id: batchA3Expired }, indexedDB);
  } catch {
    expiredBatchCaught = true;
  }
  assert(expiredBatchCaught === true, 'Adding expired batch is rejected');

  // --- 5. TENANT ISOLATION TESTS ---
  console.log('\n[5. Tenant Isolation & Cross-Pharmacy Rejection]');

  // Cannot add Pharmacy B product to Pharmacy A cart
  let crossProdCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodB1 }, indexedDB);
  } catch {
    crossProdCaught = true;
  }
  assert(crossProdCaught === true, 'Attempt to add Pharmacy B product to Pharmacy A cart is rejected');

  // Cannot add Pharmacy B batch to Pharmacy A cart
  let crossBatchCaught = false;
  try {
    await addItemToCart(cart, { product_id: prodA1, batch_id: batchB1 }, indexedDB);
  } catch {
    crossBatchCaught = true;
  }
  assert(crossBatchCaught === true, 'Attempt to add Pharmacy B batch to Pharmacy A cart is rejected');

  // --- 6. CATALOG FRESHNESS CHECK ---
  console.log('\n[6. Catalog Freshness]');

  const freshness = await checkCatalogFreshness(pharmacyA, indexedDB);
  assert(freshness.isStale === false, 'Freshly ingested catalog is not stale');
  assert(freshness.productCount === 3, 'Catalog has 3 products');
  assert(freshness.batchCount === 3, 'Catalog has 3 batches');

  // --- 7. OFFLINE SALE FINALIZATION & PIPELINE INTEGRATION ---
  console.log('\n[7. Offline Sale Finalization]');

  // Construct a realistic multi-line cart
  let saleCart = await loadOrCreateDurableCart(contextA, indexedDB);
  saleCart = await addItemToCart(saleCart, { product_id: prodA1, quantity: 2 }, indexedDB); // 2 * 1000 = 2000
  saleCart = await addItemToCart(saleCart, { product_id: prodA2, quantity: 4, discount: 400, tax: 100 }, indexedDB); // 4 * 2500 = 10000 - 400 + 100 = 9700
  saleCart = setCartDiscountsAndTaxes(saleCart, 500, 200);

  // Reject finalization on empty cart
  const emptyCartRes = await finalizePosSale(clearCart(saleCart), { payment_method: 'CASH' }, indexedDB);
  assert(emptyCartRes.success === false, 'Finalizing empty cart is rejected');
  assert(Boolean(emptyCartRes.errors?.[0]?.includes('Cart is empty')), 'Reports empty cart error');

  // Finalize multi-line sale
  const finalizeRes = await finalizePosSale(
    saleCart,
    { payment_method: 'CARD' },
    indexedDB
  );

  assert(finalizeRes.success === true, 'finalizePosSale succeeded');
  assert(finalizeRes.sale !== undefined, 'Returned created Sale domain entity');
  assert(finalizeRes.transaction !== undefined, 'Returned created LocalTransaction');
  assert(finalizeRes.queueItem !== undefined, 'Returned created SyncQueueItem');
  assert(finalizeRes.sale?.line_items.length === 2, 'Sale entity contains exactly 2 line items');
  assert(finalizeRes.sale?.subtotal === 12000, 'Sale subtotal is 2000 + 10000 = 12000');
  assert(finalizeRes.sale?.payment_method === 'CARD', 'Payment method is CARD');
  assert(finalizeRes.transaction?.status === 'PENDING', 'Transaction status is PENDING');
  assert(finalizeRes.queueItem?.status === 'PENDING', 'Queue item status is PENDING');
  assert(finalizeRes.transaction?.payload_hash.length === 64, 'Transaction has valid 64-character SHA-256 payload hash');

  // Confirm sale is durably stored in IndexedDB and readable via Phase 5D-3
  const persistedSale = await getLocalSale(pharmacyA, finalizeRes.sale!.client_op_id, indexedDB);
  assert(persistedSale !== null, 'Sale verified in local IndexedDB storage');
  assert(persistedSale?.id === finalizeRes.sale?.id, 'Persisted sale ID matches');
  assert(persistedSale?.total === finalizeRes.sale?.total, 'Persisted sale total matches');

  // --- 8. IDEMPOTENCY PRESERVATION ---
  console.log('\n[8. Idempotency Preservation]');

  const customOpId = '77777777-7777-4777-8777-777777777777';
  const customIdRes = await finalizePosSale(
    saleCart,
    { payment_method: 'CASH', client_op_id: customOpId },
    indexedDB
  );
  assert(customIdRes.success === false, 'Caller cannot replace the checkout-reserved client_op_id');
  assert(finalizeRes.sale?.client_op_id === saleCart.client_op_id, 'Sale preserves the checkout-reserved client_op_id');
  assert(finalizeRes.transaction?.client_op_id === saleCart.client_op_id, 'Transaction preserves the checkout-reserved client_op_id');

  // Duplicate client_op_id in same pharmacy is rejected by idempotency guard
  const duplicateRes = await finalizePosSale(
    saleCart,
    { payment_method: 'CASH', client_op_id: customOpId },
    indexedDB
  );
  assert(duplicateRes.success === false, 'Duplicate client_op_id is rejected by idempotency guard');

  // --- 9. STRICT CASHIER IDENTITY VERIFICATION (USER A VS USER B) ---
  console.log('\n[9. Strict Cashier Identity Verification (User A vs User B)]');

  const userB = '66666666-6666-4666-8666-666666666666';

  // Positive Case: Authenticated user A creates a sale with cashier_id = user A
  const posCashierRes = await finalizePosSale(
    saleCart,
    { payment_method: 'CASH', authenticated_user_id: cashierA },
    indexedDB
  );
  assert(posCashierRes.success === true, 'Positive: Authenticated user A creating sale with cashier_id = user A is accepted');

  // Negative Case: Authenticated user A attempts to create a sale with cashier_id = user B
  const spoofedCart = { ...saleCart, cashier_id: userB };
  const negCashierRes = await finalizePosSale(
    spoofedCart,
    { payment_method: 'CASH', authenticated_user_id: cashierA },
    indexedDB
  );
  assert(negCashierRes.success === false, 'Negative: Authenticated user A attempting to create sale with cashier_id = user B is rejected');
  assert(Boolean(negCashierRes.errors?.[0]?.includes('Cashier identity mismatch')), 'Reports cashier identity mismatch error');

  // createCart context validation: user A with cashier_id = user A passes
  const validContextCart = createCart({
    pharmacy_id: pharmacyA,
    branch_id: branchA,
    cashier_id: cashierA,
    authenticated_user_id: cashierA
  });
  assert(validContextCart.cashier_id === cashierA, 'createCart with matching authenticated_user_id accepted');

  // createCart context validation: user A with cashier_id = user B throws
  let contextMismatchCaught = false;
  try {
    createCart({
      pharmacy_id: pharmacyA,
      branch_id: branchA,
      cashier_id: userB,
      authenticated_user_id: cashierA
    });
  } catch {
    contextMismatchCaught = true;
  }
  assert(contextMismatchCaught === true, 'createCart with mismatched cashier_id throws error');

  // createCartFromSession creates a cart directly bound to authenticated session user.id
  const sessionCart = createCartFromSession({
    user: { id: cashierA },
    pharmacy: { id: pharmacyA },
    branch: { id: branchA }
  });
  assert(sessionCart.cashier_id === cashierA, 'createCartFromSession sets cashier_id = session.user.id');
  assert(sessionCart.pharmacy_id === pharmacyA, 'createCartFromSession sets pharmacy_id = session.pharmacy.id');

  // --- 10. SECURITY & NON-LEAKAGE INVARIANTS ---
  console.log('\n[10. Security Invariants Verification]');

  const serializedCart = JSON.stringify(saleCart);
  assert(!serializedCart.includes('privateKey'), 'No privateKey in cart');
  assert(!serializedCart.includes('access_token'), 'No access_token in cart');
  assert(!serializedCart.includes('service_role'), 'No service_role in cart');

  closeOfflineDb();

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-5 POS ORCHESTRATION TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runPosTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
