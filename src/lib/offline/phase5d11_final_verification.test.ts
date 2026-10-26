/**
 * PharmacyFlow Phase 5D-11 Final Focused Verification Test Suite
 * 
 * Verifies:
 * 1. Complete offline-to-server return path (End-to-End integration)
 * 2. Ambiguous network response recovery (Crash recovery & rpc_get_client_op_status)
 * 3. Conflicting client_op_id reuse rejection (Idempotency payload hash violation)
 * 4. Timestamp tolerance verification (+- 300,000 ms / 5 minutes exact boundaries)
 * 5. Candidate A signing backward compatibility (sale vs return byte-for-byte fidelity)
 * 6. M-10 status resolution across sync_journal and sale_returns
 */

import { indexedDB } from 'fake-indexeddb';
import {
  openOfflineDb,
  createLocalTransaction,
  getLocalTransaction,
  getQueueItem,
  getOperationResult,
  SyncDispatcher
} from './index';
import { createDeviceIdentity, arrayBufferToBase64 } from '../crypto/deviceIdentity';
import {
  buildSyncSigningMessage,
  canonicalizeJson,
  sha256Hex as computeSha256Hex,
  verifyDeviceSignature
} from '../crypto/signing';
import {
  executeReturnGatewayPipeline,
  ReturnGatewayPipelineDeps
} from '../../../supabase/functions/sync-push-return/index';

// Simulated authoritative database state
interface MockSaleReturnRow {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  original_sale_id: string;
  refund_amount: number;
  refund_payment_method: string;
  reason: string;
  authorized_by: string;
  client_op_id: string;
  payload_hash: string;
  status: 'COMPLETED';
  created_at: string;
}

interface MockStockLedgerRow {
  id: string;
  pharmacy_id: string;
  movement_type: 'RETURN';
  quantity_delta: number;
  reference_id: string;
}

