import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { indexedDB } from 'fake-indexeddb';
import {
  InventorySnapshot,
  getBatchesForProduct,
  replacePharmacyInventorySnapshot,
  submitStockIntake,
} from './index';
import { addItemToCart, finalizePosSale, loadOrCreateDurableCart } from '../pos/index';
import { getCheckoutDraft, getQueueItem, openOfflineDb, STORES, closeOfflineDb } from '../offline/index';
import { getLocalSale } from '../sales/index';
import { ProductDetailModal } from '../../components/inventory/ProductDetailModal';

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const rejects = async (action: () => Promise<unknown>): Promise<boolean> => {
  try {
    await action();
    return false;
  } catch {
    return true;
  }
};

const PHARMACY = '11111111-1111-4111-8111-111111111111';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const BRANCH = '33333333-3333-4333-8333-333333333333';
const CASHIER = '44444444-4444-4444-8444-444444444444';
const BATCH = '55555555-5555-4555-8555-555555555555';
const OTHER_BATCH = '66666666-6666-4666-8666-666666666666';
const snapshot: InventorySnapshot = {
  pharmacy_id: PHARMACY,
  products: [{ id: PRODUCT, name: 'Safe Product', selling_price: 100, cost_price: 50, status: 'ACTIVE' }],
  batches: [
    { id: BATCH, product_id: PRODUCT, branch_id: BRANCH, batch_number: 'VALID-1', expiry_date: '2099-01-01', quantity: 10, selling_price: 100, cost_price: 50, status: 'ACTIVE' },
    { id: OTHER_BATCH, product_id: PRODUCT, branch_id: BRANCH, batch_number: 'VALID-2', expiry_date: '2099-02-01', quantity: 20, selling_price: 100, cost_price: 50, status: 'ACTIVE' },
  ],
};

const db = await openOfflineDb(indexedDB);
await replacePharmacyInventorySnapshot(PHARMACY, snapshot, indexedDB);
const beforeRejectedSnapshot = await getBatchesForProduct(PHARMACY, PRODUCT, BRANCH, indexedDB);
const invalidSnapshot = { ...snapshot, batches: [{ ...snapshot.batches[0], expiry_date: '2099-02-30' }] };
assert(await rejects(() => replacePharmacyInventorySnapshot(PHARMACY, invalidSnapshot, indexedDB)), 'invalid snapshot rejects before its write transaction');
const afterRejectedSnapshot = await getBatchesForProduct(PHARMACY, PRODUCT, BRANCH, indexedDB);
assert(afterRejectedSnapshot.length === beforeRejectedSnapshot.length && afterRejectedSnapshot[0].expiry_date === beforeRejectedSnapshot[0].expiry_date, 'rejected snapshot preserves existing cached records');

let rpcCalls = 0;
const fakeClient = { rpc: async () => { rpcCalls += 1; return { data: null, error: null }; } };
const intakeResult = await submitStockIntake({
  pharmacy_id: PHARMACY, branch_id: BRANCH,
  items: [{ product_id: PRODUCT, batch_number: 'BAD', expiry_date: '2099-02-30', quantity: 1, cost_price: 1, selling_price: 2 }],
}, { customClient: fakeClient as never, customFactory: indexedDB, skipRefresh: true });
assert(!intakeResult.success && intakeResult.errorCode === 'INVALID_REQUEST' && rpcCalls === 0, 'invalid intake rejects before injected RPC executor access');

const transactionDone = (transaction: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error);
  transaction.onabort = () => reject(transaction.error);
});
const corruptBatchExpiry = async (batchId: string): Promise<void> => {
  const tx = db.transaction(STORES.BATCHES, 'readwrite');
  const store = tx.objectStore(STORES.BATCHES);
  const request = store.get(batchId);
  request.onsuccess = () => store.put({ ...request.result, expiry_date: '2099-02-30' });
  await transactionDone(tx);
};

const context = { pharmacy_id: PHARMACY, branch_id: BRANCH, cashier_id: CASHIER, authenticated_user_id: CASHIER, currency: 'NGN' };
let durableCart = await loadOrCreateDurableCart(context, indexedDB);
durableCart = await addItemToCart(durableCart, { product_id: PRODUCT, batch_id: BATCH }, indexedDB);
await corruptBatchExpiry(OTHER_BATCH);

const explicitOriginal = structuredClone(durableCart);
assert(await rejects(() => addItemToCart(durableCart, { product_id: PRODUCT, batch_id: OTHER_BATCH }, indexedDB)), 'explicit malformed batch selection fails');
assert(JSON.stringify(durableCart) === JSON.stringify(explicitOriginal), 'explicit selection failure leaves the existing cart unchanged');
assert(await rejects(() => addItemToCart(durableCart, { product_id: PRODUCT }, indexedDB)), 'one malformed candidate blocks automatic selection rather than choosing the valid batch');
assert(JSON.stringify(durableCart) === JSON.stringify(explicitOriginal), 'automatic selection failure leaves the existing cart unchanged');

await corruptBatchExpiry(BATCH);
const finalizeResult = await finalizePosSale(durableCart, { payment_method: 'CASH', authenticated_user_id: CASHIER }, indexedDB);
assert(!finalizeResult.success && Boolean(finalizeResult.errors?.some((error) => error.includes('expiry evidence is invalid'))), 'finalization returns controlled invalid-expiry failure');
assert(await getLocalSale(PHARMACY, durableCart.client_op_id, indexedDB) === null, 'invalid expiry creates no completed sale');
assert(await getQueueItem(PHARMACY, durableCart.client_op_id, indexedDB) === null, 'invalid expiry creates no financial queue operation');
const preservedDraft = await getCheckoutDraft(durableCart.checkout_scope_key, indexedDB);
assert(preservedDraft?.checkout_intent_id === durableCart.checkout_intent_id && preservedDraft.state === 'DRAFT', 'original unresolved checkout reservation and identities remain preserved');

const product = (await (async () => ({
  id: PRODUCT, pharmacy_id: PHARMACY, name: 'Safe Product', sku: null, barcode: null, generic_name: null,
  category: null, unit: null, selling_price: 100, cost_price: 50, status: 'ACTIVE', source_updated_at: null, synced_at: 1,
}))());
const unavailable = renderToStaticMarkup(
  <ProductDetailModal product={product} batches={[]} currency="NGN" canSeeCostPrice={false}
    batchEvidenceState="unavailable" onClose={() => undefined} />,
);
assert(unavailable.includes('Batch expiry evidence is unavailable or invalid'), 'inventory detail presents invalid evidence honestly');
assert(!unavailable.includes('No inventory batches recorded') && !unavailable.includes('Provisional FEFO Pick'), 'unavailable evidence is not rendered as empty or FEFO-confirmed');
assert((unavailable.match(/Unavailable/g) ?? []).length >= 2, 'batch count and projected quantity are unavailable rather than zero');

closeOfflineDb();
console.log(`sharedExpiryProductionPaths.test.tsx: ${passed} assertions passed`);
