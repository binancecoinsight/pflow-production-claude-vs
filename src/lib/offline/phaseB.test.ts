import { IDBFactory } from 'fake-indexeddb';
import {
  acknowledgeCheckoutDraft, cancelCheckoutDraft, closeOfflineDb, createLocalTransaction,
  acquireQueueLease,
  freezeCheckoutDraftTransaction, getCheckoutDraft, getLocalTransaction, getOperationResult,
  getOrCreateCheckoutDraft, getQueueItem, openOfflineDb, resolveOperationAtomically,
  saveCheckoutDraftSnapshot, setIdbFactory, STORES
} from './db';
import { SyncDispatcher } from './dispatcher';
import { createDeviceIdentity } from '../crypto/deviceIdentity';
import { capturePosScope, isPosScopeCurrent, runPosScopeBoundTask } from '../pos/scopeGuard';
import { CheckoutAsyncBoundary, initialCheckoutUiState } from '../../components/pos/checkoutUiLifecycle';
import { runCheckoutBoundTask } from '../../components/pos/checkoutUiLifecycle';
import { loadExistingDurableCart, loadOrCreateDurableCart, cartDraftExpectation } from '../pos/drafts';
import { getExistingDurableCheckoutSale } from '../sales/service';
import { readFileSync } from 'node:fs';

let passed = 0;
const indexedDB = new IDBFactory();
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
  passed++;
};
const ids = {
  pharmacy: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', branch: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  cashier: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', product: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  batch: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
};
const expected = (draft: { scope_key: string; checkout_intent_id: string; client_op_id: string; sale_id: string; revision: number }) => ({
  scope_key: draft.scope_key, checkout_intent_id: draft.checkout_intent_id,
  client_op_id: draft.client_op_id, sale_id: draft.sale_id, expected_revision: draft.revision
});

const unifiedPayload = (op: string, sale: string, checkout: string, createdAt = Date.now()) => ({
  sale_id: sale, client_op_id: op, checkout_intent_id: checkout,
  pharmacy_id: ids.pharmacy, branch_id: ids.branch, cashier_id: ids.cashier, created_at: createdAt,
  customer_id: null, currency: 'NGN', subtotal: 100, discount: 0, tax: 0, total: 100,
  payment_method: 'CASH', amount_tendered: 100, change_due: 0, payment_status: 'SETTLED',
  line_items: [{ id: crypto.randomUUID(), product_id: ids.product, batch_id: ids.batch, quantity: 1,
    unit_price: 100, discount: 0, tax: 0, line_total: 100 }]
});

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
};

const rewriteFrozenEvidence = async (
  scopeKey: string,
  mutate: (draft: any, transaction: any) => void
) => {
  const db = await openOfflineDb(indexedDB);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([STORES.CHECKOUT_DRAFTS, STORES.TRANSACTIONS], 'readwrite');
    const drafts = tx.objectStore(STORES.CHECKOUT_DRAFTS);
    const transactions = tx.objectStore(STORES.TRANSACTIONS);
    const draftRequest = drafts.get(scopeKey);
    draftRequest.onsuccess = () => {
      const draft = draftRequest.result;
      const transactionRequest = transactions.get(draft.transaction_id);
      transactionRequest.onsuccess = () => {
        const transaction = transactionRequest.result;
        mutate(draft, transaction);
        drafts.put(draft);
        transactions.put(transaction);
      };
      transactionRequest.onerror = () => tx.abort();
    };
    draftRequest.onerror = () => tx.abort();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Frozen evidence rewrite aborted'));
  });
};

const historical = {
  id: '11111111-1111-4111-8111-111111111111', pharmacy_id: ids.pharmacy,
  client_op_id: '22222222-2222-4222-8222-222222222222', transaction_type: 'SALE_STOCK_MOVEMENT',
  payload: { legacy: true, bytes: 'must-not-change' }, payload_hash: 'a'.repeat(64),
  created_at: 1, updated_at: 1, status: 'PENDING'
};

const seedV3 = () => new Promise<void>((resolve, reject) => {
  const request = indexedDB.open('pharmacyflow_offline_v1', 3);
  request.onupgradeneeded = () => {
    const db = request.result;
    const transactions = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' });
    transactions.createIndex('pharmacy_id', 'pharmacy_id'); transactions.createIndex('client_op_id', 'client_op_id');
    transactions.createIndex('pharmacy_client_op', ['pharmacy_id', 'client_op_id'], { unique: true });
    transactions.createIndex('status', 'status'); transactions.createIndex('created_at', 'created_at');
    const queue = db.createObjectStore(STORES.QUEUE, { keyPath: 'id' });
    queue.createIndex('pharmacy_id', 'pharmacy_id'); queue.createIndex('client_op_id', 'client_op_id');
    queue.createIndex('pharmacy_client_op', ['pharmacy_id', 'client_op_id'], { unique: true });
    queue.createIndex('status', 'status'); queue.createIndex('next_attempt_at', 'next_attempt_at');
    queue.createIndex('pharmacy_status', ['pharmacy_id', 'status']);
    const results = db.createObjectStore(STORES.RESULTS, { keyPath: 'id' });
    results.createIndex('pharmacy_id', 'pharmacy_id'); results.createIndex('client_op_id', 'client_op_id');
    results.createIndex('pharmacy_client_op', ['pharmacy_id', 'client_op_id'], { unique: true });
    db.createObjectStore(STORES.PRODUCTS, { keyPath: 'id' }).createIndex('pharmacy_id', 'pharmacy_id');
    db.createObjectStore(STORES.BATCHES, { keyPath: 'id' }).createIndex('pharmacy_id', 'pharmacy_id');
    db.createObjectStore(STORES.SNAPSHOT_METADATA, { keyPath: 'pharmacy_id' });
    db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' }).createIndex('pharmacy_id', 'pharmacy_id');
    transactions.add(historical);
  };
  request.onsuccess = () => { request.result.close(); resolve(); };
  request.onerror = () => reject(request.error);
});

