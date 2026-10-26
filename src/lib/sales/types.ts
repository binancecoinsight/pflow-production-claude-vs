/**
 * PharmacyFlow Sales Domain Types (Phase 5D-3)
 * 
 * Defines domain models, line items, monetary calculations,
 * payment methods, and validation structures.
 */

import { LocalTransaction, SyncQueueItem } from '../offline/types';
import { PaymentStatus } from '../../types/database';

export type PaymentMethod = 'CASH' | 'TRANSFER' | 'CARD' | 'OTHER';

export const ALLOWED_PAYMENT_METHODS: readonly PaymentMethod[] = [
  'CASH',
  'TRANSFER',
  'CARD',
  'OTHER'
] as const;

export { type PaymentStatus };

export interface SaleLineItemInput {
  id?: string;
  product_id: string;
  batch_id: string;
  quantity: number; // Positive integer > 0
  unit_price: number; // Integer minor units (e.g. kobo or cents) >= 0
  discount?: number; // Integer minor units >= 0
  tax?: number; // Integer minor units >= 0
}

export interface SaleLineItem {
  id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  line_total: number;
}

export interface CreateSaleInput {
  client_op_id?: string;
  checkout_intent_id?: string;
  sale_id?: string;
  client_created_at?: number;
  checkout_scope_key?: string;
  checkout_revision?: number;
  /** Explicitly isolates pre-Phase-B synthetic/domain callers from production checkout persistence. */
  compatibility_non_draft?: true;
  pharmacy_id: string;
  branch_id: string;
  cashier_id: string; // Must be authenticated user UUID
  customer_id?: string | null;
  currency?: string; // Defaults to 'NGN'
  payment_method: PaymentMethod;
  amount_tendered?: number; // Integer minor units
  payment_status?: PaymentStatus;
  line_items: SaleLineItemInput[];
  sale_discount?: number; // Global sale discount in integer minor units
  sale_tax?: number; // Global sale tax in integer minor units
}

export interface SaleTotals {
  subtotal: number;
  lineDiscounts: number;
  saleDiscount: number;
  totalDiscount: number;
  lineTaxes: number;
  saleTax: number;
  totalTax: number;
  total: number;
  lineTotals: number[];
}

export interface Sale {
  id: string;
  client_op_id: string;
  checkout_intent_id: string;
  pharmacy_id: string;
  branch_id: string;
  cashier_id: string;
  customer_id: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: PaymentMethod;
  amount_tendered: number; // Integer minor units
  change_due: number; // Integer minor units
  payment_status: PaymentStatus;
  created_at: number;
  line_items: SaleLineItem[];
}

export interface SaleValidationError {
  field: string;
  code: string;
  message: string;
}

export interface SaleValidationResult {
  isValid: boolean;
  errors: SaleValidationError[];
}

export interface CreateSaleResult {
  success: boolean;
  sale?: Sale;
  transaction?: LocalTransaction;
  queueItem?: SyncQueueItem;
  checkoutRevision?: number;
  errors?: SaleValidationError[];
}
