/**
 * PharmacyFlow POS Transaction Orchestration Service (Phase 5D-5)
 * 
 * Coordinates POS cart validation, catalog freshness verification, and atomic sale creation
 * through Phase 5D-3 local sales domain and Phase 5D-2 durable queue.
 * 
 * ARCHITECTURAL INVARIANT:
 * This layer does NOT perform network dispatches. Final sale persistence is committed
 * to IndexedDB via createLocalSale(), and synchronization is handled asynchronously
 * by the Phase 5D-2 SyncDispatcher.
 */

import { PosCart, FinalizeSaleOptions, FinalizeSaleResult, CatalogFreshnessStatus } from './types';
import { ALLOWED_PAYMENT_METHODS, CreateSaleInput } from '../sales/types';
import { createLocalSale, getExistingDurableCheckoutSale } from '../sales/service';
import { ensureDurableCartReservation } from './drafts';
import {
  getProductById,
  getBatchesForProduct,
  computeExpiryInfo,
  getInventorySnapshotMetadata,
  isSnapshotStale
} from '../inventory/index';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isValidUuid = (value: unknown): boolean => {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value.trim());
};

/**
 * Checks the freshness of the local inventory catalog read model for the pharmacy.
 */
export const checkCatalogFreshness = async (
  pharmacyId: string,
  customFactory?: IDBFactory
): Promise<CatalogFreshnessStatus> => {
  const meta = await getInventorySnapshotMetadata(pharmacyId, customFactory);
  const isStale = isSnapshotStale(meta);

  return {
    isStale,
    syncedAt: meta ? meta.synced_at : null,
    sourceUpdatedAt: meta ? meta.source_updated_at : null,
    productCount: meta ? meta.product_count : 0,
    batchCount: meta ? meta.batch_count : 0
  };
};

/**
 * Validates and finalizes an in-memory POS cart into a durable offline sale transaction.
 */