async function run() {
  console.log('Phase B: IndexedDB v4 and durable draft acceptance');
  await seedV3();
  setIdbFactory(indexedDB);
  const db = await openOfflineDb(indexedDB);
  assert(db.version === 4 && db.objectStoreNames.contains(STORES.CHECKOUT_DRAFTS), 'v4 additive checkout store exists');
  assert(Object.values(STORES).every((store) => db.objectStoreNames.contains(store)),
    'v4 upgrade preserves every historical object store while adding checkout drafts');
  assert(JSON.stringify(await getLocalTransaction(ids.pharmacy, historical.client_op_id, indexedDB)) === JSON.stringify(historical),
    'v3 historical record is byte-for-byte unchanged by the v4 upgrade');

  const [first, competing] = await Promise.all([
    getOrCreateCheckoutDraft({ pharmacy_id: ids.pharmacy, branch_id: ids.branch, cashier_id: ids.cashier }, indexedDB),
    getOrCreateCheckoutDraft({ pharmacy_id: ids.pharmacy, branch_id: ids.branch, cashier_id: ids.cashier }, indexedDB)
  ]);
  assert(first.client_op_id === competing.client_op_id && first.checkout_intent_id === competing.checkout_intent_id,
    'competing tabs converge on one scope-bound identity');
  const uiBoundary = new CheckoutAsyncBoundary(first.checkout_intent_id);
  const resetUi = initialCheckoutUiState(2500);
  const delayedCustomer = deferred<string>();
  let appliedCustomer: string | null = null;
  const customerAdapter = runCheckoutBoundTask(uiBoundary, () => delayedCustomer.promise).then((outcome) => {
    if (outcome.accepted && 'value' in outcome) appliedCustomer = outcome.value;
  });
  uiBoundary.reset(crypto.randomUUID());
  delayedCustomer.resolve('stale-customer');
  await customerAdapter;
  assert(appliedCustomer === null && resetUi.selectedCustomerId === null &&
    resetUi.paymentMethod === 'CASH' && resetUi.tenderInput === '25.00' && !resetUi.customerRequestPending,
    'production checkout adapter rejects delayed customer lookup across replacement and state resets');
  for (const sequence of ['customer-create', 'product-search', 'barcode-resolution', 'duplicate-selection']) {
    const boundary = new CheckoutAsyncBoundary(sequence);
    const pending = deferred<string>();
    let applied = false;
    const completion = runCheckoutBoundTask(boundary, () => pending.promise).then((outcome) => {
      if (outcome.accepted && 'value' in outcome) applied = true;
    });
    if (sequence === 'customer-create') boundary.invalidate();
    else boundary.reset(`${sequence}:next-scope`);
    pending.resolve('late-result');
    await completion;
    assert(!applied, `production checkout adapter rejects delayed ${sequence} after scope change or unmount`);
  }

  const initCashier = 'cccccccc-cccc-4ccc-8ccc-ccccccccccce';
  const initContext = { pharmacy_id: ids.pharmacy, branch_id: ids.branch, cashier_id: initCashier,
    authenticated_user_id: initCashier, currency: 'NGN' };
  const restrictedCashier = 'cccccccc-cccc-4ccc-8ccc-ccccccccccca';
  const restrictedContext = { ...initContext, cashier_id: restrictedCashier, authenticated_user_id: restrictedCashier };
  assert(await loadExistingDurableCart(restrictedContext, indexedDB) === null &&
    await getCheckoutDraft(`${ids.pharmacy}:${ids.branch}:${restrictedCashier}`, indexedDB) === null,
    'restricted POS entry loads evidence only and never reserves a new checkout');
  const [initA, initB] = await Promise.all([
    loadOrCreateDurableCart(initContext, indexedDB), loadOrCreateDurableCart(initContext, indexedDB)
  ]);
  assert(JSON.stringify(initA) === JSON.stringify(initB) && initA.draft_revision === 1,
    'simultaneous cart initialization converges on the winning persisted snapshot');
  assert(JSON.stringify(await loadOrCreateDurableCart(initContext, indexedDB)) === JSON.stringify(initA),
    'repeated mount restores the same persisted initialization snapshot');
  assert(JSON.stringify(await loadExistingDurableCart(initContext, indexedDB)) === JSON.stringify(initA),
    'restricted POS entry can restore existing checkout evidence without replacement');
  await cancelCheckoutDraft(cartDraftExpectation(initA), indexedDB);
  const initReplacement = await loadOrCreateDurableCart(initContext, indexedDB);
  assert(initReplacement.checkout_intent_id !== initA.checkout_intent_id,
    'explicit initialization replaces a retired checkout with one new persisted identity');

  const interruptedCashier = 'cccccccc-cccc-4ccc-8ccc-cccccccccccf';
  const interruptedContext = { ...initContext, cashier_id: interruptedCashier, authenticated_user_id: interruptedCashier };
  const activeDb = (await openOfflineDb(indexedDB)) as any;
  const originalInitTransaction = activeDb.transaction.bind(activeDb);
  activeDb.transaction = (stores: string | string[], mode?: IDBTransactionMode) => {
    const tx = originalInitTransaction(stores, mode);
    if (mode === 'readwrite' && stores === STORES.CHECKOUT_DRAFTS) {
      const originalStore = tx.objectStore.bind(tx);
      tx.objectStore = (name: string) => {
        const store = originalStore(name);
        const originalPut = store.put.bind(store);
        store.put = (value: any) => {
          const request = originalPut(value);
          if (value?.cart_snapshot) request.addEventListener('success', () => { try { tx.abort(); } catch { /* complete */ } });
          return request;
        };
        return store;
      };
    }
    return tx;
  };
  let interruptedRejected = false;
  try { await loadOrCreateDurableCart(interruptedContext, indexedDB); } catch (error: unknown) {
    interruptedRejected = error instanceof Error && error.message.includes('CHECKOUT_INITIALIZATION_FAILED');
  }
  activeDb.transaction = originalInitTransaction;
  const interruptedDraft = await getCheckoutDraft(`${ids.pharmacy}:${ids.branch}:${interruptedCashier}`, indexedDB);
  assert(interruptedRejected && interruptedDraft?.revision === 0 && interruptedDraft.cart_snapshot === null,
    'interrupted initial snapshot persistence fails visibly without an unbounded retry');
  assert((await loadOrCreateDurableCart(interruptedContext, indexedDB)).draft_revision === 1,
    'explicit retry completes an interrupted fresh initialization');
  const scopeToken = capturePosScope(1, first.scope_key);
  assert(isPosScopeCurrent(scopeToken, 1, first.scope_key) && !isPosScopeCurrent(scopeToken, 2, first.scope_key) &&
    !isPosScopeCurrent(scopeToken, 1, `${first.scope_key}:changed`),
    'delayed POS work is rejected after either generation or scope changes');
  let retirementResolve!: () => void;
  const delayedRetirement = new Promise<void>((resolve) => { retirementResolve = resolve; });
  let retirementGeneration = 1;
  let retirementScope: string | null = first.scope_key;
  const retirementTask = runPosScopeBoundTask(
    capturePosScope(retirementGeneration, first.scope_key),
    () => isPosScopeCurrent(scopeToken, retirementGeneration, retirementScope),
    () => delayedRetirement,
  );
  retirementGeneration += 1; // entitlement change reinitializes the mounted POS scope generation
  retirementScope = `${first.scope_key}:replacement`;
  retirementResolve();
  assert(!(await retirementTask).accepted, 'delayed restricted retirement success cannot clear a replacement scope after entitlement and scope changes');
  let retirementReject!: (reason: unknown) => void;
  const delayedRetirementFailure = new Promise<void>((_resolve, reject) => { retirementReject = reject; });
  const unmountGeneration = retirementGeneration;
  const unmountToken = capturePosScope(unmountGeneration, retirementScope);
  const retirementFailureTask = runPosScopeBoundTask(
    unmountToken,
    () => isPosScopeCurrent(unmountToken, retirementGeneration, retirementScope),
    () => delayedRetirementFailure,
  );
  retirementGeneration += 1; // unmount invalidation
  retirementReject(new Error('late retirement failure'));
  assert(!(await retirementFailureTask).accepted, 'delayed restricted retirement failure cannot populate an unmounted or replacement screen');
  const snapshotted = await saveCheckoutDraftSnapshot(expected(first), {
    marker: 'restorable', line_ids: ['stable-line'], checkout_scope_key: first.scope_key,
    checkout_intent_id: first.checkout_intent_id, client_op_id: first.client_op_id, sale_id: first.sale_id,
    pharmacy_id: first.pharmacy_id, branch_id: first.branch_id, cashier_id: first.cashier_id,
    client_created_at: first.client_created_at, draft_revision: first.revision
  }, indexedDB);
  closeOfflineDb();
  const remounted = await getCheckoutDraft(first.scope_key, indexedDB);
  assert(remounted?.cart_snapshot?.marker === 'restorable', 'draft survives close/remount');

  const secondCashier = 'cccccccc-cccc-4ccc-8ccc-cccccccccccd';
  const staleA = await getOrCreateCheckoutDraft({ pharmacy_id: ids.pharmacy, branch_id: ids.branch, cashier_id: secondCashier }, indexedDB);
  const staleB = structuredClone(staleA);
  const staleSnapshot = {
    checkout_scope_key: staleA.scope_key, checkout_intent_id: staleA.checkout_intent_id,
    client_op_id: staleA.client_op_id, sale_id: staleA.sale_id, pharmacy_id: staleA.pharmacy_id,
    branch_id: staleA.branch_id, cashier_id: staleA.cashier_id, client_created_at: staleA.client_created_at,
    draft_revision: staleA.revision
  };
  const currentDraft = await saveCheckoutDraftSnapshot(expected(staleA), staleSnapshot, indexedDB);
  let staleWriteRejected = false;
  try { await saveCheckoutDraftSnapshot(expected(staleB), staleSnapshot, indexedDB); } catch { staleWriteRejected = true; }
  let staleCancelRejected = false;
  try { await cancelCheckoutDraft(expected(staleB), indexedDB); } catch { staleCancelRejected = true; }
  assert(staleWriteRejected && staleCancelRejected, 'stale competing tab cannot overwrite or cancel a newer draft revision');
  await cancelCheckoutDraft(expected(currentDraft), indexedDB);
  const cancelledMarker = await getCheckoutDraft(staleA.scope_key, indexedDB);
  assert(cancelledMarker?.state === 'CANCELLED',
    'cancelled checkout leaves a durable retired owner marker');
  let currentCancelledFreezeRejected = false;
  try { await freezeCheckoutDraftTransaction(expected(cancelledMarker!), unifiedPayload(cancelledMarker!.client_op_id,
    cancelledMarker!.sale_id, cancelledMarker!.checkout_intent_id, cancelledMarker!.client_created_at), indexedDB); }
  catch { currentCancelledFreezeRejected = true; }
  assert(currentCancelledFreezeRejected, 'atomic first freeze rejects CANCELLED ownership even at its current revision');
  const replacement = await getOrCreateCheckoutDraft({ pharmacy_id: ids.pharmacy, branch_id: ids.branch, cashier_id: secondCashier }, indexedDB);
  let staleResurrectionRejected = false;
  try { await freezeCheckoutDraftTransaction(expected(currentDraft), unifiedPayload(currentDraft.client_op_id, currentDraft.sale_id,
    currentDraft.checkout_intent_id, currentDraft.client_created_at), indexedDB); } catch { staleResurrectionRejected = true; }
  assert(staleResurrectionRejected && replacement.client_op_id !== currentDraft.client_op_id,
    'stale finalization cannot recreate a cancelled checkout over its explicit replacement');
  const missingIdentity = { scope_key: `${ids.pharmacy}:${ids.branch}:ffffffff-ffff-4fff-8fff-ffffffffffff`,
    checkout_intent_id: crypto.randomUUID(), client_op_id: crypto.randomUUID(), sale_id: crypto.randomUUID(), revision: 0 };
  let missingDraftRejected = false;
  try { await freezeCheckoutDraftTransaction(expected(missingIdentity), unifiedPayload(missingIdentity.client_op_id,
    missingIdentity.sale_id, missingIdentity.checkout_intent_id), indexedDB); } catch { missingDraftRejected = true; }
  assert(missingDraftRejected && await getCheckoutDraft(missingIdentity.scope_key, indexedDB) === null,
    'finalization of a missing checkout cannot create a new draft');

  const wrongPayload = unifiedPayload(first.client_op_id, crypto.randomUUID(), first.checkout_intent_id, first.client_created_at);
  let wrongRejected = false;
  try { await freezeCheckoutDraftTransaction(expected(snapshotted), wrongPayload, indexedDB); } catch { wrongRejected = true; }
  assert(wrongRejected && (await getCheckoutDraft(first.scope_key, indexedDB))?.state === 'DRAFT', 'identity validation aborts the whole freeze');

  const payload = unifiedPayload(first.client_op_id, first.sale_id, first.checkout_intent_id, first.client_created_at);
  console.log('Phase B: atomic freeze and retry');
  const frozen = await freezeCheckoutDraftTransaction(expected(snapshotted), payload, indexedDB);
  console.log('Phase B: first freeze complete');
  const retried = await freezeCheckoutDraftTransaction(expected(snapshotted), { ...payload, total: 999999 }, indexedDB);
  console.log('Phase B: retry retrieval complete');
  assert(frozen.created && !retried.created && retried.transaction.id === frozen.transaction.id,
    'retry retrieves the first durable operation without replacing its bytes or hash');
  assert(retried.transaction.payload_hash === frozen.transaction.payload_hash && retried.transaction.payload.total === 100,
    'first payload/hash remain frozen');
  const validRecovery = await getExistingDurableCheckoutSale({ scope_key: first.scope_key,
    checkout_intent_id: first.checkout_intent_id, client_op_id: first.client_op_id,
    sale_id: first.sale_id, pharmacy_id: first.pharmacy_id }, indexedDB);
  assert(validRecovery?.sale?.created_at === first.client_created_at && validRecovery.transaction?.id === frozen.transaction.id,
    'valid recovery recomputes matching digests and preserves the frozen creation time and IDs');
  const originalDraft = structuredClone((await getCheckoutDraft(first.scope_key, indexedDB))!);
  const originalFrozenTransaction = structuredClone((await getLocalTransaction(first.pharmacy_id, first.client_op_id, indexedDB))!);
  await rewriteFrozenEvidence(first.scope_key, (draft, transaction) => {
    draft.frozen_payload.total = 999;
    transaction.payload.total = 999;
  });
  let matchingCorruptionRejected = false;
  try { await getExistingDurableCheckoutSale({ scope_key: first.scope_key, checkout_intent_id: first.checkout_intent_id,
    client_op_id: first.client_op_id, sale_id: first.sale_id, pharmacy_id: first.pharmacy_id }, indexedDB); }
  catch { matchingCorruptionRejected = true; }
  assert(matchingCorruptionRejected && (await getLocalTransaction(first.pharmacy_id, first.client_op_id, indexedDB))?.id === originalFrozenTransaction.id,
    'matching corrupted payload copies with stale hashes fail recovery without rewriting IDs');
  await rewriteFrozenEvidence(first.scope_key, (draft, transaction) => {
    Object.assign(draft, structuredClone(originalDraft)); Object.assign(transaction, structuredClone(originalFrozenTransaction));
    draft.payload_hash = 'b'.repeat(64); transaction.payload_hash = 'b'.repeat(64);
  });
  let staleHashesRejected = false;
  try { await getExistingDurableCheckoutSale({ scope_key: first.scope_key, checkout_intent_id: first.checkout_intent_id,
    client_op_id: first.client_op_id, sale_id: first.sale_id, pharmacy_id: first.pharmacy_id }, indexedDB); }
  catch { staleHashesRejected = true; }
  assert(staleHashesRejected, 'matching stale draft/transaction hashes fail recomputed digest validation');
  await rewriteFrozenEvidence(first.scope_key, (draft, transaction) => {
    Object.assign(draft, structuredClone(originalDraft)); Object.assign(transaction, structuredClone(originalFrozenTransaction));
    draft.frozen_payload.total = 777;
  });
  let mismatchedCopiesRejected = false;
  try { await getExistingDurableCheckoutSale({ scope_key: first.scope_key, checkout_intent_id: first.checkout_intent_id,
    client_op_id: first.client_op_id, sale_id: first.sale_id, pharmacy_id: first.pharmacy_id }, indexedDB); }
  catch { mismatchedCopiesRejected = true; }
  assert(mismatchedCopiesRejected, 'mismatched frozen draft and transaction payload copies fail closed');
  await rewriteFrozenEvidence(first.scope_key, (draft, transaction) => {
    Object.assign(draft, structuredClone(originalDraft)); Object.assign(transaction, structuredClone(originalFrozenTransaction));
  });
  let durableCancelRejected = false;
  try { await cancelCheckoutDraft(expected(frozen.draft), indexedDB); } catch { durableCancelRejected = true; }
  console.log('Phase B: durable cancellation rejected');
  assert(durableCancelRejected, 'durable unresolved checkout cannot be cancelled');
  await acknowledgeCheckoutDraft(expected(frozen.draft), indexedDB);
  const acknowledgedMarker = await getCheckoutDraft(first.scope_key, indexedDB);
  assert(acknowledgedMarker?.state === 'ACKNOWLEDGED',
    'acknowledgement retires the UI owner without deleting its marker');
  let acknowledgedFreezeRejected = false;
  try { await freezeCheckoutDraftTransaction(expected(acknowledgedMarker!), payload, indexedDB); }
  catch { acknowledgedFreezeRejected = true; }
  assert(acknowledgedFreezeRejected && (await getLocalTransaction(ids.pharmacy, first.client_op_id, indexedDB))?.id === frozen.transaction.id,
    'atomic freeze rejects ACKNOWLEDGED ownership while preserving frozen transaction records');
  assert((await getLocalTransaction(ids.pharmacy, first.client_op_id, indexedDB))?.payload_hash === frozen.transaction.payload_hash,
    'acknowledgement preserves unresolved immutable operation');
  const restrictedAfterAcknowledgement = await loadExistingDurableCart({
    pharmacy_id: ids.pharmacy, branch_id: ids.branch, cashier_id: ids.cashier,
    authenticated_user_id: ids.cashier, currency: 'NGN'
  }, indexedDB);
  assert(restrictedAfterAcknowledgement === null && (await getCheckoutDraft(first.scope_key, indexedDB))?.state === 'ACKNOWLEDGED',
    'restricted acknowledgement does not silently initialize an eligible replacement sale');
  const next = await getOrCreateCheckoutDraft({ pharmacy_id: ids.pharmacy, branch_id: ids.branch, cashier_id: ids.cashier }, indexedDB);
  assert(next.client_op_id !== first.client_op_id, 'new customer receives a new reserved operation');
  await cancelCheckoutDraft(expected(next), indexedDB);
  assert((await getCheckoutDraft(next.scope_key, indexedDB))?.state === 'CANCELLED', 'unfrozen draft cancellation is durable');

  await resolveOperationAtomically(ids.pharmacy, first.client_op_id, {
    queue_status: 'COMMITTED', transaction_status: 'COMMITTED', expected_queue_statuses: ['PENDING'], expected_revision: 0, result: {
      pharmacy_id: ids.pharmacy, client_op_id: first.client_op_id, response_status: '200 OK', server_status: 'COMMITTED',
      processed_at: new Date().toISOString(), resolved_at: Date.now(), operation_kind: 'UNIFIED_SALE_V1',
      sale_id: first.sale_id, checkout_intent_id: first.checkout_intent_id, payload_hash: frozen.transaction.payload_hash
    }
  }, indexedDB);
  assert((await getQueueItem(ids.pharmacy, first.client_op_id, indexedDB))?.status === 'COMMITTED' &&
    (await getOperationResult(ids.pharmacy, first.client_op_id, indexedDB))?.sale_id === first.sale_id,
    'validated queue, transaction and result resolution commits atomically');

  let delayedAbsentRejected = false;
  try {
    await resolveOperationAtomically(ids.pharmacy, first.client_op_id, {
      queue_status: 'RETRYABLE', transaction_status: 'PENDING', expected_queue_statuses: ['PENDING'], expected_revision: 0
    }, indexedDB);
  } catch { delayedAbsentRejected = true; }
  assert(delayedAbsentRejected && (await getQueueItem(ids.pharmacy, first.client_op_id, indexedDB))?.status === 'COMMITTED',
    'delayed absence cannot overwrite a terminal committed resolution');

  const rollbackOp = crypto.randomUUID();
  const rollback = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: rollbackOp,
    payload: unifiedPayload(rollbackOp, crypto.randomUUID(), crypto.randomUUID()) }, indexedDB);
  let invalidResultRejected = false;
  try {
    await resolveOperationAtomically(ids.pharmacy, rollbackOp, {
      queue_status: 'COMMITTED', transaction_status: 'COMMITTED', expected_queue_statuses: ['PENDING'], expected_revision: 0,
      result: { pharmacy_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', client_op_id: rollbackOp,
        response_status: 'COMMITTED', server_status: 'COMMITTED', processed_at: new Date().toISOString(), resolved_at: Date.now() }
    }, indexedDB);
  } catch { invalidResultRejected = true; }
  assert(invalidResultRejected && (await getQueueItem(ids.pharmacy, rollbackOp, indexedDB))?.status === 'PENDING' &&
    (await getLocalTransaction(ids.pharmacy, rollbackOp, indexedDB))?.status === 'PENDING',
    'invalid result aborts queue and transaction updates together');

  const device = await createDeviceIdentity();
  const missingOp = crypto.randomUUID();
  const missing = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: missingOp,
    payload: unifiedPayload(missingOp, crypto.randomUUID(), crypto.randomUUID()) }, indexedDB);
  await new Promise<void>((resolve, reject) => {
    void openOfflineDb(indexedDB).then((activeDb) => {
    const deleteTx = activeDb.transaction(STORES.TRANSACTIONS, 'readwrite');
    deleteTx.objectStore(STORES.TRANSACTIONS).delete(missing.transaction.id);
    deleteTx.oncomplete = () => resolve(); deleteTx.onerror = () => reject(deleteTx.error);
    }, reject);
  });
  let missingRejected = false;
  try {
    await resolveOperationAtomically(ids.pharmacy, missingOp, {
      queue_status: 'COMMITTED', transaction_status: 'COMMITTED', expected_queue_statuses: ['PENDING'], expected_revision: 0
    }, indexedDB);
  } catch { missingRejected = true; }
  assert(missingRejected && (await getQueueItem(ids.pharmacy, missingOp, indexedDB))?.status === 'PENDING',
    'missing transaction rejects resolution without mutating the surviving queue record');
  let orphanNetworkCalled = false;
  const orphanDispatcher = new SyncDispatcher({ fetchFn: async () => {
    orphanNetworkCalled = true; return new Response('{}');
  } }, indexedDB);
  assert((await orphanDispatcher.dispatchOne(missing.queueItem, device, 'synthetic-token')).status === 'RECOVERY_REQUIRED' &&
    (await getQueueItem(ids.pharmacy, missingOp, indexedDB))?.status === 'RECOVERY_REQUIRED' && !orphanNetworkCalled,
    'dispatcher CAS-quarantines an orphan queue record without network transmission');

  const leaseOp = crypto.randomUUID();
  const leased = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: leaseOp,
    payload: unifiedPayload(leaseOp, crypto.randomUUID(), crypto.randomUUID()) }, indexedDB);
  const acquired = await acquireQueueLease(ids.pharmacy, leaseOp, 0, indexedDB);
  assert(acquired.acquired && !!acquired.item?.lease_token && (acquired.item?.revision || 0) === 1,
    'queue lease carries a unique token and monotonic revision');
  assert((await acquireQueueLease(ids.pharmacy, leaseOp, 0, indexedDB)).reason === 'RECONCILIATION_REQUIRED',
    'even an expired SYNCING lease cannot authorize a resend');

  const abortLeaseOp = crypto.randomUUID();
  const abortLease = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: abortLeaseOp,
    payload: unifiedPayload(abortLeaseOp, crypto.randomUUID(), crypto.randomUUID()) }, indexedDB);
  const dbAny = (await openOfflineDb(indexedDB)) as any;
  const originalTransaction = dbAny.transaction.bind(dbAny);
  dbAny.transaction = (stores: string | string[], mode?: IDBTransactionMode) => {
    const tx = originalTransaction(stores, mode);
    if (mode === 'readwrite' && (stores === STORES.QUEUE || (Array.isArray(stores) && stores.length === 1 && stores[0] === STORES.QUEUE))) {
      const originalObjectStore = tx.objectStore.bind(tx);
      tx.objectStore = (name: string) => {
        const store = originalObjectStore(name);
        const originalPut = store.put.bind(store);
        store.put = (value: unknown) => {
          const request = originalPut(value);
          request.addEventListener('success', () => { try { tx.abort(); } catch { /* already complete */ } });
          return request;
        };
        return store;
      };
    }
    return tx;
  };
  let abortRejected = false;
  let abortTransmissions = 0;
  try {
    const abortDispatcher = new SyncDispatcher({ fetchFn: async () => { abortTransmissions++; return new Response('{}'); } }, indexedDB);
    await abortDispatcher.dispatchOne(abortLease.queueItem, device, 'synthetic-token');
  } catch { abortRejected = true; }
  dbAny.transaction = originalTransaction;
  assert(abortRejected && abortTransmissions === 0 && (await getQueueItem(ids.pharmacy, abortLeaseOp, indexedDB))?.status === 'PENDING',
    'post-request lease transaction abort rejects predictably and dispatch performs zero transmission');

  const conflictOp = crypto.randomUUID();
  const conflictTx = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: conflictOp,
    payload: unifiedPayload(conflictOp, crypto.randomUUID(), crypto.randomUUID()) }, indexedDB);
  let conflictTransmissions = 0;
  const conflictDispatcher = new SyncDispatcher({ fetchFn: async () => {
    conflictTransmissions++;
    return new Response(JSON.stringify({ error: 'Checkout intent conflicts with an existing sale', error_code: 'CHECKOUT_CONFLICT' }),
      { status: 409, headers: { 'Content-Type': 'application/json' } });
  } }, indexedDB);
  const conflictResult = await conflictDispatcher.dispatchOne(conflictTx.queueItem, device, 'synthetic-token');
  await conflictDispatcher.dispatchOne(conflictTx.queueItem, device, 'synthetic-token');
  assert(conflictResult.status === 'CONFLICT' && conflictTransmissions === 1 &&
    (await getQueueItem(ids.pharmacy, conflictOp, indexedDB))?.status === 'CONFLICT',
    'known checkout conflict is terminal for automatic dispatch and cannot enter an absence/resend cycle');

  console.log('Phase B: dispatcher uncertainty and operation-specific validation');
  const ambiguousOp = crypto.randomUUID();
  const ambiguousSale = crypto.randomUUID();
  const ambiguousCheckout = crypto.randomUUID();
  const ambiguous = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: ambiguousOp,
    payload: unifiedPayload(ambiguousOp, ambiguousSale, ambiguousCheckout) }, indexedDB);
  let sends = 0;
  const noResolver = new SyncDispatcher({ fetchFn: async () => { sends++; throw new Error('response lost'); } }, indexedDB);
  const lost = await noResolver.dispatchOne(ambiguous.queueItem, device, 'synthetic-token');
  assert(lost.status === 'UNCERTAIN', 'response loss becomes UNCERTAIN');
  await noResolver.recoverStaleOperations(ids.pharmacy, 0);
  assert(sends === 1 && (await getQueueItem(ids.pharmacy, ambiguousOp, indexedDB))?.status === 'UNCERTAIN',
    'missing resolver fails closed and never automatically resends');
  for (let attempt = 0; attempt < 8; attempt++) await noResolver.recoverStaleOperations(ids.pharmacy, 0);
  assert((await getQueueItem(ids.pharmacy, ambiguousOp, indexedDB))?.status === 'RECOVERY_REQUIRED',
    'automatic reconciliation is bounded and preserves unresolved work for manual recovery');

  const outcomeProbe = new SyncDispatcher({ rpcGetClientOpStatus: async (pharmacy, op) => ({
    pharmacy_id: pharmacy,
    outcome: 'IN_PROGRESS', client_op_id: op, operation_kind: 'UNIFIED_SALE_V1', payload_hash: 'a'.repeat(64),
    sale_id: null, checkout_intent_id: null, response_status: 'IN_PROGRESS', response_payload: null, processed_at: null,
    record_id: null, return_id: null
  }) }, indexedDB);
  assert((await outcomeProbe.resolveAmbiguousOperation(ids.pharmacy, ambiguousOp)).outcome === 'IN_PROGRESS',
    'status-v2 keeps IN_PROGRESS distinct from absence and conflict');

  const malformedOp = crypto.randomUUID();
  const malformed = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: malformedOp,
    payload: unifiedPayload(malformedOp, crypto.randomUUID(), crypto.randomUUID()) }, indexedDB);
  const malformedDispatcher = new SyncDispatcher({ fetchFn: async () => new Response(JSON.stringify({ success: true }), { status: 200 }) }, indexedDB);
  assert((await malformedDispatcher.dispatchOne(malformed.queueItem, device, 'synthetic-token')).status === 'UNCERTAIN',
    'malformed HTTP 200 never implies commit');

  const legacy = await createLocalTransaction({ pharmacy_id: ids.pharmacy,
    payload: { sale_id: crypto.randomUUID(), product_id: ids.product, batch_id: ids.batch, quantity: 1 } }, indexedDB);
  let legacySent = false;
  const legacyDispatcher = new SyncDispatcher({ fetchFn: async () => { legacySent = true; return new Response('{}'); } }, indexedDB);
  assert((await legacyDispatcher.dispatchOne(legacy.queueItem, device, 'synthetic-token')).status === 'RECOVERY_REQUIRED' && !legacySent,
    'incomplete legacy sale is quarantined without treating stock evidence as financial completion');

  const refundOp = crypto.randomUUID();
  const refund = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: refundOp, transaction_type: 'SALE_RETURN', payload: {
    contract_version: 2, branch_id: ids.branch, sale_id: crypto.randomUUID(), items: [{ quantity: 1 }],
    expected_refund_amount_minor: 100, original_payment_method: 'CASH'
  } }, indexedDB);
  const processedAt = new Date().toISOString();
  const refundDispatcher = new SyncDispatcher({ fetchFn: async () => new Response(JSON.stringify({
    operation_status: 'COMMITTED', client_op_id: refundOp, return_id: crypto.randomUUID(), processed_at: processedAt, contract_version: 2
  }), { status: 200 }) }, indexedDB);
  assert((await refundDispatcher.dispatchOne(refund.queueItem, device, 'synthetic-token')).status === 'COMMITTED',
    'shared dispatcher preserves Refund V2 success contract with operation-specific validation');

  const lostRefundOp = crypto.randomUUID();
  const lostRefundSale = crypto.randomUUID();
  const lostRefundId = crypto.randomUUID();
  const lostRefund = await createLocalTransaction({ pharmacy_id: ids.pharmacy, client_op_id: lostRefundOp,
    transaction_type: 'SALE_RETURN', payload: { contract_version: 2, branch_id: ids.branch,
      sale_id: lostRefundSale, items: [{ quantity: 1 }], expected_refund_amount_minor: 100,
      original_payment_method: 'CASH' } }, indexedDB);
  const refundRecovery = new SyncDispatcher({
    fetchFn: async () => { throw new Error('response lost after commit'); },
    rpcGetClientOpStatus: async (pharmacy, op) => ({
      outcome: 'CONFIRMED_COMMITTED', pharmacy_id: pharmacy, client_op_id: op,
      operation_kind: 'SALE_RETURN_V2', payload_hash: lostRefund.transaction.payload_hash,
      sale_id: lostRefundSale, checkout_intent_id: null, response_status: 'COMMITTED',
      response_payload: { operation_status: 'COMMITTED', client_op_id: op, return_id: lostRefundId,
        sale_id: lostRefundSale, contract_version: 2, processed_at: processedAt },
      processed_at: processedAt, record_id: lostRefundId, return_id: lostRefundId
    })
  }, indexedDB);
  assert((await refundRecovery.dispatchOne(lostRefund.queueItem, device, 'synthetic-token')).status === 'UNCERTAIN',
    'Refund V2 response loss remains uncertain');
  await refundRecovery.recoverStaleOperations(ids.pharmacy, 0);
  assert((await getQueueItem(ids.pharmacy, lostRefundOp, indexedDB))?.status === 'COMMITTED',
    'Refund V2 commits only after operation-specific authoritative evidence');

  closeOfflineDb();
  const blockedFactory = new IDBFactory();
  const blocker = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = blockedFactory.open('pharmacyflow_offline_v1', 3);
    request.onupgradeneeded = () => undefined;
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  blocker.onversionchange = () => undefined;
  setIdbFactory(blockedFactory);
  let blockedUpgradeRejected = false;
  try { await openOfflineDb(blockedFactory); } catch (error: unknown) {
    blockedUpgradeRejected = error instanceof Error && error.message.includes('blocked by another open PharmacyFlow tab');
  }
  assert(blockedUpgradeRejected, 'blocked v4 upgrade fails visibly instead of hanging or deleting storage');
  blocker.close();
  const statusV2Sql = readFileSync(new URL('../../../supabase/migrations/20261014000026_client_operation_status_v2.sql', import.meta.url), 'utf8');
  assert(statusV2Sql.includes("v_management := v_member_role IN ('OWNER', 'MANAGER', 'PHARMACIST')") &&
    statusV2Sql.includes('v_sale.cashier_id <> auth.uid()'),
    'status-v2 source preserves management visibility and cashier-own-sale authorization');
  assert(statusV2Sql.includes('v_return.authorized_by IS DISTINCT FROM auth.uid()') &&
    statusV2Sql.includes('s.cashier_id = auth.uid()'),
    'status-v2 source preserves authorized-return and original-cashier visibility');
  assert(statusV2Sql.includes("RAISE EXCEPTION 'OPERATION_STATUS_FORBIDDEN'") &&
    statusV2Sql.indexOf("RETURN QUERY SELECT 'CONFIRMED_ABSENT'") > statusV2Sql.indexOf('SELECT s.* INTO v_sale'),
    'status-v2 checks inaccessible existing operations before authorized absence');

  console.log(`Phase B synthetic acceptance: ${passed}/${passed} passed`);
}

run().catch((error) => { console.error(error); process.exitCode = 1; });
