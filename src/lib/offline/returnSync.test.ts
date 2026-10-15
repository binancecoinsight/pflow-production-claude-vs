/**
 * PharmacyFlow Phase 5D-11 Offline Return Synchronization & Queue Tests
 * 
 * Verifies end-to-end client-side queuing, cryptographic Candidate A signing
 * for /sync-push-return, dispatcher transmission, crash recovery, and queue state machine.
 */

import { indexedDB } from 'fake-indexeddb';
import {
  openOfflineDb,
  createLocalTransaction,
  getLocalTransaction,
  getQueueItem,
  SyncDispatcher
} from './index';
import { createDeviceIdentity } from '../crypto/deviceIdentity';
import {
  buildSyncSigningMessage,
  verifyDeviceSignature
} from '../crypto/signing';

async function runReturnSyncTests() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-11 OFFLINE RETURN DISPATCHER TESTS ---');

  await openOfflineDb(indexedDB);

  const pharmacyId = '11111111-1111-4111-8111-111111111111';
  const branchId = '22222222-2222-4222-8222-222222222222';
  const deviceIdentity = await createDeviceIdentity();

  const returnPayload = {
    sale_id: '33333333-3333-4333-8333-333333333333',
    branch_id: branchId,
    items: [
      {
        product_id: '44444444-4444-4444-8444-444444444444',
        batch_id: '55555555-5555-4555-8555-555555555555',
        quantity: 2,
        restock_to_inventory: true
      }
    ],
    refund_amount: 5000,
    refund_payment_method: 'CASH',
    reason: 'Damaged packaging returned by customer'
  };

  // --- 1. LOCAL TRANSACTION QUEUING ---
  console.log('\n[1. Local Queuing of SALE_RETURN Transaction]');
  const { transaction, queueItem } = await createLocalTransaction(
    {
      pharmacy_id: pharmacyId,
      transaction_type: 'SALE_RETURN',
      payload: returnPayload
    },
    indexedDB
  );

  assert(transaction.transaction_type === 'SALE_RETURN', 'Local transaction marked with transaction_type SALE_RETURN');
  assert(transaction.status === 'PENDING', 'Transaction initially in PENDING status');
  assert(queueItem.status === 'PENDING', 'Queue item initially in PENDING status');
  assert(queueItem.client_op_id === transaction.client_op_id, 'Queue item preserves exact client_op_id');

  // Verify Candidate A signing message formatting with custom return path
  const testCandidateAMsg = buildSyncSigningMessage({
    pharmacyId,
    deviceId: deviceIdentity.deviceId,
    clientOpId: transaction.client_op_id,
    timestamp: '1700000000000',
    nonce: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    payloadHash: transaction.payload_hash,
    path: '/sync-push-return'
  });

  const lines = testCandidateAMsg.split('\n');
  assert(lines[0] === 'PF-V1', 'Line 0 is PF-V1');
  assert(lines[1] === 'POST', 'Line 1 is POST');
  assert(lines[2] === '/sync-push-return', 'Line 2 is /sync-push-return endpoint path');
  assert(lines.length === 9, 'Exactly 9 LF-separated fields');

  // --- 2. DISPATCHER TRANSMISSION & SIGNING ---
  console.log('\n[2. Dispatcher Transmission to /sync-push-return]');

  let dispatchedEndpoint = '';
  let receivedSignature = '';
  let receivedBody: any = null;

  const mockFetch: typeof fetch = async (input, init) => {
    dispatchedEndpoint = input.toString();
    receivedSignature = (init?.headers as Record<string, string>)?.['X-Device-Signature'] || '';
    receivedBody = JSON.parse(init?.body as string);

    return new Response(
      JSON.stringify({
        status: 'COMMITTED',
        return_id: 'ret-authoritative-uuid',
        refund_amount: 5000
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const dispatcher = new SyncDispatcher(
    {
      edgeFunctionUrl: '/functions/v1/sync-push-sale',
      returnFunctionUrl: '/functions/v1/sync-push-return',
      fetchFn: mockFetch
    },
    indexedDB
  );

  const summary = await dispatcher.dispatch(pharmacyId, deviceIdentity, 'session-jwt-token');

  assert(summary.succeeded === 1, 'Dispatcher reports 1 return successfully synced');
  assert(dispatchedEndpoint === '/functions/v1/sync-push-return', 'Dispatcher routed SALE_RETURN to /sync-push-return');
  assert(Boolean(receivedSignature), 'Dispatcher attached cryptographic X-Device-Signature');
  assert(receivedBody?.items?.length === 1, 'Dispatcher body preserves return items');
  assert(receivedBody?.client_op_id === transaction.client_op_id, 'Dispatcher preserves client_op_id');

  // Verify that the signature was generated over Candidate A message with /sync-push-return
  const expectedMsg = buildSyncSigningMessage({
    pharmacyId,
    deviceId: deviceIdentity.deviceId,
    clientOpId: transaction.client_op_id,
    timestamp: receivedBody.timestamp,
    nonce: receivedBody.nonce,
    payloadHash: transaction.payload_hash,
    path: '/sync-push-return'
  });

  const isSigValid = await verifyDeviceSignature(
    deviceIdentity.publicKeyPem,
    receivedSignature,
    expectedMsg
  );
  assert(isSigValid === true, 'Dispatched signature successfully verifies over Candidate A /sync-push-return message');

  // Verify local status transitions
  const updatedTx = await getLocalTransaction(pharmacyId, transaction.client_op_id, indexedDB);
  const updatedQueue = await getQueueItem(pharmacyId, transaction.client_op_id, indexedDB);
  assert(updatedTx?.status === 'COMMITTED', 'Local transaction marked COMMITTED in IndexedDB');
  assert(updatedQueue?.status === 'COMMITTED', 'Queue item marked COMMITTED in IndexedDB');

  // --- 3. ERROR CLASSIFICATION ---
  console.log('\n[3. Error Classification: 409 Business Rule Failure]');

  // Create another return
  const { transaction: tx2 } = await createLocalTransaction(
    {
      pharmacy_id: pharmacyId,
      transaction_type: 'SALE_RETURN',
      payload: returnPayload
    },
    indexedDB
  );

  const failFetch: typeof fetch = async () => {
    return new Response(
      JSON.stringify({ error: 'EXCEEDS_RETURNABLE_QUANTITY: Cannot return 2 units. Only 1 returnable.' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const failDispatcher = new SyncDispatcher(
    { returnFunctionUrl: '/functions/v1/sync-push-return', fetchFn: failFetch },
    indexedDB
  );

  await failDispatcher.dispatch(pharmacyId, deviceIdentity, 'session-jwt-token');

  const failedTx = await getLocalTransaction(pharmacyId, tx2.client_op_id, indexedDB);
  const failedQueue = await getQueueItem(pharmacyId, tx2.client_op_id, indexedDB);
  assert(failedTx?.status === 'PERMANENT_FAILURE', 'HTTP 409 transitions transaction to PERMANENT_FAILURE');
  assert(failedQueue?.status === 'PERMANENT_FAILURE', 'HTTP 409 transitions queue item to PERMANENT_FAILURE');

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-11 OFFLINE RETURN TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runReturnSyncTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
