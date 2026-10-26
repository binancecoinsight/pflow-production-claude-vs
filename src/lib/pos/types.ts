/**
 * PharmacyFlow Offline POS Transaction Orchestration Types (Phase 5D-5)
 * 
 * Defines POS cart sessions, line items, inputs, and finalization result structures.
 * 
 * ARCHITECTURAL CONSTRAINTS:
 * - Money is strictly represented in integer minor units (e.g. kobo or cents).
 * - Cashier identity must be authenticated Supabase auth.users(id) UUID v4.
 * - Local inventory information is explicitly non-authoritative projected stock.
 * - Final sale persistence delegates exclusively to Phase 5D-3 createLocalSale.
 */

import { PaymentMethod, Sale, SaleLineItem } from '../sales/types';
import { LocalTransaction, SyncQueueItem } from '../offline/types';

export interface PosSessionContext {
  pharmacy_id: string; // Active pharmacy tenant UUID v4
  branch_id: string;   // Active branch UUID v4
  cashier_id: string;  // Authenticated auth.users(id) UUID v4
  currency?: string;   // Currency code (defaults to 'NGN')
  authenticated_user_id?: string; // Authenticated Supabase session user.id to enforce cashier identity
  checkout_scope_key?: string;
  checkout_intent_id?: string;
  client_op_id?: string;
  sale_id?: string;
  client_created_at?: number;
  draft_revision?: number;
}

export interface PosCartLineItem {
  id: string;               // Unique cart line UUID v4
  product_id: string;       // Product UUID v4
  batch_id: string;         // Batch UUID v4
  product_name: string;     // Product commercial name
  batch_number: string;     // Batch/lot number
  expiry_date: string;      // ISO date string ('YYYY-MM-DD')
  quantity: number;         // Positive integer > 0
  unit_price: number;       // Integer minor units (e.g. kobo) >= 0
  discount: number;         // Line discount in integer minor units >= 0
  tax: number;              // Line tax in integer minor units >= 0
  line_subtotal: number;    // quantity * unit_price (minor units)
  line_total: number;       // line_subtotal - discount + tax (minor units)
  projected_stock?: number; // Read-model projected stock for UI guidance
}

export interface PosCart {
  checkout_scope_key: string;
  checkout_intent_id: string;
  client_op_id: string;
  sale_id: string;
  client_created_at: number;
  draft_revision: number;
  checkout_state: 'DRAFT' | 'LOCALLY_DURABLE';
  transaction_id: string | null;
  queue_id: string | null;
  pharmacy_id: string;
  branch_id: string;
  cashier_id: string;
  currency: string;
  line_items: PosCartLineItem[];
  subtotal: number;         // Sum of all line subtotals (integer minor units)
  line_discounts: number;   // Sum of line item discounts
  sale_discount: number;    // Global sale discount (integer minor units)
  total_discount: number;   // line_discounts + sale_discount
  line_taxes: number;       // Sum of line item taxes
  sale_tax: number;         // Global sale tax (integer minor units)
  total_tax: number;        // line_taxes + sale_tax
  total: number;            // subtotal - total_discount + total_tax
  created_at: number;       // Unix epoch ms
  updated_at: number;       // Unix epoch ms
}

export interface AddItemInput {
  product_id: string;
  batch_id?: string;        // Optional: auto-selected using Phase 5D-4 if omitted
  quantity?: number;        // Defaults to 1 (must be integer > 0)
  unit_price?: number;      // Optional: overrides default read-model price if supplied >= 0
  discount?: number;        // Line discount (integer minor units >= 0)
  tax?: number;             // Line tax (integer minor units >= 0)
}

export interface FinalizeSaleOptions {
  payment_method: PaymentMethod;
  amount_tendered?: number; // Integer minor units (e.g. kobo)
  payment_status?: 'SETTLED' | 'PENDING_MANUAL' | 'UNCONFIRMED_EXTERNAL';
  customer_id?: string | null;
  client_op_id?: string;    // Optional explicit idempotency UUID v4
  authenticated_user_id?: string; // Authenticated Supabase session user.id to enforce cashier identity
}

export interface FinalizeSaleResult {
  success: boolean;
  sale?: Sale;
  transaction?: LocalTransaction;
  queueItem?: SyncQueueItem;
  checkoutRevision?: number;
  errors?: string[];
}

export interface CatalogFreshnessStatus {
  isStale: boolean;
  syncedAt: number | null;
  sourceUpdatedAt: string | null;
  productCount: number;
  batchCount: number;
}