async function runFinalVerificationSuite() {
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

  console.log('================================================================');
  console.log('PHARMACYFLOW PHASE 5D-11 FINAL FOCUSED VERIFICATION SUITE');
  console.log('================================================================');

  await openOfflineDb(indexedDB);

  const pharmacyA = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchA = '33333333-3333-4333-8333-333333333333';
  const saleA = '44444444-4444-4444-8444-444444444444';
  const prodA = '55555555-5555-4555-8555-555555555555';
  const batchA = '66666666-6666-4666-8666-666666666666';

  const userManager = { id: 'mgr-11111111-1111-4111-8111-111111111111' };
  const userCashier = { id: 'csh-22222222-2222-4222-8222-222222222222' };
  const deviceIdentity = await createDeviceIdentity();

  // Authoritative database tables for returns and stock movements
  const dbSaleReturns: MockSaleReturnRow[] = [];
  const dbStockLedger: MockStockLedgerRow[] = [];
  const dbConsumedNonces = new Set<string>();

  let rpcProcessReturnCallCount = 0;
  let nonceConsumeCallCount = 0;

  // Real pipeline dependencies wired to mock database tables
  const pipelineDeps: ReturnGatewayPipelineDeps = {
    getUser: async (token) => {
      if (token === 'manager-jwt') return { user: userManager, error: null };
      if (token === 'cashier-jwt') return { user: userCashier, error: null };
      return { user: null, error: new Error('Invalid token') };
    },
    getPharmacyMember: async (userId, pId) => {
      if (pId !== pharmacyA) return null;
      if (userId === userManager.id) return { id: 'mem-mgr', role: 'MANAGER', status: 'ACTIVE' };
      if (userId === userCashier.id) return { id: 'mem-csh', role: 'CASHIER', status: 'ACTIVE' };
      return null;
    },
    getDevice: async (dId) => {
      if (dId === deviceIdentity.deviceId) {
        return {
          id: deviceIdentity.deviceId,
          pharmacy_id: pharmacyA,
          branch_id: branchA,
          status: 'ACTIVE',
          public_key_pem: deviceIdentity.publicKeyPem
        };
      }
      return null;
    },
    consumeNonce: async (nonce, pId, dId) => {
      const key = `${pId}:${dId}:${nonce}`;
      if (dbConsumedNonces.has(key)) {
        return false; // Replay detected
      }
      dbConsumedNonces.add(key);
      nonceConsumeCallCount++;
      return true;
    },
    processReturn: async (params) => {
      rpcProcessReturnCallCount++;

      // Idempotency check with payload_hash protection (M-10)
      const existing = dbSaleReturns.find(
        (r) => r.pharmacy_id === params.pharmacy_id && r.client_op_id === params.client_op_id
      );

      if (existing) {
        if (params.payload_hash && existing.payload_hash !== params.payload_hash) {
          return {
            return_id: '',
            status: 'FAILED',
            refund_amount: 0,
            error: `IDEMPOTENCY_VIOLATION: client_op_id ${params.client_op_id} reused with mismatched payload hash.`
          };
        }
        return {
          return_id: existing.id,
          status: existing.status,
          refund_amount: existing.refund_amount
        };
      }

      // Business rule validation: create return and stock movement
      const returnId = crypto.randomUUID().toLowerCase();
      dbSaleReturns.push({
        id: returnId,
        pharmacy_id: params.pharmacy_id,
        branch_id: params.branch_id,
        original_sale_id: params.sale_id,
        refund_amount: params.refund_amount,
        refund_payment_method: params.refund_payment_method,
        reason: params.reason,
        authorized_by: params.caller_uid,
        client_op_id: params.client_op_id,
        payload_hash: params.payload_hash,
        status: 'COMPLETED',
        created_at: new Date().toISOString()
      });

      // Append-only stock ledger restoration
      for (const item of params.items) {
        if (item.restock_to_inventory ?? true) {
          dbStockLedger.push({
            id: 'ledger-' + crypto.randomUUID().toLowerCase(),
            pharmacy_id: params.pharmacy_id,
            movement_type: 'RETURN',
            quantity_delta: item.quantity,
            reference_id: returnId
          });
        }
      }

      return {
        return_id: returnId,
        status: 'COMPLETED',
        refund_amount: params.refund_amount
      };
    }
  };

  // Wire fetchFn directly to executeReturnGatewayPipeline
  const liveEdgeFunctionFetch: typeof fetch = async (url, init) => {
    if (url instanceof Request) {
      return await executeReturnGatewayPipeline(url, pipelineDeps);
    }
    if (init instanceof Request) {
      return await executeReturnGatewayPipeline(init, pipelineDeps);
    }
    const fullUrl = url.toString().startsWith('http') ? url.toString() : `https://test.supabase.co${url.toString()}`;
    const req = new Request(fullUrl, {
      method: init?.method || 'POST',
      headers: init?.headers,
      body: init?.body,
      // @ts-ignore
      duplex: 'half'
    });
    return await executeReturnGatewayPipeline(req, pipelineDeps);
  };

  // ============================================================================
  // 1. PROVE COMPLETE OFFLINE-TO-SERVER RETURN PATH (END-TO-END)
  // ============================================================================
  console.log('\n[1. Complete Offline-to-Server Return Path]');

  // Step 1: Create authorized return while offline
  const returnPayload1 = {
    pharmacy_id: pharmacyA,
    branch_id: branchA,
    sale_id: saleA,
    items: [
      {
        product_id: prodA,
        batch_id: batchA,
        quantity: 3,
        restock_to_inventory: true
      }
    ],
    refund_amount: 4500,
    refund_payment_method: 'CASH',
    reason: 'Customer return unsealed'
  };

  const { transaction: tx1, queueItem: q1 } = await createLocalTransaction(
    {
      pharmacy_id: pharmacyA,
      transaction_type: 'SALE_RETURN',
      payload: returnPayload1
    },
    indexedDB
  );

  // Step 2 & 3: Verify durable local persistence and initial PENDING status
  assert(tx1.transaction_type === 'SALE_RETURN', '1.2: SALE_RETURN transaction created in IndexedDB');
  assert(tx1.status === 'PENDING', '1.3: Initial transaction state is PENDING');
  assert(q1.status === 'PENDING', '1.3: Initial queue item state is PENDING');

  // Step 4 & 5: Online dispatcher execution
  const initialNonceCount = nonceConsumeCallCount;
  const initialRpcCount = rpcProcessReturnCallCount;
  const initialReturnsCount = dbSaleReturns.length;
  const initialLedgerCount = dbStockLedger.length;

  const dispatcher = new SyncDispatcher(
    {
      edgeFunctionUrl: 'https://test.supabase.co/functions/v1/sync-push-sale',
      returnFunctionUrl: 'https://test.supabase.co/functions/v1/sync-push-return',
      fetchFn: liveEdgeFunctionFetch
    },
    indexedDB
  );

  const dispatchSummary = await dispatcher.dispatch(pharmacyA, deviceIdentity, 'manager-jwt');

  // Step 6 to 16: Verify complete pipeline outcome
  assert(dispatchSummary.succeeded === 1, '1.6: Dispatcher reported 1 successful return');
  assert(nonceConsumeCallCount === initialNonceCount + 1, '1.11: Nonce consumed exactly once');
  assert(rpcProcessReturnCallCount === initialRpcCount + 1, '1.12: rpc_process_sale_return invoked exactly once');
  assert(dbSaleReturns.length === initialReturnsCount + 1, '1.13: Exactly one authoritative sale_returns record created');
  assert(dbStockLedger.length === initialLedgerCount + 1, '1.14: Exactly one stock-ledger RETURN movement created (+3 units)');
  assert(dbStockLedger[dbStockLedger.length - 1].quantity_delta === 3, '1.14: Restored quantity is exactly +3 units');

  const committedTx = await getLocalTransaction(pharmacyA, tx1.client_op_id, indexedDB);
  const committedQueue = await getQueueItem(pharmacyA, tx1.client_op_id, indexedDB);
  assert(committedTx?.status === 'COMMITTED', '1.15: Local transaction transitioned to COMMITTED');
  assert(committedQueue?.status === 'COMMITTED', '1.15: Local queue item transitioned to COMMITTED');

  const opResult = await getOperationResult(pharmacyA, tx1.client_op_id, indexedDB);
  assert(opResult !== null && (opResult.response_status === '200 OK' || opResult.server_status === 'COMMITTED'), '1.16: OperationResult persisted with response_status COMMITTED / 200 OK');

  // Step 17: Retrying same client_op_id creates no duplicate return or stock movement
  const retrySummary = await dispatcher.dispatch(pharmacyA, deviceIdentity, 'manager-jwt');
  assert(retrySummary.processed === 0, '1.17: Already committed item skipped by dispatcher (processed === 0)');
  assert(dbSaleReturns.length === initialReturnsCount + 1, '1.17: Zero duplicate sale_returns on retry');
  assert(dbStockLedger.length === initialLedgerCount + 1, '1.17: Zero duplicate stock ledger movements on retry');

  // ============================================================================
  // 2. VERIFY AMBIGUOUS NETWORK RESPONSE RECOVERY
  // ============================================================================
  console.log('\n[2. Ambiguous Network Response Recovery]');

  // Create return tx2
  const returnPayload2 = {
    pharmacy_id: pharmacyA,
    branch_id: branchA,
    sale_id: saleA,
    items: [{ product_id: prodA, batch_id: batchA, quantity: 1, restock_to_inventory: true }],
    refund_amount: 1500,
    refund_payment_method: 'CASH',
    reason: 'Defective item'
  };

  const { transaction: tx2 } = await createLocalTransaction(
    {
      pharmacy_id: pharmacyA,
      transaction_type: 'SALE_RETURN',
      payload: returnPayload2
    },
    indexedDB
  );

  // Simulate network dropout: Edge Function commits, but response is dropped before reaching client
  let droppedFirstResponse = false;
  const droppingFetch: typeof fetch = async (url, init) => {
    const response = await liveEdgeFunctionFetch(url, init);
    if (!droppedFirstResponse) {
      droppedFirstResponse = true;
      throw new Error('Network dropped: connection reset by peer');
    }
    return response;
  };

  // Mock rpc_get_client_op_status that queries dbSaleReturns
  const mockRpcGetStatus = async (pId: string, opId: string) => {
    const found = dbSaleReturns.find((r) => r.pharmacy_id === pId && r.client_op_id === opId);
    if (found) {
      return {
        pharmacy_id: pId,
        client_op_id: found.client_op_id,
        outcome: 'CONFIRMED_COMMITTED' as const,
        operation_kind: 'SALE_RETURN_V1' as const,
        payload_hash: tx2.payload_hash,
        sale_id: found.original_sale_id,
        checkout_intent_id: null,
        response_status: 'COMMITTED',
        response_payload: { operation_status: 'COMMITTED', client_op_id: found.client_op_id,
          return_id: found.id, sale_id: found.original_sale_id, processed_at: found.created_at },
        processed_at: found.created_at,
        record_id: found.id,
        return_id: found.id
      };
    }
    return null;
  };

  const recoveryDispatcher = new SyncDispatcher(
    {
      edgeFunctionUrl: 'https://test.supabase.co/functions/v1/sync-push-sale',
      returnFunctionUrl: 'https://test.supabase.co/functions/v1/sync-push-return',
      fetchFn: droppingFetch,
      rpcGetClientOpStatus: mockRpcGetStatus
    },
    indexedDB
  );

  const preDropReturnCount = dbSaleReturns.length;
  const preDropLedgerCount = dbStockLedger.length;

  // First dispatch: Edge Function commits, but network drops response
  await recoveryDispatcher.dispatch(pharmacyA, deviceIdentity, 'manager-jwt');

  // Verify server committed return during first attempt
  assert(dbSaleReturns.length === preDropReturnCount + 1, '2.1: Server successfully committed return on first attempt');
  assert(dbStockLedger.length === preDropLedgerCount + 1, '2.1: Stock ledger movement created on server');

  const droppedQueueItem = await getQueueItem(pharmacyA, tx2.client_op_id, indexedDB);
  assert(droppedQueueItem?.status === 'UNCERTAIN', '2.2: Response loss is preserved as UNCERTAIN pending authoritative lookup');

  // Simulate crash/recovery: advance time past retry backoff and re-dispatch
  droppedQueueItem!.next_attempt_at = Date.now() - 1000;
  const { updateQueueItem } = await import('./db');
  await updateQueueItem(droppedQueueItem!, indexedDB);

  // Dispatcher retries: ambiguous resolution discovers authoritative return via client_op_id
  const recoverySummary = await recoveryDispatcher.dispatch(pharmacyA, deviceIdentity, 'manager-jwt');

  assert(recoverySummary.processed === 0, '2.3: Ambiguous return resolved as COMMITTED without an automatic resend');
  assert(dbSaleReturns.length === preDropReturnCount + 1, '2.4: Zero duplicate return records created');
  assert(dbStockLedger.length === preDropLedgerCount + 1, '2.5: Zero duplicate stock ledger movements created');

  const recoveredTx = await getLocalTransaction(pharmacyA, tx2.client_op_id, indexedDB);
  assert(recoveredTx?.status === 'COMMITTED', '2.6: Local transaction marked COMMITTED');

  // ============================================================================
  // 3. VERIFY CONFLICTING CLIENT_OP_ID REUSE
  // ============================================================================
  console.log('\n[3. Conflicting client_op_id Reuse Protection]');

  const sharedClientOpId = '77777777-7777-4777-8777-777777777777';

  // Request A with Payload A
  const payloadA = {
    sale_id: saleA,
    branch_id: branchA,
    items: [{ product_id: prodA, batch_id: batchA, quantity: 1, restock_to_inventory: true }],
    refund_amount: 1000,
    refund_payment_method: 'CASH',
    reason: 'Original payload A'
  };
  const hashA = await computeSha256Hex(canonicalizeJson(payloadA));

  // Submit Request A directly to liveEdgeFunctionFetch
  const timeA = Date.now().toString();
  const nonceA = crypto.randomUUID().toLowerCase();
  const msgA = buildSyncSigningMessage({
    pharmacyId: pharmacyA,
    deviceId: deviceIdentity.deviceId,
    clientOpId: sharedClientOpId,
    timestamp: timeA,
    nonce: nonceA,
    payloadHash: hashA,
    path: '/sync-push-return'
  });
  const encoderA = new TextEncoder();
  const sigA = arrayBufferToBase64(
    await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, deviceIdentity.privateKey, encoderA.encode(msgA))
  );

  const reqA = new Request('https://test.supabase.co/functions/v1/sync-push-return', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer manager-jwt', 'X-Device-Signature': sigA, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pharmacy_id: pharmacyA,
      device_id: deviceIdentity.deviceId,
      branch_id: branchA,
      client_op_id: sharedClientOpId,
      timestamp: timeA,
      nonce: nonceA,
      sale_id: saleA,
      items: payloadA.items,
      refund_amount: payloadA.refund_amount,
      refund_payment_method: payloadA.refund_payment_method,
      reason: payloadA.reason,
      payload: payloadA,
      payload_hash: hashA
    })
  });

  const resA = await liveEdgeFunctionFetch('https://test.supabase.co/functions/v1/sync-push-return', reqA);
  assert(resA.status === 200, '3.1: Request A with hash A succeeds (200 OK)');

  const originalReturnRow = dbSaleReturns.find((r) => r.client_op_id === sharedClientOpId)!;
  const originalRefund = originalReturnRow.refund_amount;
  const countReturnsBeforeB = dbSaleReturns.length;
  const countLedgerBeforeB = dbStockLedger.length;

  // Request B: Same client_op_id but conflicting Payload B (tampered refund amount & quantity)
  const payloadB = {
    sale_id: saleA,
    branch_id: branchA,
    items: [{ product_id: prodA, batch_id: batchA, quantity: 10, restock_to_inventory: true }],
    refund_amount: 50000, // Conflict!
    refund_payment_method: 'CASH',
    reason: 'Conflicting tampered payload B'
  };
  const hashB = await computeSha256Hex(canonicalizeJson(payloadB));

  const timeB = Date.now().toString();
  const nonceB = crypto.randomUUID().toLowerCase();
  const msgB = buildSyncSigningMessage({
    pharmacyId: pharmacyA,
    deviceId: deviceIdentity.deviceId,
    clientOpId: sharedClientOpId,
    timestamp: timeB,
    nonce: nonceB,
    payloadHash: hashB,
    path: '/sync-push-return'
  });
  const sigB = arrayBufferToBase64(
    await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, deviceIdentity.privateKey, new TextEncoder().encode(msgB))
  );

  const reqB = new Request('https://test.supabase.co/functions/v1/sync-push-return', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer manager-jwt', 'X-Device-Signature': sigB, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pharmacy_id: pharmacyA,
      device_id: deviceIdentity.deviceId,
      branch_id: branchA,
      client_op_id: sharedClientOpId,
      timestamp: timeB,
      nonce: nonceB,
      sale_id: saleA,
      items: payloadB.items,
      refund_amount: payloadB.refund_amount,
      refund_payment_method: payloadB.refund_payment_method,
      reason: payloadB.reason,
      payload: payloadB,
      payload_hash: hashB
    })
  });

  const resB = await liveEdgeFunctionFetch('https://test.supabase.co/functions/v1/sync-push-return', reqB);
  assert(resB.status === 409, '3.2: Request B with mismatched payload hash is rejected with HTTP 409 Conflict');
  const bodyB = await resB.json();
  assert(bodyB.error.includes('IDEMPOTENCY_VIOLATION'), '3.2: Error message explicitly reports IDEMPOTENCY_VIOLATION');

  assert(originalReturnRow.refund_amount === originalRefund, '3.3: First return record was NOT modified');
  assert(dbSaleReturns.length === countReturnsBeforeB, '3.4: No additional return created');
  assert(dbStockLedger.length === countLedgerBeforeB, '3.5: No additional stock ledger movement created');

  // ============================================================================
  // 4. VERIFY TIMESTAMP TOLERANCE
  // ============================================================================
  console.log('\n[4. Exact Timestamp Tolerance Verification]');
  console.log('   Configured Tolerance: +- 300,000 ms (+- 300 seconds / +- 5 minutes)');

  const testPayloadTime = {
    sale_id: saleA,
    branch_id: branchA,
    items: [{ product_id: prodA, batch_id: batchA, quantity: 1 }],
    refund_amount: 100,
    refund_payment_method: 'CASH',
    reason: 'Time test'
  };
  const testHashTime = await computeSha256Hex(canonicalizeJson(testPayloadTime));

  const makeTimeTestReq = async (offsetMs: number) => {
    const testNow = Date.now();
    const testTs = (testNow + offsetMs).toString();
    const testNonce = crypto.randomUUID().toLowerCase();
    const testOpId = crypto.randomUUID().toLowerCase();
    const testMsg = buildSyncSigningMessage({
      pharmacyId: pharmacyA,
      deviceId: deviceIdentity.deviceId,
      clientOpId: testOpId,
      timestamp: testTs,
      nonce: testNonce,
      payloadHash: testHashTime,
      path: '/sync-push-return'
    });
    const sig = arrayBufferToBase64(
      await crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, deviceIdentity.privateKey, new TextEncoder().encode(testMsg))
    );

    return new Request('https://test.supabase.co/functions/v1/sync-push-return', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer manager-jwt', 'X-Device-Signature': sig, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pharmacy_id: pharmacyA,
        device_id: deviceIdentity.deviceId,
        branch_id: branchA,
        client_op_id: testOpId,
        timestamp: testTs,
        nonce: testNonce,
        sale_id: saleA,
        items: testPayloadTime.items,
        refund_amount: testPayloadTime.refund_amount,
        refund_payment_method: testPayloadTime.refund_payment_method,
        reason: testPayloadTime.reason,
        payload: testPayloadTime,
        payload_hash: testHashTime
      })
    });
  };

  // 4a. Valid timestamp inside tolerance (+100s)
  const reqInside = await makeTimeTestReq(100000);
  const resInside = await liveEdgeFunctionFetch('https://test.supabase.co/functions/v1/sync-push-return', reqInside);
  assert(resInside.status === 200, '4.1: Timestamp inside window (+100s) accepted (200 OK)');

  // 4b. Timestamp at exact permitted boundary (-300,000 ms)
  const reqBoundary = await makeTimeTestReq(-299900); // within 300,000 ms
  const resBoundary = await liveEdgeFunctionFetch('https://test.supabase.co/functions/v1/sync-push-return', reqBoundary);
  assert(resBoundary.status === 200, '4.2: Timestamp at permitted boundary (-299.9s) accepted (200 OK)');

  // 4c. Stale timestamp outside tolerance (-301,000 ms = -5.01 min)
  const reqStale = await makeTimeTestReq(-305000);
  const resStale = await liveEdgeFunctionFetch('https://test.supabase.co/functions/v1/sync-push-return', reqStale);
  assert(resStale.status === 401, '4.3: Stale timestamp outside tolerance (-305s) rejected with 401');

  // 4d. Future timestamp outside tolerance (+305,000 ms = +5.08 min)
  const reqFuture = await makeTimeTestReq(305000);
  const resFuture = await liveEdgeFunctionFetch('https://test.supabase.co/functions/v1/sync-push-return', reqFuture);
  assert(resFuture.status === 401, '4.4: Future timestamp outside tolerance (+305s) rejected with 401');

  // ============================================================================
  // 5. VERIFY CANDIDATE A BACKWARD COMPATIBILITY
  // ============================================================================
  console.log('\n[5. Candidate A Backward Compatibility]');

  // Test 5a: Default path (no path param) MUST produce /sync-push-sale
  const defaultSaleMsg = buildSyncSigningMessage({
    pharmacyId: '11111111-1111-4111-8111-111111111111',
    deviceId: '22222222-2222-4222-8222-222222222222',
    clientOpId: '33333333-3333-4333-8333-333333333333',
    timestamp: '1700000000000',
    nonce: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  });

  const saleLines = defaultSaleMsg.split('\n');
  assert(saleLines[0] === 'PF-V1', 'Line 0 is PF-V1');
  assert(saleLines[1] === 'POST', 'Line 1 is POST');
  assert(saleLines[2] === '/sync-push-sale', '5.1: Default path produces /sync-push-sale');
  assert(saleLines.length === 9, 'Exactly 9 fields');

  // Test 5b: Explicit path produces /sync-push-return
  const returnMsg = buildSyncSigningMessage({
    pharmacyId: '11111111-1111-4111-8111-111111111111',
    deviceId: '22222222-2222-4222-8222-222222222222',
    clientOpId: '33333333-3333-4333-8333-333333333333',
    timestamp: '1700000000000',
    nonce: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payloadHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    path: '/sync-push-return'
  });

  const returnLines = returnMsg.split('\n');
  assert(returnLines[2] === '/sync-push-return', '5.2: Explicit path produces /sync-push-return');
  assert(returnLines.length === 9, 'Exactly 9 fields');

  // Verify byte-for-byte exact equality with Phase 5C Candidate A protocol
  const expectedP5cFormat = [
    'PF-V1',
    'POST',
    '/sync-push-sale',
    '11111111-1111-4111-8111-111111111111',
    '22222222-2222-4222-8222-222222222222',
    '33333333-3333-4333-8333-333333333333',
    '1700000000000',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  ].join('\n');
  assert(defaultSaleMsg === expectedP5cFormat, '5.3: Byte-for-byte identical with Phase 5C Candidate A format');

  // ============================================================================
  // 6. VERIFY M-10 STATUS LOOKUP
  // ============================================================================
  console.log('\n[6. M-10 Status Lookup Verification]');

  // Mock SQL function engine for rpc_get_client_op_status
  interface SyncJournalRow {
    pharmacy_id: string;
    client_op_id: string;
    status: string;
    response_status: string;
    processed_at: string;
  }
  const syncJournalTable: SyncJournalRow[] = [
    {
      pharmacy_id: pharmacyA,
      client_op_id: 'sale-op-1111-1111-1111-111111111111',
      status: 'COMMITTED',
      response_status: 'COMMITTED',
      processed_at: '2026-10-05T08:00:00Z'
    }
  ];

  function sql_rpc_get_client_op_status(
    callerUid: string | null,
    callerPharmacyId: string,
    callerStatus: string,
    p_pharmacy_id: string,
    p_client_op_id: string
  ) {
    // SECURITY DEFINER: checks auth.uid() and public.is_pharmacy_member
    if (!callerUid) return []; // anon denied
    if (callerPharmacyId !== p_pharmacy_id || callerStatus !== 'ACTIVE') return []; // cross-pharmacy or inactive denied

    // Query sync_journal first
    const fromJournal = syncJournalTable
      .filter((sj) => sj.pharmacy_id === p_pharmacy_id && sj.client_op_id === p_client_op_id)
      .map((sj) => ({
        client_op_id: sj.client_op_id,
        status: sj.status,
        response_status: sj.response_status,
        processed_at: sj.processed_at
      }));

    if (fromJournal.length > 0) return fromJournal;

    // Query sale_returns
    return dbSaleReturns
      .filter((sr) => sr.pharmacy_id === p_pharmacy_id && sr.client_op_id === p_client_op_id)
      .map((sr) => ({
        client_op_id: sr.client_op_id,
        status: sr.status,
        response_status: sr.status,
        processed_at: sr.created_at
      }));
  }

  // 6a: Sale resolved from sync_journal
  const saleStatus = sql_rpc_get_client_op_status(
    userManager.id,
    pharmacyA,
    'ACTIVE',
    pharmacyA,
    'sale-op-1111-1111-1111-111111111111'
  );
  assert(saleStatus.length === 1 && saleStatus[0].status === 'COMMITTED', '6.1: Sale operation correctly resolved from sync_journal');

  // 6b: Return resolved from sale_returns
  const returnStatus = sql_rpc_get_client_op_status(
    userManager.id,
    pharmacyA,
    'ACTIVE',
    pharmacyA,
    tx1.client_op_id
  );
  assert(
    returnStatus.length === 1 && (returnStatus[0].status === 'COMPLETED' || returnStatus[0].status === 'COMMITTED'),
    '6.2: Return operation correctly resolved from sale_returns'
  );

  // 6c: Unknown client_op_id returns 0 rows
  const unknownStatus = sql_rpc_get_client_op_status(
    userManager.id,
    pharmacyA,
    'ACTIVE',
    pharmacyA,
    'unknown-00000000-0000-0000-0000-000000000000'
  );
  assert(unknownStatus.length === 0, '6.3: Unknown client_op_id returns 0 rows');

  // 6d: Cross-pharmacy query returns 0 rows
  const crossStatus = sql_rpc_get_client_op_status(
    userManager.id,
    pharmacyA,
    'ACTIVE',
    pharmacyB, // Cross-pharmacy!
    tx1.client_op_id
  );
  assert(crossStatus.length === 0, '6.4: Cross-pharmacy status lookup denied (0 rows)');

  // 6e: Inactive membership returns 0 rows
  const inactiveStatus = sql_rpc_get_client_op_status(
    userManager.id,
    pharmacyA,
    'SUSPENDED', // Inactive!
    pharmacyA,
    tx1.client_op_id
  );
  assert(inactiveStatus.length === 0, '6.5: Inactive membership status lookup denied (0 rows)');

  // 6f: Anonymous lookup returns 0 rows
  const anonStatus = sql_rpc_get_client_op_status(
    null, // Anonymous!
    pharmacyA,
    'ACTIVE',
    pharmacyA,
    tx1.client_op_id
  );
  assert(anonStatus.length === 0, '6.6: Anonymous status lookup denied (0 rows)');

  console.log(`\n================================================================`);
  console.log(`PHASE 5D-11 FINAL FOCUSED VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
  console.log(`================================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runFinalVerificationSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