export const finalizePosSale = async (
  cart: PosCart,
  options: FinalizeSaleOptions,
  customFactory?: IDBFactory
): Promise<FinalizeSaleResult> => {
  const errors: string[] = [];

  // 1. Session Context Validation
  if (!isValidUuid(cart.pharmacy_id)) {
    errors.push(`Invalid pharmacy_id: ${cart.pharmacy_id}`);
  }
  if (!isValidUuid(cart.branch_id)) {
    errors.push(`Invalid branch_id: ${cart.branch_id}`);
  }
  if (!isValidUuid(cart.cashier_id)) {
    errors.push(`Invalid cashier_id: ${cart.cashier_id} (must be authenticated auth.users(id))`);
  }

  // Explicitly verify that cashier_id matches authenticated session user if supplied
  if (options.authenticated_user_id) {
    if (!isValidUuid(options.authenticated_user_id)) {
      errors.push(`Invalid authenticated_user_id: ${options.authenticated_user_id}`);
    } else {
      const normAuth = options.authenticated_user_id.toLowerCase().trim();
      const normCashier = cart.cashier_id.toLowerCase().trim();
      if (normCashier !== normAuth) {
        errors.push(
          `Cashier identity mismatch: cart cashier_id [${cart.cashier_id}] does not match authenticated user [${options.authenticated_user_id}]`
        );
      }
    }
  }

  if (options.client_op_id && !isValidUuid(options.client_op_id)) {
    errors.push(`Invalid client_op_id: ${options.client_op_id}`);
  } else if (options.client_op_id && options.client_op_id.toLowerCase().trim() !== cart.client_op_id) {
    errors.push('client_op_id is already reserved by the durable checkout and cannot be replaced');
  }

  if (errors.length > 0) return { success: false, errors };

  // A prior attempt may have frozen successfully before the UI observed the result. Retrieve it
  // after identity/session checks but before mutable cart, customer, payment or catalog validation.
  try {
    const existing = await getExistingDurableCheckoutSale({
      scope_key: cart.checkout_scope_key,
      checkout_intent_id: cart.checkout_intent_id,
      client_op_id: cart.client_op_id,
      sale_id: cart.sale_id,
      pharmacy_id: cart.pharmacy_id
    }, customFactory);
    if (existing) return {
      success: true, sale: existing.sale, transaction: existing.transaction,
      queueItem: existing.queueItem, checkoutRevision: existing.checkoutRevision
    };
    await ensureDurableCartReservation(cart, customFactory);
  } catch (error: unknown) {
    return { success: false, errors: [error instanceof Error ? error.message : 'Durable checkout recovery failed'] };
  }

  // 2. Mutable Cart Content Validation
  if (!Array.isArray(cart.line_items) || cart.line_items.length === 0) {
    errors.push('Cart is empty: at least one line item is required to finalize sale');
  }

  // 3. Payment Method Validation
  if (!ALLOWED_PAYMENT_METHODS.includes(options.payment_method)) {
    errors.push(`Invalid payment method: ${options.payment_method}. Allowed: ${ALLOWED_PAYMENT_METHODS.join(', ')}`);
  }

  if (options.customer_id && !isValidUuid(options.customer_id)) {
    errors.push(`Invalid customer_id: ${options.customer_id}`);
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // 4. In-Depth Line Item & Inventory Read-Model Verification
  for (let i = 0; i < cart.line_items.length; i++) {
    const line = cart.line_items[i];
    const prefix = `Line ${i + 1} (${line.product_name || line.product_id})`;

    if (!isValidUuid(line.product_id)) {
      errors.push(`${prefix}: Invalid product_id`);
      continue;
    }
    if (!isValidUuid(line.batch_id)) {
      errors.push(`${prefix}: Invalid batch_id`);
      continue;
    }
    if (typeof line.quantity !== 'number' || !Number.isInteger(line.quantity) || line.quantity <= 0) {
      errors.push(`${prefix}: Quantity must be a positive integer`);
      continue;
    }

    // Verify product exists in active pharmacy partition
    const product = await getProductById(cart.pharmacy_id, line.product_id, customFactory);
    if (!product) {
      errors.push(`${prefix}: Product does not exist in pharmacy ${cart.pharmacy_id}`);
      continue;
    }

    // Verify batch exists in active pharmacy partition and belongs to product
    const batches = await getBatchesForProduct(cart.pharmacy_id, line.product_id, undefined, customFactory);
    const matchedBatch = batches.find((b) => b.id.toLowerCase() === line.batch_id.toLowerCase().trim());

    if (!matchedBatch) {
      errors.push(`${prefix}: Batch ${line.batch_id} not found for product in pharmacy ${cart.pharmacy_id}`);
      continue;
    }

    if (matchedBatch.product_id !== line.product_id) {
      errors.push(`${prefix}: Batch ${line.batch_id} does not belong to product ${line.product_id}`);
      continue;
    }

    // Verify batch is not expired
    const expiry = computeExpiryInfo(matchedBatch.expiry_date);
    if (expiry.is_expired) {
      errors.push(`${prefix}: Batch ${matchedBatch.batch_number} has expired (${matchedBatch.expiry_date})`);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  // 5. Build CreateSaleInput for Phase 5D-3 local sales engine
  const saleInput: CreateSaleInput = {
    client_op_id: options.client_op_id || cart.client_op_id,
    checkout_intent_id: cart.checkout_intent_id,
    sale_id: cart.sale_id,
    client_created_at: cart.client_created_at,
    checkout_scope_key: cart.checkout_scope_key,
    checkout_revision: cart.draft_revision,
    pharmacy_id: cart.pharmacy_id,
    branch_id: cart.branch_id,
    cashier_id: cart.cashier_id,
    customer_id: options.customer_id || null,
    currency: cart.currency,
    payment_method: options.payment_method,
    amount_tendered: options.amount_tendered,
    payment_status: options.payment_status,
    line_items: cart.line_items.map((li) => ({
      id: li.id,
      product_id: li.product_id,
      batch_id: li.batch_id,
      quantity: li.quantity,
      unit_price: li.unit_price,
      discount: li.discount,
      tax: li.tax
    })),
    sale_discount: cart.sale_discount,
    sale_tax: cart.sale_tax
  };

  // 6. Execute atomic persistence through Phase 5D-3 sales service
  try {
    const saleResult = await createLocalSale(saleInput, customFactory);

    if (!saleResult.success) {
      return {
        success: false,
        errors: (saleResult.errors || []).map((e) => e.message)
      };
    }

    return {
      success: true,
      sale: saleResult.sale,
      transaction: saleResult.transaction,
      queueItem: saleResult.queueItem,
      checkoutRevision: saleResult.checkoutRevision
    };
  } catch (err: any) {
    return {
      success: false,
      errors: [err?.message || 'Failed to create local sale transaction']
    };
  }
};
