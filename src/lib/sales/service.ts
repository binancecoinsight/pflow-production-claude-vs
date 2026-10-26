/**
 * PharmacyFlow Local Sales Service (Phase 5D-3)
 * 
 * Coordinates sale validation, financial calculations, deterministic payload generation,
 * atomic IndexedDB transaction storage, and offline sync queue creation.
 */

import { CreateSaleInput, CreateSaleResult, Sale, SaleLineItem } from './types';
import { validateSaleInput } from './validation';
import { calculateSaleTotals } from './calculation';
import {
  createLocalTransaction, freezeCheckoutDraftTransaction, getCheckoutDraft, getLocalTransaction,
  getQueueItem, getTransactionsByPharmacy
} from '../offline/db';
import { canonicalizeJson, sha256Hex } from '../crypto/signing';

/**
 * Creates, validates, and atomically persists a sale locally, enqueueing it for synchronization.
 */
export const createLocalSale = async (
  input: CreateSaleInput,
  customFactory?: IDBFactory
): Promise<CreateSaleResult> => {
  // 1. Validation
  const validation = validateSaleInput(input);
  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors
    };
  }

  // 2. Identity & Context
  const pharmacyId = input.pharmacy_id.toLowerCase().trim();
  const branchId = input.branch_id.toLowerCase().trim();
  const cashierId = input.cashier_id.toLowerCase().trim();
  const customerId = input.customer_id ? input.customer_id.toLowerCase().trim() : null;
  const clientOpId = (input.client_op_id || crypto.randomUUID()).toLowerCase().trim();
  const checkoutIntentId = (input.checkout_intent_id || clientOpId).toLowerCase().trim();
  const saleId = (input.sale_id || crypto.randomUUID()).toLowerCase().trim();
  const now = input.client_created_at || Date.now();
  const currency = (input.currency || 'NGN').toUpperCase().trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutIntentId)) {
    return {
      success: false,
      errors: [{ field: 'checkout_intent_id', code: 'INVALID_CHECKOUT_INTENT_ID', message: 'checkout_intent_id must be a UUID' }]
    };
  }

  // 3. Deterministic Financial Calculations
  const totals = calculateSaleTotals(input.line_items, input.sale_discount, input.sale_tax);

  // 3b. Tender Integrity Validation & Calculations
  const isCash = input.payment_method === 'CASH';
  const amountTendered = isCash
    ? (input.amount_tendered !== undefined ? input.amount_tendered : totals.total)
    : totals.total;

  if (isCash && amountTendered < totals.total) {
    return {
      success: false,
      errors: [
        {
          field: 'amount_tendered',
          code: 'INSUFFICIENT_TENDER',
          message: `Amount tendered (${amountTendered}) cannot be less than sale total (${totals.total})`
        }
      ]
    };
  }

  const changeDue = isCash ? Math.max(0, amountTendered - totals.total) : 0;
  const paymentStatus = input.payment_status || 'SETTLED';

  // 4. Construct Immutable Domain Line Items
  const lineItems: SaleLineItem[] = input.line_items.map((item, idx) => ({
    id: item.id || crypto.randomUUID().toLowerCase(),
    product_id: item.product_id.toLowerCase().trim(),
    batch_id: item.batch_id.toLowerCase().trim(),
    quantity: item.quantity,
    unit_price: item.unit_price,
    discount: item.discount || 0,
    tax: item.tax || 0,
    line_total: totals.lineTotals[idx]
  }));

  // 5. Construct Complete Sale Domain Entity
  const sale: Sale = {
    id: saleId,
    client_op_id: clientOpId,
    checkout_intent_id: checkoutIntentId,
    pharmacy_id: pharmacyId,
    branch_id: branchId,
    cashier_id: cashierId,
    customer_id: customerId,
    currency,
    subtotal: totals.subtotal,
    discount: totals.totalDiscount,
    tax: totals.totalTax,
    total: totals.total,
    payment_method: input.payment_method,
    amount_tendered: amountTendered,
    change_due: changeDue,
    payment_status: paymentStatus,
    created_at: now,
    line_items: lineItems
  };

  // 6. Build Deterministic Transaction Payload for Storage & Cryptographic Hashing
  // Note: Top-level product_id, batch_id, quantity are populated from primary line item
  // to ensure 100% interoperability with single-line inventory movements while retaining
  // the full multi-item sale payload in line_items.
  const primaryLine = lineItems[0];
  const payload: Record<string, unknown> = {
    sale_id: sale.id,
    client_op_id: sale.client_op_id,
    checkout_intent_id: sale.checkout_intent_id,
    pharmacy_id: sale.pharmacy_id,
    branch_id: sale.branch_id,
    cashier_id: sale.cashier_id,
    customer_id: sale.customer_id,
    currency: sale.currency,
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    payment_method: sale.payment_method,
    amount_tendered: sale.amount_tendered,
    change_due: sale.change_due,
    payment_status: sale.payment_status,
    created_at: sale.created_at,
    product_id: primaryLine.product_id,
    batch_id: primaryLine.batch_id,
    quantity: primaryLine.quantity,
    line_items: lineItems.map((li) => ({
      id: li.id,
      product_id: li.product_id,
      batch_id: li.batch_id,
      quantity: li.quantity,
      unit_price: li.unit_price,
      discount: li.discount,
      tax: li.tax,
      line_total: li.line_total
    }))
  };

  // 7. Atomic Persistence via Phase 5D-2 Storage Engine
  // Canonicalizes JSON, computes immutable SHA-256 hash, and inserts local_transaction + sync_queue
  if (input.checkout_scope_key && input.checkout_revision === undefined) {
    return { success: false, errors: [{ field: 'checkout_revision', code: 'MISSING_CHECKOUT_REVISION', message: 'Durable checkout revision is required' }] };
  }
  if (!input.checkout_scope_key && input.compatibility_non_draft !== true) {
    return { success: false, errors: [{ field: 'checkout_scope_key', code: 'DURABLE_CHECKOUT_REQUIRED', message: 'Production sales require a durable checkout reservation' }] };
  }
  let persistence: Awaited<ReturnType<typeof freezeCheckoutDraftTransaction>> | Awaited<ReturnType<typeof createLocalTransaction>>;
  let checkoutRevision: number | undefined;
  if (input.checkout_scope_key) {
    const durable = await freezeCheckoutDraftTransaction({
        scope_key: input.checkout_scope_key,
        checkout_intent_id: checkoutIntentId,
        client_op_id: clientOpId,
        sale_id: saleId,
        expected_revision: input.checkout_revision!
      }, payload, customFactory);
    persistence = durable;
    checkoutRevision = durable.draft.revision;
  } else {
    persistence = await createLocalTransaction({
      pharmacy_id: pharmacyId,
      client_op_id: clientOpId,
      transaction_type: 'SALE_STOCK_MOVEMENT',
      payload: payload as unknown as {
        sale_id: string;
        product_id: string;
        batch_id: string;
        quantity: number;
        branch_id?: string;
        [key: string]: unknown;
      }
    }, customFactory);
  }
  const { transaction, queueItem } = persistence;

  if ('created' in persistence && !persistence.created) {
    const existingSale = await getLocalSale(pharmacyId, clientOpId, customFactory);
    if (!existingSale) throw new Error('Existing durable checkout is incomplete and requires recovery');
    return { success: true, sale: existingSale, transaction, queueItem, checkoutRevision };
  }

  return {
    success: true,
    sale,
    transaction,
    queueItem,
    checkoutRevision
  };
};

