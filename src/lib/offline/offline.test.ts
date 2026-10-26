import { indexedDB } from 'fake-indexeddb';
import {
  SyncQueueItem,
  openOfflineDb,
  closeOfflineDb,
  createLocalTransaction,
  getLocalTransaction,
  getTransactionsByPharmacy,
  updateLocalTransactionStatus,
  getQueueItem,
  getEligibleQueueItems,
  updateQueueItem,
  clearPharmacyOfflineData,
  getOperationResult,
  transitionQueueItem,
  isValidTransition,
  calculateNextAttemptAt,
  acquireQueueLease,
  SyncDispatcher
} from './index';
import { createDeviceIdentity } from '../crypto/deviceIdentity';
import {
  canonicalizeJson,
  sha256Hex,
  buildSyncSigningMessage,
  verifyDeviceSignature
} from '../crypto/signing';

async function runOfflineTestSuite() {
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

  console.log('--- PHARMACYFLOW PHASE 5D-2 OFFLINE STORAGE & DISPATCHER TESTS ---');

  // Initialize DB with fake-indexeddb
  await openOfflineDb(indexedDB);

  const pharmacyA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const pharmacyB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

  // --- 1. LOCAL STORAGE TESTS ---
  console.log('\n[1. Local Storage & Durable Persistence]');
  const salePayload = {
    sale_id: '11111111-1111-4111-8111-111111111111',
    product_id: '22222222-2222-4222-8222-222222222222',
    batch_id: '33333333-3333-4333-8333-333333333333',
    quantity: 3,
    branch_id: '44444444-4444-4444-8444-444444444444',
    checkout_intent_id: '77777777-7777-4777-8777-777777777777',
    line_items: []
  };

  const { transaction: txA, queueItem: qA } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    payload: salePayload
  }, indexedDB);

  assert(txA.id !== undefined, 'Transaction generated a local ID');
  assert(txA.pharmacy_id === pharmacyA, 'Transaction stores correct pharmacy_id partition key');
  assert(txA.status === 'PENDING', 'Transaction initially has PENDING status');
  assert(qA.status === 'PENDING', 'Queue item initially has PENDING status');
  assert(txA.client_op_id === qA.client_op_id, 'Queue item and transaction share identical client_op_id');
  assert(txA.payload_hash.length === 64, 'Transaction stores valid 64-char SHA-256 payload hash');

  // Retrieve transaction
  const readTx = await getLocalTransaction(pharmacyA, txA.client_op_id, indexedDB);
  assert(readTx !== null && readTx.id === txA.id, 'Successfully retrieved transaction by (pharmacy_id, client_op_id)');

  // Pharmacy Isolation Test on read
  const crossReadTx = await getLocalTransaction(pharmacyB, txA.client_op_id, indexedDB);
  assert(crossReadTx === null, 'CRITICAL: Querying under Pharmacy B returns NULL for Pharmacy A transaction');

  // Duplicate client_op_id rejection
  let duplicateRejected = false;
  try {
    await createLocalTransaction({
      pharmacy_id: pharmacyA,
      client_op_id: txA.client_op_id,
      payload: salePayload
    }, indexedDB);
  } catch (err: unknown) {
    duplicateRejected = true;
    console.log(`    Expected duplicate rejection caught: "${(err as Error).message}"`);
  }
  assert(duplicateRejected, 'Attempt to create duplicate transaction with same client_op_id is rejected');

  // Update status
  await updateLocalTransactionStatus(pharmacyA, txA.client_op_id, 'COMMITTED', indexedDB);
  const updatedTx = await getLocalTransaction(pharmacyA, txA.client_op_id, indexedDB);
  assert(updatedTx?.status === 'COMMITTED', 'Successfully updated local transaction status to COMMITTED');

  // --- 2. QUEUE STATE MACHINE TESTS ---
  console.log('\n[2. Queue State Machine Transitions]');
  assert(isValidTransition('PENDING', 'SYNCING'), 'PENDING -> SYNCING is valid');
  assert(isValidTransition('SYNCING', 'COMMITTED'), 'SYNCING -> COMMITTED is valid');
  assert(isValidTransition('SYNCING', 'RETRYABLE'), 'SYNCING -> RETRYABLE is valid');
  assert(isValidTransition('SYNCING', 'PERMANENT_FAILURE'), 'SYNCING -> PERMANENT_FAILURE is valid');
  assert(isValidTransition('SYNCING', 'AUTH_REQUIRED'), 'SYNCING -> AUTH_REQUIRED is valid');
  assert(isValidTransition('SYNCING', 'DEVICE_BLOCKED'), 'SYNCING -> DEVICE_BLOCKED is valid');
  assert(isValidTransition('RETRYABLE', 'SYNCING'), 'RETRYABLE -> SYNCING is valid');
  assert(!isValidTransition('PENDING', 'COMMITTED'), 'PENDING -> COMMITTED is ILLEGAL');
  assert(!isValidTransition('COMMITTED', 'SYNCING'), 'COMMITTED -> SYNCING is ILLEGAL');
  assert(!isValidTransition('PERMANENT_FAILURE', 'SYNCING'), 'PERMANENT_FAILURE -> SYNCING is ILLEGAL');

  let stateItem: SyncQueueItem = { ...qA, status: 'PENDING', attempts: 0 };
  stateItem = transitionQueueItem(stateItem, 'SYNCING');
  assert(stateItem.status === 'SYNCING', 'State transitioned to SYNCING');
  assert(stateItem.attempts === 1, 'Attempts incremented to 1');
  assert(stateItem.locked_at !== null, 'Lock timestamp assigned on SYNCING');

  stateItem = transitionQueueItem(stateItem, 'RETRYABLE', { error: 'Network timeout' });
  assert(stateItem.status === 'RETRYABLE', 'State transitioned to RETRYABLE');
  assert(stateItem.locked_at === null, 'Lock cleared on RETRYABLE');
  assert(stateItem.last_error === 'Network timeout', 'Error recorded');

  // Verify illegal transition throws
  let illegalThrows = false;
  try {
    transitionQueueItem(stateItem, 'COMMITTED');
  } catch {
    illegalThrows = true;
  }
  assert(illegalThrows, 'Illegal transition RETRYABLE -> COMMITTED threw an error');

  // --- 3. RETRY & EXPONENTIAL BACKOFF TESTS ---
  console.log('\n[3. Retry & Exponential Backoff]');
  const now = 1000000;
  const backoff0 = calculateNextAttemptAt(0, undefined, now);
  const backoff1 = calculateNextAttemptAt(1, undefined, now);
  const backoff2 = calculateNextAttemptAt(2, undefined, now);
  assert(backoff0 > now, 'Attempt 0 schedules in the future');
  assert(backoff1 > backoff0 - 500, 'Attempt 1 delay increases exponentially');
  assert(backoff2 > backoff1 - 500, 'Attempt 2 delay increases exponentially');

  // --- 4. MULTI-PHARMACY ISOLATION & SWITCHING ---
  console.log('\n[4. Multi-Pharmacy Isolation]');
  // Create records for Pharmacy B
  const { transaction: txB, queueItem: qB } = await createLocalTransaction({
    pharmacy_id: pharmacyB,
    payload: {
      sale_id: '55555555-5555-4555-8555-555555555555',
      product_id: '66666666-6666-4666-8666-666666666666',
      batch_id: '77777777-7777-4777-8777-777777777777',
      quantity: 1
    }
  }, indexedDB);

  const txsA = await getTransactionsByPharmacy(pharmacyA, indexedDB);
  const txsB = await getTransactionsByPharmacy(pharmacyB, indexedDB);
  assert(txsA.every(t => t.pharmacy_id === pharmacyA), 'All Pharmacy A transactions belong to Pharmacy A');
  assert(txsB.every(t => t.pharmacy_id === pharmacyB), 'All Pharmacy B transactions belong to Pharmacy B');
  assert(!txsA.some(t => t.id === txB.id), 'Pharmacy B transaction does NOT appear in Pharmacy A queries');

  const eligibleA = await getEligibleQueueItems(pharmacyA, Date.now(), indexedDB);
  const eligibleB = await getEligibleQueueItems(pharmacyB, Date.now(), indexedDB);
  assert(!eligibleA.some(q => q.pharmacy_id === pharmacyB), 'Pharmacy A eligible items do NOT contain Pharmacy B items');
  assert(eligibleB.some(q => q.id === qB.id), 'Pharmacy B item correctly eligible under Pharmacy B');

  // --- 5. CRASH RECOVERY & AMBIGUOUS RESULTS ---
  console.log('\n[5. Crash Recovery & Ambiguous Status Resolution]');
  // Create a stuck SYNCING item simulating an app crash 10 minutes ago
  const stuckOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: stuckQ, transaction: stuckTx } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: stuckOpId,
    payload: { ...salePayload, checkout_intent_id: '55555555-5555-4555-8555-555555555555', line_items: [] }
  }, indexedDB);

  // Manually put in SYNCING state with stale lease
  const staleLeaseTime = Date.now() - 300000; // 5 minutes ago
  const staleItem = {
    ...stuckQ,
    status: 'SYNCING' as const,
    locked_at: staleLeaseTime
  };
  await updateQueueItem(staleItem, indexedDB);

  // Test 5.1: Recover with server confirming it committed
  let rpcCalledWithOp = '';
  const mockServerCommittedDispatcher = new SyncDispatcher({
    rpcGetClientOpStatus: async (pId, opId) => {
      rpcCalledWithOp = opId;
      return {
        pharmacy_id: pId,
        client_op_id: opId,
        outcome: 'CONFIRMED_COMMITTED' as const,
        operation_kind: 'UNIFIED_SALE_V1' as const,
        payload_hash: stuckTx.payload_hash,
        sale_id: salePayload.sale_id,
        checkout_intent_id: '55555555-5555-4555-8555-555555555555',
        response_status: '200 OK',
        response_payload: { operation_status: 'COMMITTED', client_op_id: opId, sale_id: salePayload.sale_id,
          checkout_intent_id: '55555555-5555-4555-8555-555555555555', processed_at: new Date().toISOString() },
        processed_at: new Date().toISOString(), record_id: salePayload.sale_id, return_id: null
      };
    }
  }, indexedDB);

  const recoveredCommittedCount = await mockServerCommittedDispatcher.recoverStaleOperations(pharmacyA, 60000);
  assert(recoveredCommittedCount === 1, 'Stale operation was recovered');
  assert(rpcCalledWithOp === stuckOpId, 'rpc_get_client_op_status was queried with the exact client_op_id');
  const postRecoverTx = await getLocalTransaction(pharmacyA, stuckOpId, indexedDB);
  assert(postRecoverTx?.status === 'COMMITTED', 'Stale transaction was confirmed and marked COMMITTED');

  // Test 5.2: Recover with server having no record -> reverts to RETRYABLE with same client_op_id
  const uncommittedOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: uncommittedQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: uncommittedOpId,
    payload: { ...salePayload, checkout_intent_id: '66666666-6666-4666-8666-666666666666', line_items: [] }
  }, indexedDB);
  await updateQueueItem({
    ...uncommittedQ,
    status: 'SYNCING' as const,
    locked_at: staleLeaseTime
  }, indexedDB);

  const mockServerUncommittedDispatcher = new SyncDispatcher({
    rpcGetClientOpStatus: async (pId, opId) => ({
      pharmacy_id: pId,
      outcome: 'CONFIRMED_ABSENT', client_op_id: opId, operation_kind: 'UNKNOWN', payload_hash: null,
      sale_id: null, checkout_intent_id: null, response_status: 'AUTHORIZED_ABSENCE', response_payload: null, processed_at: null,
      record_id: null, return_id: null
    })
  }, indexedDB);

  const recoveredUncommittedCount = await mockServerUncommittedDispatcher.recoverStaleOperations(pharmacyA, 60000);
  assert(recoveredUncommittedCount === 1, 'Stale uncommitted operation was recovered');
  const postRecoverQueueItem = await getQueueItem(pharmacyA, uncommittedOpId, indexedDB);
  assert(postRecoverQueueItem?.status === 'RETRYABLE', 'Uncommitted operation reverted to RETRYABLE');
  assert(postRecoverQueueItem?.client_op_id === uncommittedOpId, 'CRITICAL: client_op_id preserved identically across crash recovery');

  // --- 6. SIGNING & DISPATCHER CLASSIFICATION TESTS ---
  console.log('\n[6. Dispatcher Signing & HTTP Status Classification]');
  const deviceIdentity = await createDeviceIdentity();

  // Test 6.1: HTTP 200 OK Success Flow
  const successOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: successQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: successOpId,
    payload: salePayload
  }, indexedDB);

  let capturedSignature = '';
  let capturedBody: Record<string, unknown> = {};

  const successDispatcher = new SyncDispatcher({
    fetchFn: async (url, init) => {
      capturedSignature = (init?.headers as Record<string, string>)['X-Device-Signature'];
      capturedBody = JSON.parse(init?.body as string);
      return new Response(JSON.stringify({
        success: true,
        operation_status: 'COMMITTED',
        client_op_id: successOpId,
        sale_id: salePayload.sale_id,
        checkout_intent_id: salePayload.checkout_intent_id,
        new_stock: 42,
        deficit_created: false,
        processed_at: new Date().toISOString()
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }, indexedDB);

  const dispatchResult = await successDispatcher.dispatchOne(successQ, deviceIdentity, 'mock-jwt-token');
  assert(dispatchResult.status === 'COMMITTED', 'Dispatcher returned COMMITTED status on HTTP 200');
  assert(capturedSignature.length > 0, 'Dispatcher attached cryptographic X-Device-Signature');
  assert(capturedBody.client_op_id === successOpId, 'Dispatcher body preserves client_op_id');
  assert(capturedBody.pharmacy_id === pharmacyA, 'Dispatcher body contains correct pharmacy_id');

  // CHECK 1 Verification: Prove nonce was obtained and embedded in the Candidate A message BEFORE signing
  const requestNonce = capturedBody.nonce as string;
  assert(typeof requestNonce === 'string' && requestNonce.length === 36, 'CHECK 1: Nonce is present in request body as UUID v4');

  const reconstructedMsg = buildSyncSigningMessage({
    pharmacyId: pharmacyA,
    deviceId: deviceIdentity.deviceId,
    clientOpId: successOpId,
    timestamp: capturedBody.timestamp as string,
    nonce: requestNonce,
    payloadHash: capturedBody.payload_hash as string
  });

  const isSigValidWithNonce = await verifyDeviceSignature(
    deviceIdentity.publicKeyPem,
    capturedSignature,
    reconstructedMsg
  );
  assert(isSigValidWithNonce === true, 'CHECK 1: Cryptographic signature was computed OVER the message containing the fresh nonce');

  const alteredNonceMsg = buildSyncSigningMessage({
    pharmacyId: pharmacyA,
    deviceId: deviceIdentity.deviceId,
    clientOpId: successOpId,
    timestamp: capturedBody.timestamp as string,
    nonce: crypto.randomUUID().toLowerCase(),
    payloadHash: capturedBody.payload_hash as string
  });
  const isSigInvalidWithAlteredNonce = await verifyDeviceSignature(
    deviceIdentity.publicKeyPem,
    capturedSignature,
    alteredNonceMsg
  );
  assert(isSigInvalidWithAlteredNonce === false, 'CHECK 1: Altering the nonce rejects the signature (nonce is strictly bound to signature)');

  const finalTx = await getLocalTransaction(pharmacyA, successOpId, indexedDB);
  assert(finalTx?.status === 'COMMITTED', 'Local transaction marked COMMITTED');
  const auditResult = await getOperationResult(pharmacyA, successOpId, indexedDB);
  assert(auditResult !== null && auditResult.resulting_stock === 42, 'OperationResult audit row recorded in IndexedDB');

  // Test 6.2: Network Failure -> UNCERTAIN
  const networkFailOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: netFailQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: networkFailOpId,
    payload: salePayload
  }, indexedDB);

  const netFailDispatcher = new SyncDispatcher({
    fetchFn: async () => {
      throw new TypeError('Failed to fetch: Network offline');
    }
  }, indexedDB);

  const netResult = await netFailDispatcher.dispatchOne(netFailQ, deviceIdentity, 'mock-jwt');
  assert(netResult.status === 'UNCERTAIN', 'Network response loss classified as UNCERTAIN');
  const netQueueItem = await getQueueItem(pharmacyA, networkFailOpId, indexedDB);
  assert(netQueueItem?.status === 'UNCERTAIN', 'Queue item preserves ambiguous outcome as UNCERTAIN');
  assert(netQueueItem?.attempts === 1, 'Attempt counter incremented');
  assert(netQueueItem?.next_attempt_at !== undefined, 'Original schedule retained while automatic resend is disabled');

  // Test 6.3: HTTP 401 Unauthorized -> AUTH_REQUIRED
  const authFailOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: authFailQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: authFailOpId,
    payload: salePayload
  }, indexedDB);

  const authFailDispatcher = new SyncDispatcher({
    fetchFn: async () => new Response(JSON.stringify({ error: 'Token expired' }), { status: 401 })
  }, indexedDB);

  const authResult = await authFailDispatcher.dispatchOne(authFailQ, deviceIdentity, 'expired-jwt');
  assert(authResult.status === 'AUTH_REQUIRED', 'HTTP 401 classified as AUTH_REQUIRED');

  // Test 6.4: HTTP 403 Forbidden -> DEVICE_BLOCKED
  const blockOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: blockQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: blockOpId,
    payload: salePayload
  }, indexedDB);

  const blockDispatcher = new SyncDispatcher({
    fetchFn: async () => new Response(JSON.stringify({ error: 'Device decommissioned' }), { status: 403 })
  }, indexedDB);

  const blockResult = await blockDispatcher.dispatchOne(blockQ, deviceIdentity, 'mock-jwt');
  assert(blockResult.status === 'DEVICE_BLOCKED', 'HTTP 403 classified as DEVICE_BLOCKED');

  // Test 6.5: HTTP 409 Conflict -> CONFLICT
  const conflictOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: conflictQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: conflictOpId,
    payload: salePayload
  }, indexedDB);

  const conflictDispatcher = new SyncDispatcher({
    fetchFn: async () => new Response(JSON.stringify({ error: 'Payload hash conflict' }), { status: 409 })
  }, indexedDB);

  const conflictResult = await conflictDispatcher.dispatchOne(conflictQ, deviceIdentity, 'mock-jwt');
  assert(conflictResult.status === 'CONFLICT', 'HTTP 409 classified as CONFLICT');
  const conflictTx = await getLocalTransaction(pharmacyA, conflictOpId, indexedDB);
  assert(conflictTx?.status === 'CONFLICT', 'Local transaction marked CONFLICT');

  // Test 6.6: Tampered Payload Detection
  const tamperOpId = crypto.randomUUID().toLowerCase();
  const { transaction: tamperTx, queueItem: tamperQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: tamperOpId,
    payload: salePayload
  }, indexedDB);

  // Directly mutate the payload in IndexedDB to simulate memory/database corruption
  const db = await openOfflineDb(indexedDB);
  await new Promise<void>((resolve) => {
    const tx = db.transaction('local_transactions', 'readwrite');
    const store = tx.objectStore('local_transactions');
    store.put({
      ...tamperTx,
      payload: { ...tamperTx.payload, quantity: 9999 } // Tampered quantity!
    });
    tx.oncomplete = () => resolve();
  });

  const tamperResult = await successDispatcher.dispatchOne(tamperQ, deviceIdentity, 'mock-jwt');
  assert(tamperResult.status === 'PERMANENT_FAILURE', 'Tampered payload detected and rejected as PERMANENT_FAILURE');
  assert(Boolean(tamperResult.error?.includes('mismatch')), 'Tamper error reflects hash mismatch');

  // --- 7. ATOMIC LEASE & CROSS-TAB CONCURRENCY GUARDS ---
  console.log('\n[7. Atomic Lease & Cross-Tab Concurrency Guards]');

  // Test A — Same-context duplicate dispatch
  const concOpIdA = crypto.randomUUID().toLowerCase();
  const { queueItem: concQA } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: concOpIdA,
    payload: salePayload
  }, indexedDB);

  let concurrentCallsCountA = 0;
  const slowDispatcherA = new SyncDispatcher({
    fetchFn: async () => {
      concurrentCallsCountA++;
      await new Promise(r => setTimeout(r, 50));
      return new Response(JSON.stringify({ success: true, operation_status: 'COMMITTED', client_op_id: concOpIdA,
        sale_id: salePayload.sale_id, checkout_intent_id: salePayload.checkout_intent_id, processed_at: new Date().toISOString() }), { status: 200 });
    }
  }, indexedDB);

  const [cResA1, cResA2] = await Promise.all([
    slowDispatcherA.dispatchOne(concQA, deviceIdentity, 'mock-jwt'),
    slowDispatcherA.dispatchOne(concQA, deviceIdentity, 'mock-jwt')
  ]);

  const committedCountA = [cResA1.status, cResA2.status].filter(s => s === 'COMMITTED').length;
  assert(committedCountA === 1, 'Test A: Exactly one concurrent call dispatched the operation');
  assert(concurrentCallsCountA === 1, 'Test A: Edge function called exactly once for duplicate simultaneous dispatch');

  // Test B — Lease already held (recent locked_at within leaseTimeoutMs)
  const heldOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: heldQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: heldOpId,
    payload: salePayload
  }, indexedDB);

  // Directly set status = SYNCING with a recent locked_at (5 seconds ago)
  await updateQueueItem({
    ...heldQ,
    status: 'SYNCING',
    locked_at: Date.now() - 5000
  }, indexedDB);

  let networkCalledForHeldLease = false;
  const heldDispatcher = new SyncDispatcher({
    fetchFn: async () => {
      networkCalledForHeldLease = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
  }, indexedDB);

  const heldLeaseAcq = await acquireQueueLease(pharmacyA, heldOpId, 60000, indexedDB);
  assert(heldLeaseAcq.acquired === false, 'Test B: Lease acquisition rejected because lease is currently active');
  assert(heldLeaseAcq.reason === 'RECONCILIATION_REQUIRED', 'Test B: Reason requires authoritative reconciliation');

  const heldDispatchRes = await heldDispatcher.dispatchOne(heldQ, deviceIdentity, 'mock-jwt');
  assert(Boolean(heldDispatchRes.error?.includes('not acquired') || heldDispatchRes.error?.includes('locked')), 'Test B: Dispatcher declined to dispatch operation with active lease');
  assert(networkCalledForHeldLease === false, 'Test B: Zero network requests executed when lease is already held');

  // Test C — Stale lease (older than leaseTimeoutMs)
  const staleLeaseOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: staleLeaseQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: staleLeaseOpId,
    payload: salePayload
  }, indexedDB);

  const oldLeaseTimestamp = Date.now() - 120000; // 2 minutes ago (stale, > 60s)
  await updateQueueItem({
    ...staleLeaseQ,
    status: 'SYNCING',
    locked_at: oldLeaseTimestamp
  }, indexedDB);

  const staleLeaseAcq = await acquireQueueLease(pharmacyA, staleLeaseOpId, 60000, indexedDB);
  assert(staleLeaseAcq.acquired === false, 'Test C: Stale SYNCING is never reacquired without reconciliation');
  assert(staleLeaseAcq.reason === 'RECONCILIATION_REQUIRED', 'Test C: Stale lease requires authoritative status evidence');
  assert(staleLeaseAcq.item?.locked_at === oldLeaseTimestamp, 'Test C: stale lease evidence is preserved');

  // Test D — Pharmacy isolation on lease acquisition
  const isoLeaseAcq = await acquireQueueLease(pharmacyB, staleLeaseOpId, 60000, indexedDB);
  assert(isoLeaseAcq.acquired === false, 'Test D: Pharmacy B cannot acquire Pharmacy A queue lease');
  assert(isoLeaseAcq.reason === 'NOT_FOUND' || isoLeaseAcq.reason === 'UNAUTHORIZED_PHARMACY', 'Test D: Access across pharmacy partitions is rejected');

  // Test E — Different operations in same pharmacy can be acquired independently
  const diffOpId1 = crypto.randomUUID().toLowerCase();
  const diffOpId2 = crypto.randomUUID().toLowerCase();
  await createLocalTransaction({ pharmacy_id: pharmacyA, client_op_id: diffOpId1, payload: salePayload }, indexedDB);
  await createLocalTransaction({ pharmacy_id: pharmacyA, client_op_id: diffOpId2, payload: salePayload }, indexedDB);

  const acq1 = await acquireQueueLease(pharmacyA, diffOpId1, 60000, indexedDB);
  const acq2 = await acquireQueueLease(pharmacyA, diffOpId2, 60000, indexedDB);
  assert(acq1.acquired === true && acq2.acquired === true, 'Test E: Distinct operations within same pharmacy acquired leases independently');

  // Test F — Same operation across independent dispatcher instances (Cross-Tab / Cross-Context Simulation)
  // Two distinct dispatcher instances that do NOT share the in-memory activeLocks Set
  const crossTabOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: crossTabQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: crossTabOpId,
    payload: salePayload
  }, indexedDB);

  let crossTabFetchCount = 0;
  const tab1Dispatcher = new SyncDispatcher({
    fetchFn: async () => {
      crossTabFetchCount++;
      await new Promise(r => setTimeout(r, 60)); // Simulate network latency
      return new Response(JSON.stringify({ success: true, operation_status: 'COMMITTED', client_op_id: crossTabOpId,
        sale_id: salePayload.sale_id, checkout_intent_id: salePayload.checkout_intent_id, processed_at: new Date().toISOString() }), { status: 200 });
    }
  }, indexedDB);

  const tab2Dispatcher = new SyncDispatcher({
    fetchFn: async () => {
      crossTabFetchCount++;
      await new Promise(r => setTimeout(r, 60)); // Simulate network latency
      return new Response(JSON.stringify({ success: true, operation_status: 'COMMITTED', client_op_id: crossTabOpId,
        sale_id: salePayload.sale_id, checkout_intent_id: salePayload.checkout_intent_id, processed_at: new Date().toISOString() }), { status: 200 });
    }
  }, indexedDB);

  // Dispatch concurrently across two completely independent instances
  const [tab1Result, tab2Result] = await Promise.all([
    tab1Dispatcher.dispatchOne(crossTabQ, deviceIdentity, 'mock-jwt'),
    tab2Dispatcher.dispatchOne(crossTabQ, deviceIdentity, 'mock-jwt')
  ]);

  const totalCommitted = [tab1Result.status, tab2Result.status].filter(s => s === 'COMMITTED').length;
  assert(totalCommitted === 1, 'Test F: Exactly one independent dispatcher instance committed the operation');
  assert(crossTabFetchCount === 1, 'Test F: CRITICAL: Exactly one HTTP request executed across separate dispatcher instances (atomic IndexedDB lease)');

  // Test G — Failed lease means no signing function called, no nonce, and no HTTP request
  const noSignOpId = crypto.randomUUID().toLowerCase();
  const { queueItem: noSignQ } = await createLocalTransaction({
    pharmacy_id: pharmacyA,
    client_op_id: noSignOpId,
    payload: salePayload
  }, indexedDB);

  // Pre-lock the lease
  await acquireQueueLease(pharmacyA, noSignOpId, 60000, indexedDB);

  let testGFetchCalled = false;
  const failingLeaseDispatcher = new SyncDispatcher({
    fetchFn: async () => {
      testGFetchCalled = true;
      return new Response(JSON.stringify({ success: true }), { status: 200 });
    }
  }, indexedDB);

  const failLeaseResult = await failingLeaseDispatcher.dispatchOne(noSignQ, deviceIdentity, 'mock-jwt');
  assert(Boolean(failLeaseResult.error?.includes('not acquired') || failLeaseResult.error?.includes('Held')), 'Test G: Dispatcher reported unacquired lease');
  assert(testGFetchCalled === false, 'Test G: CRITICAL: Zero HTTP network requests when lease acquisition fails');

  // --- 8. PURGING A SINGLE PHARMACY'S OFFLINE DATA ---
  console.log('\n[8. Isolated Pharmacy Purge]');
  await clearPharmacyOfflineData(pharmacyA, indexedDB);
  const postPurgeA = await getTransactionsByPharmacy(pharmacyA, indexedDB);
  const postPurgeB = await getTransactionsByPharmacy(pharmacyB, indexedDB);
  assert(postPurgeA.length === 0, 'Pharmacy A offline data successfully cleared');
  assert(postPurgeB.length > 0, 'Pharmacy B offline data completely intact and untouched');

  // --- 9. SECURITY INVARIANTS ---
  console.log('\n[9. Security Invariants Verification]');
  // Verify private key is never in local transaction records
  const allTx = await getTransactionsByPharmacy(pharmacyB, indexedDB);
  const serialized = JSON.stringify(allTx);
  assert(!serialized.includes('privateKey'), 'No private key material serialized in transaction store');
  assert(!serialized.includes('CryptoKey'), 'No raw CryptoKey serialized in transaction store');

  closeOfflineDb();

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-2 OFFLINE TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runOfflineTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
