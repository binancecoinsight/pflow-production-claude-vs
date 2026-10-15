/**
 * PharmacyFlow Local Sales Service (Phase 5D-3)
 * 
 * Coordinates sale validation, financial calculations, deterministic payload generation,
 * atomic IndexedDB transaction storage, and offline sync queue creation.
 */

import { CreateSaleInput, CreateSaleResult, Sale, SaleLineItem } from './types';
import { validateSaleInput } from './validation';
import { calculateSaleTotals } from './calculation';
import { createLocalTransaction, getLocalTransaction, getTransactionsByPharmacy } from '../offline/db';

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
  const saleId = crypto.randomUUID().toLowerCase();
  const now = Date.now();
  const currency = (input.currency || 'NGN').toUpperCase().trim();

  // 3. Deterministic Financial Calculations
  const totals = calculateSaleTotals(input.line_items, input.sale_discount, input.sale_tax);

  // 3b. Tender Integrity Validation & Calculations
  const isCash = input.payment_method === 'CASH';
  const amountTendered = isCash
    ? (input.amount_tendered !== undefined ? Math.floor(input.amount_tendered) : totals.total)
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
    quantity: Math.floor(item.quantity),
    unit_price: Math.floor(item.unit_price),
    discount: Math.floor(item.discount || 0),
    tax: Math.floor(item.tax || 0),
    line_total: totals.lineTotals[idx]
  }));

  // 5. Construct Complete Sale Domain Entity
  const sale: Sale = {
    id: saleId,
    client_op_id: clientOpId,
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
  const { transaction, queueItem } = await createLocalTransaction(
    {
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
    },
    customFactory
  );

  return {
    success: true,
    sale,
    transaction,
    queueItem
  };
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
  const lineItems: SaleLineItem[] = Array.isArray(p.line_items)
    ? (p.line_items as SaleLineItem[]).map((li) => ({
        id: li.id,
        product_id: li.product_id,
        batch_id: li.batch_id,
        quantity: li.quantity,
        unit_price: li.unit_price,
        discount: li.discount,
        tax: li.tax,
        line_total: li.line_total
      }))
    : [
        {
          id: crypto.randomUUID().toLowerCase(),
          product_id: p.product_id as string,
          batch_id: p.batch_id as string,
          quantity: p.quantity as number,
          unit_price: (p.subtotal as number) || 0,
          discount: 0,
          tax: 0,
          line_total: (p.total as number) || 0
        }
      ];

  return {
    id: p.sale_id as string,
    client_op_id: tx.client_op_id,
    pharmacy_id: tx.pharmacy_id,
    branch_id: (p.branch_id as string) || '',
    cashier_id: (p.cashier_id as string) || '',
    customer_id: (p.customer_id as string | null) || null,
    currency: (p.currency as string) || 'NGN',
    subtotal: (p.subtotal as number) || 0,
    discount: (p.discount as number) || 0,
    tax: (p.tax as number) || 0,
    total: (p.total as number) || 0,
    payment_method: (p.payment_method as Sale['payment_method']) || 'CASH',
    amount_tendered: typeof p.amount_tendered === 'number' ? p.amount_tendered : ((p.total as number) || 0),
    change_due: typeof p.change_due === 'number' ? p.change_due : 0,
    payment_status: (p.payment_status as Sale['payment_status']) || 'SETTLED',
    created_at: tx.created_at,
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
      sales.push({
        id: (p.sale_id as string) || tx.id,
        client_op_id: tx.client_op_id,
        pharmacy_id: tx.pharmacy_id,
        branch_id: (p.branch_id as string) || '',
        cashier_id: (p.cashier_id as string) || '',
        customer_id: (p.customer_id as string | null) || null,
        currency: (p.currency as string) || 'NGN',
        subtotal: (p.subtotal as number) || 0,
        discount: (p.discount as number) || 0,
        tax: (p.tax as number) || 0,
        total: (p.total as number) || 0,
        payment_method: (p.payment_method as Sale['payment_method']) || 'CASH',
        amount_tendered: typeof p.amount_tendered === 'number' ? p.amount_tendered : ((p.total as number) || 0),
        change_due: typeof p.change_due === 'number' ? p.change_due : 0,
        payment_status: (p.payment_status as Sale['payment_status']) || 'SETTLED',
        created_at: tx.created_at,
        line_items: Array.isArray(p.line_items) ? (p.line_items as SaleLineItem[]) : []
      });
    }
  }

  return sales;
};
