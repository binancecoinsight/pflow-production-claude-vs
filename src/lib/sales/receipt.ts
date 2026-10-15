/**
 * PharmacyFlow Authoritative Receipt Domain & Presentation Read Model (Phase 5D-12)
 * 
 * Implements a read-only presentation model over authoritative sales transactions.
 * Invariants:
 * 1. A receipt is a pure projection/view of an authoritative sale or return.
 * 2. It never mutates sales, stock ledger, batches, returns, or payments.
 * 3. It never re-calculates client-authoritative totals; displays authoritative values.
 * 4. Strictly separates COMMITTED from PENDING SYNC states.
 * 5. Contains zero secrets, private keys, tokens, or unredacted internal metadata.
 */

import { PaymentMethod, Sale } from './types';
import { HistoricalSale } from './history';
import { ReturnRecord } from './returns';
import { Pharmacy, Branch } from '../../types/database';

export type ReceiptSyncStatus = 'COMMITTED' | 'PENDING SYNC' | 'SYNCING' | 'RETRYABLE' | 'FAILED';

export interface ReceiptPharmacyInfo {
  id: string;
  name: string;
}

export interface ReceiptBranchInfo {
  id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
}

export interface ReceiptLineItem {
  id: string;
  productId: string;
  productName: string;
  batchId?: string;
  batchNumber?: string;
  quantity: number;
  unitPrice: number; // In minor integer units (e.g. kobo or cents)
  discount: number;
  tax: number;
  lineTotal: number;
  returnedQuantity?: number;
}

export interface ReceiptReturnSummary {
  returnId: string;
  refundAmount: number;
  refundPaymentMethod: PaymentMethod;
  reason: string;
  createdAt: string;
  itemsCount: number;
}

export interface ReceiptData {
  receiptNumber: string;
  saleId: string;
  clientOpId?: string;
  transactionTime: string; // ISO 8601 or formatted date
  pharmacy: ReceiptPharmacyInfo;
  branch: ReceiptBranchInfo;
  cashier: {
    id: string;
    name: string;
  };
  customer?: {
    id: string;
    name?: string;
    phone?: string | null;
  } | null;
  paymentMethod: PaymentMethod;
  amountTendered?: number; // Integer minor units
  changeDue?: number; // Integer minor units
  paymentStatus?: string; // 'SETTLED' | 'PENDING_MANUAL' | 'UNCONFIRMED_EXTERNAL'
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  syncStatus: ReceiptSyncStatus;
  isOfflinePending: boolean;
  items: ReceiptLineItem[];
  returns?: ReceiptReturnSummary[];
  totalRefunded?: number;
  netTotal?: number;
}

/**
 * Builds a read-only ReceiptData presentation model from an authoritative HistoricalSale entity.
 */