/** Retrieves a locally durable checkout before mutable catalog/payment validation. */
export const getExistingDurableCheckoutSale = async (
  identity: { scope_key: string; checkout_intent_id: string; client_op_id: string; sale_id: string; pharmacy_id: string },
  customFactory?: IDBFactory
): Promise<CreateSaleResult | null> => {
  const draft = await getCheckoutDraft(identity.scope_key, customFactory);
  if (!draft || draft.state !== 'LOCALLY_DURABLE') return null;
  if (draft.checkout_intent_id !== identity.checkout_intent_id || draft.client_op_id !== identity.client_op_id ||
      draft.sale_id !== identity.sale_id || draft.pharmacy_id !== identity.pharmacy_id ||
      !draft.transaction_id || !draft.queue_id || !draft.payload_hash || !draft.frozen_payload) {
    throw new Error('Durable checkout identity is incomplete or mismatched');
  }
  const [transaction, queueItem, sale] = await Promise.all([
    getLocalTransaction(draft.pharmacy_id, draft.client_op_id, customFactory),
    getQueueItem(draft.pharmacy_id, draft.client_op_id, customFactory),
    getLocalSale(draft.pharmacy_id, draft.client_op_id, customFactory)
  ]);
  const transactionDigest = transaction ? await sha256Hex(canonicalizeJson(transaction.payload)) : null;
  const draftDigest = await sha256Hex(canonicalizeJson(draft.frozen_payload));
  if (!transaction || !queueItem || !sale || transaction.id !== draft.transaction_id || queueItem.id !== draft.queue_id ||
      transactionDigest !== transaction.payload_hash || draftDigest !== draft.payload_hash || transactionDigest !== draftDigest ||
      transaction.payload_hash !== draft.payload_hash || canonicalizeJson(transaction.payload) !== canonicalizeJson(draft.frozen_payload) ||
      sale.id !== draft.sale_id || sale.checkout_intent_id !== draft.checkout_intent_id ||
      sale.client_op_id !== draft.client_op_id || sale.pharmacy_id !== draft.pharmacy_id ||
      sale.branch_id !== draft.branch_id || sale.cashier_id !== draft.cashier_id || sale.created_at !== draft.client_created_at) {
    throw new Error('Existing durable checkout is incomplete and requires recovery');
  }
  return { success: true, sale, transaction, queueItem, checkoutRevision: draft.revision };
};

