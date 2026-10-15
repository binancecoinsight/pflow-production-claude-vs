/**
 * PharmacyFlow Supplier & Procurement Service (Phase 5D-19)
 * 
 * Provides tenant-isolated supplier queries, mutations, and inbound shipment audit
 * records governed strictly by PostgreSQL Row Level Security (M-7, M-13).
 * 
 * INVARIANTS:
 * 1. Supplier queries are strictly scoped to the active pharmacy tenant.
 * 2. Option A (Supplier Delete Only) - Permanent deletion, no archive state.
 * 3. Delete operations catch PostgreSQL FK constraint violations (23503) from public.purchases.
 * 4. Purchase audit queries respect M-13 management-only SELECT policies.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { supabase as defaultSupabase } from '../supabase';
import { 
  Supplier, 
  CreateSupplierInput, 
  UpdateSupplierInput, 
  SupplierFilterOptions, 
  SupplierOperationResult,
  PurchaseAuditRecord,
  PurchaseAuditItem,
  PurchaseFilterOptions
} from './types';
import { 
  validateCreateSupplierInput, 
  validateUpdateSupplierInput, 
  normalizeSupplierName, 
  normalizeContactPerson, 
  normalizePhoneNumber, 
  normalizeEmail,
  isValidUuid
} from './validation';

/**
 * Lists suppliers for the active pharmacy tenant.
 * Governed by M-7 `rls_suppliers_select` (all active pharmacy members).
 */