export function buildReceiptFromHistoricalSale(
  sale: HistoricalSale,
  pharmacy: Pharmacy,
  branch?: Branch | null,
  returnsList?: ReturnRecord[],
  customerInfo?: { id: string; name: string; phone?: string | null } | null
): ReceiptData {
  const isPending = sale.provenance === 'LOCAL_PENDING';
  const syncStatus: ReceiptSyncStatus = isPending
    ? 'PENDING SYNC'
    : sale.sync_status === 'COMMITTED'
    ? 'COMMITTED'
    : 'COMMITTED';

  // Map returned quantities if return records are supplied
  const returnMap = new Map<string, number>();
  let totalRefunded = 0;
  const returnSummaries: ReceiptReturnSummary[] = [];

  if (returnsList && returnsList.length > 0) {
    for (const ret of returnsList) {
      if (ret.original_sale_id === sale.id) {
        totalRefunded += ret.refund_amount;
        returnSummaries.push({
          returnId: ret.id,
          refundAmount: ret.refund_amount,
          refundPaymentMethod: ret.refund_payment_method,
          reason: ret.reason,
          createdAt: ret.created_at,
          itemsCount: ret.items?.length || 0
        });

        for (const item of ret.items || []) {
          const key = `${item.product_id.toLowerCase()}:${item.batch_id.toLowerCase()}`;
          returnMap.set(key, (returnMap.get(key) || 0) + item.quantity);
        }
      }
    }
  }

  const items: ReceiptLineItem[] = sale.line_items.map((li) => {
    const key = `${li.product_id.toLowerCase()}:${li.batch_id.toLowerCase()}`;
    const retQty = returnMap.get(key) || 0;

    return {
      id: li.id,
      productId: li.product_id,
      productName: li.product_name || 'Pharmaceutical Item',
      batchId: li.batch_id,
      batchNumber: li.batch_number,
      quantity: li.quantity,
      unitPrice: li.unit_price,
      discount: li.discount,
      tax: li.tax,
      lineTotal: li.line_total,
      returnedQuantity: retQty > 0 ? retQty : undefined
    };
  });

  const receiptNumber = sale.id ? sale.id.slice(0, 8).toUpperCase() : 'PROVISIONAL';

  return {
    receiptNumber,
    saleId: sale.id,
    clientOpId: sale.client_op_id,
    transactionTime: sale.created_at,
    pharmacy: {
      id: pharmacy.id,
      name: pharmacy.name || 'Pharmacy'
    },
    branch: {
      id: branch?.id || sale.branch_id,
      name: branch?.name || sale.branch_name || 'Main Branch',
      address: branch?.address || null,
      phone: branch?.phone || null
    },
    cashier: {
      id: sale.cashier_id,
      name: sale.cashier_name || 'Cashier'
    },
    customer: customerInfo || (sale.customer_id
      ? {
          id: sale.customer_id
        }
      : null),
    paymentMethod: sale.payment_method,
    amountTendered: sale.amount_tendered ?? sale.total,
    changeDue: sale.change_due ?? 0,
    paymentStatus: sale.payment_status ?? 'SETTLED',
    currency: sale.currency || 'NGN',
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    syncStatus,
    isOfflinePending: isPending,
    items,
    returns: returnSummaries.length > 0 ? returnSummaries : undefined,
    totalRefunded: totalRefunded > 0 ? totalRefunded : undefined,
    netTotal: totalRefunded > 0 ? Math.max(0, sale.total - totalRefunded) : sale.total
  };
}

/**
 * Builds a read-only ReceiptData presentation model from an active POS Sale entity.
 */
export function buildReceiptFromPosSale(
  sale: Sale,
  pharmacy: Pharmacy,
  branch?: Branch | null,
  cashierName?: string,
  catalogProducts?: Map<string, { name: string }>,
  customerInfo?: { id: string; name: string; phone?: string | null } | null
): ReceiptData {
  const items: ReceiptLineItem[] = sale.line_items.map((li) => {
    const prod = catalogProducts?.get(li.product_id);
    return {
      id: li.id,
      productId: li.product_id,
      productName: prod?.name || 'Pharmaceutical Item',
      batchId: li.batch_id,
      quantity: li.quantity,
      unitPrice: li.unit_price,
      discount: li.discount,
      tax: li.tax,
      lineTotal: li.line_total
    };
  });

  const receiptNumber = sale.id ? sale.id.slice(0, 8).toUpperCase() : 'OFFLINE';

  return {
    receiptNumber,
    saleId: sale.id,
    clientOpId: sale.client_op_id,
    transactionTime: new Date(sale.created_at).toISOString(),
    pharmacy: {
      id: pharmacy.id,
      name: pharmacy.name || 'Pharmacy'
    },
    branch: {
      id: branch?.id || sale.branch_id,
      name: branch?.name || 'Main Branch',
      address: branch?.address || null,
      phone: branch?.phone || null
    },
    cashier: {
      id: sale.cashier_id,
      name: cashierName || 'Cashier'
    },
    customer: customerInfo || (sale.customer_id ? { id: sale.customer_id } : null),
    paymentMethod: sale.payment_method,
    amountTendered: sale.amount_tendered ?? sale.total,
    changeDue: sale.change_due ?? 0,
    paymentStatus: sale.payment_status ?? 'SETTLED',
    currency: sale.currency || 'NGN',
    subtotal: sale.subtotal,
    discount: sale.discount,
    tax: sale.tax,
    total: sale.total,
    syncStatus: 'PENDING SYNC',
    isOfflinePending: true,
    items,
    netTotal: sale.total
  };
}
