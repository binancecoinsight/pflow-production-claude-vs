/**
 * PharmacyFlow Supplier & Procurement Domain Types (Phase 5D-19)
 * 
 * Defines tenant-scoped supplier models, procurement read-model entities,
 * validation types, and search/filter inputs.
 * 
 * STRICT COMPLIANCE:
 * Option A (Supplier Delete Only) - No is_active, status, or archived_at fields.
 */

import { Supplier, Purchase, PurchaseItem } from '../../types/database';

export type { Supplier, Purchase, PurchaseItem };

export interface CreateSupplierInput {
  pharmacy_id: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface UpdateSupplierInput {
  name?: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
}

export interface SupplierFilterOptions {
  search?: string;
  limit?: number;
  offset?: number;
}

export interface SupplierValidationError {
  field: string;
  code: string;
  message: string;
}

export interface SupplierValidationResult {
  isValid: boolean;
  errors: SupplierValidationError[];
}

export interface SupplierOperationResult {
  success: boolean;
  supplier?: Supplier;
  error?: string;
  errorCode?: string;
  errors?: SupplierValidationError[];
}

/**
 * Enriched Purchase & Inbound Shipment Audit Contracts (Read-Only)
 */
export interface PurchaseAuditItem {
  id: string;
  purchase_id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  batch_id: string;
  quantity: number;
  unit_cost: number; // minor units (e.g. kobo)
  total_cost: number; // minor units
  created_at: string;
}

export interface PurchaseAuditRecord {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  branch_name: string;
  supplier_id: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  total_cost: number; // minor units
  status: string;
  client_op_id: string | null;
  notes: string | null;
  received_at: string | null;
  created_at: string;
  items_count?: number;
  items?: PurchaseAuditItem[];
}

export interface PurchaseFilterOptions {
  branch_id?: string;
  supplier_id?: string;
  search?: string; // invoice number or supplier name
  limit?: number;
  offset?: number;
}