export const listSuppliers = async (
  client: SupabaseClient = defaultSupabase,
  pharmacyId: string,
  options: SupplierFilterOptions = {}
): Promise<{ success: boolean; suppliers: Supplier[]; error?: string }> => {
  if (!pharmacyId || !isValidUuid(pharmacyId)) {
    return { success: false, suppliers: [], error: 'Valid pharmacy_id is required' };
  }

  const normPharmacy = pharmacyId.toLowerCase().trim();

  try {
    let query = client
      .from('suppliers')
      .select('*')
      .eq('pharmacy_id', normPharmacy)
      .order('name', { ascending: true });

    if (options.search && options.search.trim()) {
      const term = options.search.trim();
      query = query.or(`name.ilike.%${term}%,contact_person.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data, error } = await query;

    if (error) {
      return { success: false, suppliers: [], error: error.message };
    }

    return {
      success: true,
      suppliers: (data || []) as Supplier[]
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error listing suppliers';
    return { success: false, suppliers: [], error: msg };
  }
};

/**
 * Fetches a single supplier by ID within the active tenant.
 */
export const getSupplierById = async (
  client: SupabaseClient = defaultSupabase,
  pharmacyId: string,
  supplierId: string
): Promise<{ success: boolean; supplier?: Supplier; error?: string }> => {
  if (!pharmacyId || !isValidUuid(pharmacyId) || !supplierId || !isValidUuid(supplierId)) {
    return { success: false, error: 'Valid pharmacy_id and supplier_id are required' };
  }

  try {
    const { data, error } = await client
      .from('suppliers')
      .select('*')
      .eq('pharmacy_id', pharmacyId.toLowerCase().trim())
      .eq('id', supplierId.toLowerCase().trim())
      .maybeSingle();

    if (error) {
      return { success: false, error: error.message };
    }
    if (!data) {
      return { success: false, error: 'Supplier not found' };
    }

    return { success: true, supplier: data as Supplier };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error fetching supplier';
    return { success: false, error: msg };
  }
};

/**
 * Creates a new tenant-scoped supplier.
 * Governed by M-7 `rls_suppliers_insert` (requires `purchases.manage` permission).
 */
export const createSupplier = async (
  client: SupabaseClient = defaultSupabase,
  input: CreateSupplierInput
): Promise<SupplierOperationResult> => {
  const validation = validateCreateSupplierInput(input);
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.errors.map((e) => e.message).join('; '),
      errorCode: 'VALIDATION_FAILED',
      errors: validation.errors
    };
  }

  const normPharmacy = input.pharmacy_id.toLowerCase().trim();
  const payload = {
    pharmacy_id: normPharmacy,
    name: normalizeSupplierName(input.name),
    contact_person: normalizeContactPerson(input.contact_person),
    email: normalizeEmail(input.email),
    phone: normalizePhoneNumber(input.phone),
    address: input.address?.trim() || null
  };

  try {
    const { data, error } = await client
      .from('suppliers')
      .insert(payload)
      .select()
      .single();

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
        return {
          success: false,
          error: 'Forbidden: You do not have permission (purchases.manage) to create suppliers.',
          errorCode: 'FORBIDDEN_PERMISSION'
        };
      }
      return {
        success: false,
        error: error.message,
        errorCode: error.code || 'DATABASE_ERROR'
      };
    }

    return {
      success: true,
      supplier: data as Supplier
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error creating supplier';
    return { success: false, error: msg, errorCode: 'UNKNOWN_ERROR' };
  }
};

/**
 * Updates an existing tenant-scoped supplier.
 * Governed by M-7 `rls_suppliers_update` (requires `purchases.manage` permission).
 */
export const updateSupplier = async (
  client: SupabaseClient = defaultSupabase,
  pharmacyId: string,
  supplierId: string,
  input: UpdateSupplierInput
): Promise<SupplierOperationResult> => {
  if (!pharmacyId || !isValidUuid(pharmacyId) || !supplierId || !isValidUuid(supplierId)) {
    return {
      success: false,
      error: 'Valid pharmacy_id and supplier_id are required',
      errorCode: 'INVALID_ID'
    };
  }

  const validation = validateUpdateSupplierInput(input);
  if (!validation.isValid) {
    return {
      success: false,
      error: validation.errors.map((e) => e.message).join('; '),
      errorCode: 'VALIDATION_FAILED',
      errors: validation.errors
    };
  }

  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normSupplierId = supplierId.toLowerCase().trim();

  const updates: Record<string, unknown> = {};
  if (input.name !== undefined) updates.name = normalizeSupplierName(input.name);
  if (input.contact_person !== undefined) updates.contact_person = normalizeContactPerson(input.contact_person);
  if (input.email !== undefined) updates.email = normalizeEmail(input.email);
  if (input.phone !== undefined) updates.phone = normalizePhoneNumber(input.phone);
  if (input.address !== undefined) updates.address = input.address?.trim() || null;

  try {
    const { data, error } = await client
      .from('suppliers')
      .update(updates)
      .eq('pharmacy_id', normPharmacy)
      .eq('id', normSupplierId)
      .select()
      .maybeSingle();

    if (error) {
      if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
        return {
          success: false,
          error: 'Forbidden: You do not have permission (purchases.manage) to update suppliers.',
          errorCode: 'FORBIDDEN_PERMISSION'
        };
      }
      return {
        success: false,
        error: error.message,
        errorCode: error.code || 'DATABASE_ERROR'
      };
    }

    if (!data) {
      return {
        success: false,
        error: 'Supplier not found or no permission to update',
        errorCode: 'NOT_FOUND'
      };
    }

    return {
      success: true,
      supplier: data as Supplier
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error updating supplier';
    return { success: false, error: msg, errorCode: 'UNKNOWN_ERROR' };
  }
};

/**
 * Permanently deletes a tenant-scoped supplier.
 * Governed by M-7 `rls_suppliers_delete` (requires `OWNER` role).
 * 
 * SPECIAL ERROR HANDLING:
 * If public.purchases records reference this supplier, PostgreSQL rejects
 * the DELETE with a foreign key violation (SQLSTATE 23503). This is safely surfaced.
 */
export const deleteSupplier = async (
  client: SupabaseClient = defaultSupabase,
  pharmacyId: string,
  supplierId: string
): Promise<{ success: boolean; error?: string; errorCode?: string }> => {
  if (!pharmacyId || !isValidUuid(pharmacyId) || !supplierId || !isValidUuid(supplierId)) {
    return {
      success: false,
      error: 'Valid pharmacy_id and supplier_id are required',
      errorCode: 'INVALID_ID'
    };
  }

  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normSupplierId = supplierId.toLowerCase().trim();

  try {
    const { error } = await client
      .from('suppliers')
      .delete()
      .eq('pharmacy_id', normPharmacy)
      .eq('id', normSupplierId);

    if (error) {
      // 1. Foreign Key Constraint Violation (Linked historical purchases)
      if (error.code === '23503' || error.message?.toLowerCase().includes('foreign key') || error.message?.toLowerCase().includes('purchases')) {
        return {
          success: false,
          error: 'Cannot delete supplier: Historical purchase orders or inbound shipments reference this supplier. To preserve audit integrity, suppliers with purchase history cannot be deleted.',
          errorCode: 'SUPPLIER_HAS_LINKED_PURCHASES'
        };
      }

      // 2. Authorization Violation (Non-owner role)
      if (error.code === '42501' || error.message?.includes('permission') || error.message?.includes('policy')) {
        return {
          success: false,
          error: 'Unauthorized: Only the pharmacy OWNER is authorized to delete suppliers.',
          errorCode: 'FORBIDDEN_OWNER_ONLY'
        };
      }

      return {
        success: false,
        error: error.message,
        errorCode: error.code || 'DATABASE_ERROR'
      };
    }

    return { success: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error deleting supplier';
    return { success: false, error: msg, errorCode: 'UNKNOWN_ERROR' };
  }
};

/**
 * Lists authoritative purchase / inbound shipment records.
 * Governed by M-13 `rls_purchases_select` (OWNER, MANAGER, PHARMACIST, or purchases.manage).
 * CASHIER role is prohibited by database RLS.
 */
export const listPurchases = async (
  client: SupabaseClient = defaultSupabase,
  pharmacyId: string,
  options: PurchaseFilterOptions = {}
): Promise<{ success: boolean; purchases: PurchaseAuditRecord[]; error?: string; errorCode?: string }> => {
  if (!pharmacyId || !isValidUuid(pharmacyId)) {
    return { success: false, purchases: [], error: 'Valid pharmacy_id is required', errorCode: 'INVALID_ID' };
  }

  const normPharmacy = pharmacyId.toLowerCase().trim();

  try {
    let query = client
      .from('purchases')
      .select(`
        id,
        pharmacy_id,
        branch_id,
        supplier_id,
        invoice_number,
        total_cost,
        status,
        client_op_id,
        notes,
        received_at,
        created_at
      `)
      .eq('pharmacy_id', normPharmacy)
      .order('created_at', { ascending: false });

    if (options.branch_id && isValidUuid(options.branch_id)) {
      query = query.eq('branch_id', options.branch_id.toLowerCase().trim());
    }

    if (options.supplier_id && isValidUuid(options.supplier_id)) {
      query = query.eq('supplier_id', options.supplier_id.toLowerCase().trim());
    }

    if (options.search && options.search.trim()) {
      const term = options.search.trim();
      query = query.ilike('invoice_number', `%${term}%`);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }
    if (options.offset) {
      query = query.range(options.offset, options.offset + (options.limit || 50) - 1);
    }

    const { data: rawPurchases, error: purchasesError } = await query;

    if (purchasesError) {
      if (purchasesError.code === '42501' || purchasesError.message?.includes('permission') || purchasesError.message?.includes('policy')) {
        return {
          success: false,
          purchases: [],
          error: 'Access denied: Purchase history and cost totals are restricted to management roles.',
          errorCode: 'FORBIDDEN_PURCHASES_READ'
        };
      }
      return {
        success: false,
        purchases: [],
        error: purchasesError.message,
        errorCode: purchasesError.code
      };
    }

    const purchasesList = (rawPurchases || []) as PurchaseAuditRecord[];
    if (purchasesList.length === 0) {
      return { success: true, purchases: [] };
    }

    // Fetch branches and suppliers for joined presentation
    const [branchesRes, suppliersRes] = await Promise.all([
      client.from('branches').select('id, name').eq('pharmacy_id', normPharmacy),
      client.from('suppliers').select('id, name').eq('pharmacy_id', normPharmacy)
    ]);

    const branchNameMap = new Map<string, string>();
    (branchesRes.data || []).forEach((b: { id: string; name: string }) => {
      branchNameMap.set(b.id.toLowerCase(), b.name);
    });

    const supplierNameMap = new Map<string, string>();
    (suppliersRes.data || []).forEach((s: { id: string; name: string }) => {
      supplierNameMap.set(s.id.toLowerCase(), s.name);
    });

    // Enrich purchase records with joined names
    const enriched: PurchaseAuditRecord[] = purchasesList.map((p) => ({
      ...p,
      branch_name: branchNameMap.get(p.branch_id.toLowerCase()) || 'Branch',
      supplier_name: p.supplier_id ? supplierNameMap.get(p.supplier_id.toLowerCase()) || 'Supplier' : null
    }));

    return {
      success: true,
      purchases: enriched
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error fetching purchases';
    return { success: false, purchases: [], error: msg, errorCode: 'UNKNOWN_ERROR' };
  }
};

/**
 * Fetches detailed line items for a specific purchase audit record.
 * Governed by M-13 `rls_purchase_items_select`.
 */
export const getPurchaseDetails = async (
  client: SupabaseClient = defaultSupabase,
  pharmacyId: string,
  purchaseId: string
): Promise<{ success: boolean; items: PurchaseAuditItem[]; error?: string; errorCode?: string }> => {
  if (!pharmacyId || !isValidUuid(pharmacyId) || !purchaseId || !isValidUuid(purchaseId)) {
    return { success: false, items: [], error: 'Valid pharmacy_id and purchase_id are required', errorCode: 'INVALID_ID' };
  }

  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normPurchaseId = purchaseId.toLowerCase().trim();

  try {
    const { data: rawItems, error: itemsError } = await client
      .from('purchase_items')
      .select('*')
      .eq('pharmacy_id', normPharmacy)
      .eq('purchase_id', normPurchaseId);

    if (itemsError) {
      if (itemsError.code === '42501' || itemsError.message?.includes('permission') || itemsError.message?.includes('policy')) {
        return {
          success: false,
          items: [],
          error: 'Access denied: Purchase line item costs are restricted to management roles.',
          errorCode: 'FORBIDDEN_PURCHASES_READ'
        };
      }
      return { success: false, items: [], error: itemsError.message, errorCode: itemsError.code };
    }

    const items = (rawItems || []) as Array<{
      id: string;
      purchase_id: string;
      product_id: string;
      batch_id: string;
      quantity: number;
      unit_cost: number;
      total_cost: number;
      created_at: string;
    }>;

    if (items.length === 0) {
      return { success: true, items: [] };
    }

    // Resolve product names
    const productIds = Array.from(new Set(items.map((i) => i.product_id.toLowerCase())));
    const { data: products } = await client
      .from('products')
      .select('id, name, sku')
      .eq('pharmacy_id', normPharmacy)
      .in('id', productIds);

    const productMap = new Map<string, { name: string; sku: string | null }>();
    (products || []).forEach((p: { id: string; name: string; sku?: string | null }) => {
      productMap.set(p.id.toLowerCase(), { name: p.name, sku: p.sku || null });
    });

    const enrichedItems: PurchaseAuditItem[] = items.map((i) => {
      const prod = productMap.get(i.product_id.toLowerCase());
      return {
        id: i.id,
        purchase_id: i.purchase_id,
        product_id: i.product_id,
        product_name: prod?.name || 'Product',
        product_sku: prod?.sku || null,
        batch_id: i.batch_id,
        quantity: i.quantity,
        unit_cost: i.unit_cost,
        total_cost: i.total_cost,
        created_at: i.created_at
      };
    });

    return {
      success: true,
      items: enrichedItems
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected error fetching purchase items';
    return { success: false, items: [], error: msg, errorCode: 'UNKNOWN_ERROR' };
  }
};