/**
 * Reconstructs a Sale domain model from local storage by client_op_id.
 */
export const getLocalSale = async (
  pharmacyId: string,
  clientOpId: string,
  customFactory?: IDBFactory
): Promise<Sale | null> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normOp = clientOpId.toLowerCase().trim();
  const tx = await getLocalTransaction(normPharmacy, normOp, customFactory);

  if (!tx || tx.pharmacy_id !== normPharmacy) {
    return null;
  }

  const p = tx.payload;
  if (typeof p.sale_id !== 'string' || typeof p.checkout_intent_id !== 'string') return null;
  if (!Number.isFinite(p.created_at) || typeof p.branch_id !== 'string' || typeof p.cashier_id !== 'string' ||
      typeof p.currency !== 'string' || typeof p.subtotal !== 'number' || typeof p.discount !== 'number' ||
      typeof p.tax !== 'number' || typeof p.total !== 'number' || typeof p.payment_method !== 'string' ||
      typeof p.amount_tendered !== 'number' || typeof p.change_due !== 'number' || typeof p.payment_status !== 'string' ||
      !Array.isArray(p.line_items) || p.line_items.length === 0) return null;
  const lineItems: SaleLineItem[] = (p.line_items as SaleLineItem[]).map((li) => ({
        id: li.id,
        product_id: li.product_id,
        batch_id: li.batch_id,
        quantity: li.quantity,
        unit_price: li.unit_price,
        discount: li.discount,
        tax: li.tax,
        line_total: li.line_total
      }));
  if (lineItems.some((li) => typeof li.id !== 'string' || typeof li.product_id !== 'string' ||
      typeof li.batch_id !== 'string' || typeof li.quantity !== 'number' || typeof li.unit_price !== 'number' ||
      typeof li.discount !== 'number' || typeof li.tax !== 'number' || typeof li.line_total !== 'number')) return null;

  return {
    id: p.sale_id as string,
    client_op_id: tx.client_op_id,
    checkout_intent_id: p.checkout_intent_id,
    pharmacy_id: tx.pharmacy_id,
    branch_id: p.branch_id as string,
    cashier_id: p.cashier_id as string,
    customer_id: (p.customer_id as string | null) || null,
    currency: p.currency as string,
    subtotal: p.subtotal as number,
    discount: p.discount as number,
    tax: p.tax as number,
    total: p.total as number,
    payment_method: p.payment_method as Sale['payment_method'],
    amount_tendered: p.amount_tendered as number,
    change_due: p.change_due as number,
    payment_status: p.payment_status as Sale['payment_status'],
    created_at: p.created_at as number,
    line_items: lineItems
  };
};

/**
 * Retrieves all sales partitioned under a specific pharmacy.
 */
export const getSalesByPharmacy = async (
  pharmacyId: string,
  customFactory?: IDBFactory
): Promise<Sale[]> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const transactions = await getTransactionsByPharmacy(normPharmacy, customFactory);

  const sales: Sale[] = [];
  for (const tx of transactions) {
    if (tx.pharmacy_id === normPharmacy) {
      const p = tx.payload;
      const sale = await getLocalSale(normPharmacy, tx.client_op_id, customFactory);
      if (sale) sales.push(sale);
    }
  }

  return sales;
};
