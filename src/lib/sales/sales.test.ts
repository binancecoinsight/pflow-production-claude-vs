import { indexedDB } from 'fake-indexeddb';
import {
  calculateSaleTotals,
  validateSaleInput,
  createLocalSale,
  getLocalSale,
  getSalesByPharmacy,
  CreateSaleInput,
  SaleLineItemInput
} from './index';
import { openOfflineDb, closeOfflineDb, getQueueItem, SyncDispatcher } from '../offline/index';
import { createDeviceIdentity } from '../crypto/deviceIdentity';
import { canonicalizeJson, sha256Hex } from '../crypto/signing';
import { executeGatewayPipeline } from '../../../supabase/functions/sync-push-sale/index';

async function runSalesTestSuite() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-3 SALES DOMAIN LAYER TESTS ---');

  // Initialize DB
  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA = '33333333-3333-4333-8333-333333333333';
  const cashierA = '44444444-4444-4444-8444-444444444444';
  const customerA = '55555555-5555-4555-8555-555555555555';
  const productA = '66666666-6666-4666-8666-666666666666';
  const batchA = '77777777-7777-4777-8777-777777777777';

  const validLineItem: SaleLineItemInput = {
    product_id: productA,
    batch_id: batchA,
    quantity: 2,
    unit_price: 1500, // 1500 minor units (e.g. 15.00 NGN)
    discount: 100,
    tax: 50
  };

  const baseSaleInput: CreateSaleInput = {
    compatibility_non_draft: true,
    checkout_intent_id: '88888888-8888-4888-8888-888888888888',
    pharmacy_id: pharmacyA,
    branch_id: branchA,
    cashier_id: cashierA,
    customer_id: customerA,
    currency: 'NGN',
    payment_method: 'CASH',
    line_items: [validLineItem],
    sale_discount: 50,
    sale_tax: 25
  };

  // --- 1. VALIDATION TESTS ---
  console.log('\n[1. Sales Validation Invariants]');

  // Empty line items rejected
  const emptyLinesRes = validateSaleInput({ ...baseSaleInput, line_items: [] });
  assert(!emptyLinesRes.isValid, 'Empty line items array rejected');
  assert(emptyLinesRes.errors.some((e) => e.code === 'EMPTY_LINE_ITEMS'), 'Reports EMPTY_LINE_ITEMS code');

  // Missing / invalid pharmacy_id
  const missingPharmRes = validateSaleInput({ ...baseSaleInput, pharmacy_id: 'invalid-id' });
  assert(!missingPharmRes.isValid, 'Malformed pharmacy_id rejected');
  assert(missingPharmRes.errors.some((e) => e.code === 'INVALID_PHARMACY_ID'), 'Reports INVALID_PHARMACY_ID code');

  // Missing / invalid branch_id
  const missingBranchRes = validateSaleInput({ ...baseSaleInput, branch_id: '' });
  assert(!missingBranchRes.isValid, 'Missing branch_id rejected');
  assert(missingBranchRes.errors.some((e) => e.code === 'INVALID_BRANCH_ID'), 'Reports INVALID_BRANCH_ID code');

  // Missing / invalid cashier_id (must reference auth.users UUID)
  const missingCashierRes = validateSaleInput({ ...baseSaleInput, cashier_id: 'cashier-john' });
  assert(!missingCashierRes.isValid, 'Non-UUID cashier_id rejected');
  assert(missingCashierRes.errors.some((e) => e.code === 'INVALID_CASHIER_ID'), 'Reports INVALID_CASHIER_ID code');

  // Zero quantity rejected
  const zeroQtyRes = validateSaleInput({
    ...baseSaleInput,
    line_items: [{ ...validLineItem, quantity: 0 }]
  });
  assert(!zeroQtyRes.isValid, 'Zero quantity rejected');
  assert(zeroQtyRes.errors.some((e) => e.code === 'INVALID_QUANTITY'), 'Reports INVALID_QUANTITY code');

  // Negative quantity rejected
  const negQtyRes = validateSaleInput({
    ...baseSaleInput,
    line_items: [{ ...validLineItem, quantity: -5 }]
  });
  assert(!negQtyRes.isValid, 'Negative quantity rejected');

  // Fractional quantity rejected
  const fracQtyRes = validateSaleInput({
    ...baseSaleInput,
    line_items: [{ ...validLineItem, quantity: 1.5 }]
  });
  assert(!fracQtyRes.isValid, 'Fractional quantity rejected');

  // Negative unit_price rejected
  const negPriceRes = validateSaleInput({
    ...baseSaleInput,
    line_items: [{ ...validLineItem, unit_price: -100 }]
  });
  assert(!negPriceRes.isValid, 'Negative unit_price rejected');
  assert(negPriceRes.errors.some((e) => e.code === 'INVALID_UNIT_PRICE'), 'Reports INVALID_UNIT_PRICE code');

  // Discount exceeds subtotal rejected
  const excessDiscRes = validateSaleInput({
    ...baseSaleInput,
    line_items: [{ ...validLineItem, quantity: 1, unit_price: 500, discount: 600 }]
  });
  assert(!excessDiscRes.isValid, 'Line discount exceeding subtotal rejected');
  assert(excessDiscRes.errors.some((e) => e.code === 'DISCOUNT_EXCEEDS_SUBTOTAL'), 'Reports DISCOUNT_EXCEEDS_SUBTOTAL code');

  // Invalid payment method rejected
  const badPaymentRes = validateSaleInput({
    ...baseSaleInput,
    payment_method: 'BITCOIN' as any
  });
  assert(!badPaymentRes.isValid, 'Invalid payment method string rejected');
  assert(badPaymentRes.errors.some((e) => e.code === 'INVALID_PAYMENT_METHOD'), 'Reports INVALID_PAYMENT_METHOD code');

  // Valid sale passes validation
  const validRes = validateSaleInput(baseSaleInput);
  assert(validRes.isValid && validRes.errors.length === 0, 'Clean valid sale passes validation with 0 errors');

  const invalidCheckoutSale = await createLocalSale({
    ...baseSaleInput,
    checkout_intent_id: 'not-a-uuid'
  }, indexedDB);
  assert(
    invalidCheckoutSale.success === false && Boolean(invalidCheckoutSale.errors?.some((error) => error.code === 'INVALID_CHECKOUT_INTENT_ID')),
    'Invalid checkout_intent_id is rejected before local persistence'
  );

  // --- 2. CALCULATIONS TESTS ---
  console.log('\n[2. Deterministic Money Calculations]');

  // Single line item calculation
  // qty: 3, price: 1000 => subtotal: 3000, discount: 200, tax: 150 => line_total: 2950
  const totals1 = calculateSaleTotals([
    { product_id: productA, batch_id: batchA, quantity: 3, unit_price: 1000, discount: 200, tax: 150 }
  ]);
  assert(totals1.subtotal === 3000, 'Single line subtotal is quantity * price (3000)');
  assert(totals1.totalDiscount === 200, 'Discount correctly totaled (200)');
  assert(totals1.totalTax === 150, 'Tax correctly totaled (150)');
  assert(totals1.total === 2950, 'Total is subtotal - discount + tax (2950)');
  assert(totals1.lineTotals[0] === 2950, 'Line total matches expected (2950)');

  // Multiple line items with sale-level discount and tax
  // Line 1: qty: 2, price: 500, discount: 50, tax: 20 => sub: 1000, disc: 50, tax: 20, lineTot: 970
  // Line 2: qty: 4, price: 250, discount: 0, tax: 10  => sub: 1000, disc: 0,  tax: 10, lineTot: 1010
  // Sale discount: 100, Sale tax: 50
  // Subtotal = 2000
  // Total discounts = 50 + 100 = 150
  // Total taxes = 30 + 50 = 80
  // Total = 2000 - 150 + 80 = 1930
  const multiTotals = calculateSaleTotals(
    [
      { product_id: productA, batch_id: batchA, quantity: 2, unit_price: 500, discount: 50, tax: 20 },
      { product_id: productA, batch_id: batchA, quantity: 4, unit_price: 250, discount: 0, tax: 10 }
    ],
    100,
    50
  );
  assert(multiTotals.subtotal === 2000, 'Multi-line subtotal is correct (2000)');
  assert(multiTotals.totalDiscount === 150, 'Total discount aggregates line and sale discounts (150)');
  assert(multiTotals.totalTax === 80, 'Total tax aggregates line and sale taxes (80)');
  assert(multiTotals.total === 1930, 'Final total is exactly 2000 - 150 + 80 = 1930');
  assert(multiTotals.lineTotals[0] === 970 && multiTotals.lineTotals[1] === 1010, 'Individual line totals match');

  // Determinism check: recalculating 100 times yields strictly identical results
  let deterministicMatches = true;
  for (let i = 0; i < 100; i++) {
    const run = calculateSaleTotals(
      [
        { product_id: productA, batch_id: batchA, quantity: 2, unit_price: 500, discount: 50, tax: 20 },
        { product_id: productA, batch_id: batchA, quantity: 4, unit_price: 250, discount: 0, tax: 10 }
      ],
      100,
      50
    );
    if (run.total !== 1930 || run.subtotal !== 2000) deterministicMatches = false;
  }
  assert(deterministicMatches, 'Repeated calculation is strictly deterministic');

  // --- 3. LOCAL SALE CREATION & PERSISTENCE TESTS ---
  console.log('\n[3. Local Sale Creation & Atomic IndexedDB Persistence]');

  const createRes = await createLocalSale(baseSaleInput, indexedDB);
  assert(createRes.success === true, 'createLocalSale succeeded');
  const frozenCreatedAt = 1700000000123;
  const frozenTimeSale = await createLocalSale({ ...baseSaleInput, client_op_id: crypto.randomUUID(),
    sale_id: crypto.randomUUID(), checkout_intent_id: crypto.randomUUID(), client_created_at: frozenCreatedAt }, indexedDB);
  const frozenTimeRead = await getLocalSale(pharmacyA, frozenTimeSale.sale!.client_op_id, indexedDB);
  assert(frozenTimeRead?.created_at === frozenCreatedAt,
    'local sale reader preserves the frozen sale creation time instead of transaction persistence time');
  assert(Boolean(createRes.sale?.id), 'Sale received unique primary ID');
  assert(Boolean(createRes.sale?.client_op_id), 'Sale received client_op_id');
  assert(createRes.transaction?.status === 'PENDING', 'Persisted transaction is initially PENDING');
  assert(createRes.queueItem?.status === 'PENDING', 'Persisted queue item is initially PENDING');
  assert(
    createRes.transaction?.client_op_id === createRes.queueItem?.client_op_id,
    'Transaction and queue item share exact same client_op_id'
  );
  assert(
    createRes.transaction?.payload_hash.length === 64,
    'Transaction contains valid 64-character SHA-256 payload hash'
  );

  // Read back sale
  const retrievedSale = await getLocalSale(pharmacyA, createRes.sale!.client_op_id, indexedDB);
  assert(retrievedSale !== null, 'Successfully read sale back from IndexedDB');
  assert(retrievedSale?.id === createRes.sale?.id, 'Retrieved sale has matching ID');
  assert(retrievedSale?.total === createRes.sale?.total, 'Retrieved sale has matching total');
  assert(retrievedSale?.line_items.length === 1, 'Retrieved sale has matching line items length');

  // --- 4. IDENTITY & CANONICAL HASH INTEGRITY ---
  console.log('\n[4. Identity & Canonical Payload Hash Integrity]');

  // client_op_id immutability when provided
  const fixedOpId = crypto.randomUUID().toLowerCase();
  const fixedSaleRes = await createLocalSale({ ...baseSaleInput, client_op_id: fixedOpId }, indexedDB);
  assert(fixedSaleRes.sale?.client_op_id === fixedOpId, 'Explicit client_op_id is preserved');
  assert(fixedSaleRes.transaction?.client_op_id === fixedOpId, 'Transaction client_op_id is preserved');
  assert(fixedSaleRes.queueItem?.client_op_id === fixedOpId, 'Queue item client_op_id is preserved');

  // Payload hash stability
  const originalHash = fixedSaleRes.transaction!.payload_hash;
  const canonicalPayload = canonicalizeJson(fixedSaleRes.transaction!.payload);
  const recomputedHash = await sha256Hex(canonicalPayload);
  assert(originalHash === recomputedHash, 'Stored payload_hash matches sha256Hex(canonicalizeJson(payload))');

  // Divergent hashes when fields change
  const altQtyPayload = { ...fixedSaleRes.transaction!.payload, quantity: 99 };
  const altQtyHash = await sha256Hex(canonicalizeJson(altQtyPayload));
  assert(altQtyHash !== originalHash, 'Modifying quantity produces divergent payload hash');

  const altPricePayload = { ...fixedSaleRes.transaction!.payload, subtotal: 999999 };
  const altPriceHash = await sha256Hex(canonicalizeJson(altPricePayload));
  assert(altPriceHash !== originalHash, 'Modifying price produces divergent payload hash');

  const altPharmPayload = { ...fixedSaleRes.transaction!.payload, pharmacy_id: pharmacyB };
  const altPharmHash = await sha256Hex(canonicalizeJson(altPharmPayload));
  assert(altPharmHash !== originalHash, 'Modifying pharmacy_id produces divergent payload hash');

  // --- 5. PHARMACY ISOLATION TESTS ---
  console.log('\n[5. Multi-Tenant Pharmacy Partitioning]');

  // Querying Pharmacy B for Pharmacy A sale returns null
  const crossTenantSale = await getLocalSale(pharmacyB, createRes.sale!.client_op_id, indexedDB);
  assert(crossTenantSale === null, 'Querying Pharmacy B for Pharmacy A sale returns null');

  // Querying Pharmacy B queue item returns null
  const crossTenantQueue = await getQueueItem(pharmacyB, createRes.sale!.client_op_id, indexedDB);
  assert(crossTenantQueue === null, 'Querying Pharmacy B for Pharmacy A queue item returns null');

  // Create a distinct sale for Pharmacy B
  const saleBRes = await createLocalSale(
    {
      ...baseSaleInput,
      pharmacy_id: pharmacyB,
      branch_id: crypto.randomUUID().toLowerCase()
    },
    indexedDB
  );
  assert(saleBRes.success === true, 'Created sale under Pharmacy B');

  const salesA = await getSalesByPharmacy(pharmacyA, indexedDB);
  const salesB = await getSalesByPharmacy(pharmacyB, indexedDB);
  assert(salesA.every((s) => s.pharmacy_id === pharmacyA), 'All sales under Pharmacy A belong strictly to Pharmacy A');
  assert(salesB.every((s) => s.pharmacy_id === pharmacyB), 'All sales under Pharmacy B belong strictly to Pharmacy B');
  assert(!salesA.some((s) => s.id === saleBRes.sale?.id), 'Pharmacy B sale does NOT appear in Pharmacy A list');

  // --- 6. SIMULATED APPLICATION RESTART ---
  console.log('\n[6. Durability Across Simulated Application Restart]');

  closeOfflineDb();
  // Re-open DB
  const reopenedDb = await openOfflineDb(indexedDB);
  assert(reopenedDb !== null, 'Reopened IndexedDB successfully');

  const postRestartSale = await getLocalSale(pharmacyA, createRes.sale!.client_op_id, indexedDB);
  assert(postRestartSale !== null, 'Sale persisted and recovered after database close/reopen');
  assert(postRestartSale?.total === createRes.sale?.total, 'Persisted totals intact after restart');

  const postRestartQueue = await getQueueItem(pharmacyA, createRes.sale!.client_op_id, indexedDB);
  assert(postRestartQueue !== null, 'Queue item persisted and recovered after restart');
  assert(postRestartQueue?.status === 'PENDING', 'Queue item status remains PENDING');

  // --- 7. OFFLINE OPERATION & DISPATCHER INTEGRATION ---
  console.log('\n[7. Dispatcher Integration & Offline Sync]');

  const deviceIdentity = await createDeviceIdentity();
  const syncState = { received: false, saleId: '' };

  const mockSyncDispatcher = new SyncDispatcher(
    {
      fetchFn: async (_url, init) => {
        syncState.received = true;
        const parsed = JSON.parse(init?.body as string);
        syncState.saleId = parsed.sale_id;
        return new Response(
          JSON.stringify({
            success: true,
            operation_status: 'COMMITTED',
            client_op_id: createRes.sale!.client_op_id,
            sale_id: createRes.sale!.id,
            checkout_intent_id: createRes.sale!.checkout_intent_id,
            new_stock: 50,
            deficit_created: false,
            processed_at: new Date().toISOString()
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    },
    indexedDB
  );

  const dispatchResult = await mockSyncDispatcher.dispatchOne(
    createRes.queueItem!,
    deviceIdentity,
    'mock-session-jwt'
  );

  assert(dispatchResult.status === 'COMMITTED', 'Dispatcher successfully synchronized local sale to COMMITTED');
  assert(syncState.received === true, 'HTTP sync request was received');
  assert(syncState.saleId === createRes.sale?.id, 'Dispatched HTTP payload matched the local sale_id');

  // --- 8. SECURITY & NON-LEAKAGE INVARIANTS ---
  console.log('\n[8. Security Invariants Verification]');

  const serializedSale = JSON.stringify(retrievedSale);
  assert(!serializedSale.includes('privateKey'), 'No privateKey in sale domain entity');
  assert(!serializedSale.includes('CryptoKey'), 'No raw CryptoKey in sale entity');
  assert(!serializedSale.includes('service_role'), 'No service_role reference in sale entity');
  assert(!serializedSale.includes('access_token'), 'No access_token in sale entity');

  // --- 9. MULTI-LINE SALE CONTRACT VERIFICATION (CHECK 3 & CHECK 5) ---
  console.log('\n[9. Multi-Line Sale Contract Verification (Checks 3, 4, 5)]');

  const multiProdA = 'aaaaaaaa-1111-4aaa-8aaa-aaaaaaaaaaaa';
  const multiBatchA = 'bbbbbbbb-1111-4bbb-8bbb-bbbbbbbbbbbb';
  const multiProdB = 'aaaaaaaa-2222-4aaa-8aaa-aaaaaaaaaaaa';
  const multiBatchB = 'bbbbbbbb-2222-4bbb-8bbb-bbbbbbbbbbbb';

  const multiLineSaleInput: CreateSaleInput = {
    compatibility_non_draft: true,
    pharmacy_id: pharmacyA,
    branch_id: branchA,
    cashier_id: cashierA,
    customer_id: null,
    currency: 'NGN',
    payment_method: 'CARD',
    line_items: [
      { product_id: multiProdA, batch_id: multiBatchA, quantity: 3, unit_price: 1000, discount: 50, tax: 20 },
      { product_id: multiProdB, batch_id: multiBatchB, quantity: 5, unit_price: 2000, discount: 100, tax: 50 }
    ],
    sale_discount: 100,
    sale_tax: 30
  };

  const multiSaleRes = await createLocalSale(multiLineSaleInput, indexedDB);
  assert(multiSaleRes.success === true, 'Created multi-line local sale with 2 items');
  assert(multiSaleRes.sale?.line_items.length === 2, 'Sale domain entity retains exactly 2 line items');

  // Verify both line items survive serialization
  const storedMultiSale = await getLocalSale(pharmacyA, multiSaleRes.sale!.client_op_id, indexedDB);
  assert(storedMultiSale !== null, 'Retrieved multi-line sale from IndexedDB');
  assert(storedMultiSale?.line_items.length === 2, 'Both line items survived local transaction serialization');
  assert(storedMultiSale?.line_items[0].product_id === multiProdA, 'Line 1 product_id preserved');
  assert(storedMultiSale?.line_items[0].quantity === 3, 'Line 1 quantity preserved');
  assert(storedMultiSale?.line_items[1].product_id === multiProdB, 'Line 2 product_id preserved');
  assert(storedMultiSale?.line_items[1].quantity === 5, 'Line 2 quantity preserved');

  // Verify both line items are included in the stored payload hash
  const storedTx = multiSaleRes.transaction!;
  const storedCanonical = canonicalizeJson(storedTx.payload);
  const storedHash = await sha256Hex(storedCanonical);
  assert(storedTx.payload_hash === storedHash, 'Stored payload_hash matches sha256Hex(canonicalizeJson(payload))');

  // Modifying Line 2 in the payload invalidates the hash
  const tamperedLine2Payload = JSON.parse(JSON.stringify(storedTx.payload));
  tamperedLine2Payload.line_items[1].quantity = 999;
  const tamperedLine2Hash = await sha256Hex(canonicalizeJson(tamperedLine2Payload));
  assert(tamperedLine2Hash !== storedHash, 'Modifying Line 2 quantity alters canonical payload hash');

  // End-to-end gateway execution: dispatch through SyncDispatcher into the unified commit path.
  const gatewayState = { processed: false, committedParams: null as any };

  const realGatewayDispatcher = new SyncDispatcher(
    {
      fetchFn: async (url, init) => {
        const urlStr = typeof url === 'string' ? url : url.toString();
        const fullUrl = urlStr.startsWith('http') ? urlStr : `https://example.supabase.co${urlStr}`;
        const req = new Request(fullUrl, {
          method: init?.method,
          headers: init?.headers,
          body: init?.body
        });

        // Pass directly to the authenticated unified sale gateway pipeline.
        const gatewayResponse = await executeGatewayPipeline(req, {
          getUser: async () => ({ user: { id: cashierA } as any, error: null }),
          getPharmacyMember: async () => ({ status: 'ACTIVE' } as any),
          getDevice: async () => ({
            status: 'ACTIVE',
            pharmacy_id: pharmacyA,
            branch_id: branchA,
            public_key_pem: deviceIdentity.publicKeyPem
          } as any),
          consumeNonce: async () => {
            throw new Error('Legacy nonce consumption must not be used for unified sales');
          },
          ingestStock: async (params) => {
            throw new Error(`Legacy stock ingest must not be used for unified sales: ${params.client_op_id}`);
          },
          commitSale: async (params) => {
            gatewayState.processed = true;
            gatewayState.committedParams = params;
            const processedAt = new Date().toISOString();
            return {
              operation_status: 'COMMITTED',
              sale_id: String(params.sale.id),
              processed_at: processedAt,
              response_payload: {
                operation_status: 'COMMITTED', client_op_id: params.client_op_id,
                sale_id: params.sale.id, checkout_intent_id: params.checkout_intent_id, processed_at: processedAt
              }
            };
          }
        });

        return gatewayResponse;
      }
    },
    indexedDB
  );

  const realGatewayResult = await realGatewayDispatcher.dispatchOne(
    multiSaleRes.queueItem!,
    deviceIdentity,
    'mock-session-jwt'
  );

  assert(realGatewayResult.status === 'COMMITTED', 'Unified executeGatewayPipeline returned HTTP 200 COMMITTED for multi-line sale');
  assert(gatewayState.processed === true, 'Unified pipeline verified signature and invoked the atomic commit contract');
  assert(gatewayState.committedParams.sale.id === multiSaleRes.sale?.id, 'Unified commit received exact sale_id');
  assert(gatewayState.committedParams.payload_hash === multiSaleRes.transaction?.payload_hash, 'Unified commit received exact payload_hash covering all line items');
  assert(gatewayState.committedParams.items.length === 2, 'Unified commit received every sale line item');

  closeOfflineDb();

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-3 SALES DOMAIN TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runSalesTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
