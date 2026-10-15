/**
 * PharmacyFlow Customer Management Service (Phase 5D-13)
 * 
 * Provides tenant-isolated customer queries, mutations, offline cache synchronization,
 * and customer sales history governed by M-8 Row Level Security.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Customer, CreateCustomerInput, UpdateCustomerInput, CustomerFilterOptions, CustomerOperationResult } from './types';
import { validateCreateCustomerInput, validateUpdateCustomerInput, normalizePhoneNumber, normalizeCustomerName } from './validation';
import { isOnline } from '../offline/network';
import { getOfflineCustomers, searchOfflineCustomers, saveOfflineCustomers, saveSingleOfflineCustomer } from '../offline/db';
import { getUnifiedSalesHistory, HistoricalSale } from '../sales/history';

/**
 * Lists customers for the active pharmacy tenant, with offline fallback.
 */
export const listCustomers = async (
  supabase: SupabaseClient,
  pharmacyId: string,
  options: CustomerFilterOptions = {}
): Promise<{ success: boolean; customers: Customer[]; error?: string }> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();

  // If network is offline, retrieve from local IndexedDB cache
  if (!isOnline()) {
    try {
      const cached = options.search
        ? await searchOfflineCustomers(normPharmacy, options.search)
        : await getOfflineCustomers(normPharmacy);

      let filtered = cached;
      if (options.status && options.status !== 'ALL') {
        filtered = filtered.filter((c) => c.status === options.status);
      }

      return {
        success: true,
        customers: filtered as Customer[]
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to query offline customers';
      return { success: false, customers: [], error: msg };
    }
  }

  try {
    let query = supabase
      .from('customers')
      .select('*')
      .eq('pharmacy_id', normPharmacy)
      .order('name', { ascending: true });

    if (options.status && options.status !== 'ALL') {
      query = query.eq('status', options.status);
    }

    if (options.search && options.search.trim()) {
      const term = options.search.trim();
      query = query.or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`);
    }

    if (options.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      // Fall back to offline store if network fails unexpectedly
      const cached = options.search
        ? await searchOfflineCustomers(normPharmacy, options.search)
        : await getOfflineCustomers(normPharmacy);
      return { success: true, customers: cached as Customer[], error: error.message };
    }

    const customers = (data || []) as Customer[];

    // Background cache update for offline readiness
    saveOfflineCustomers(normPharmacy, customers).catch(() => {});

    return {
      success: true,
      customers
    };
  } catch (err: unknown) {
    // Graceful offline fallback
    try {
      const cached = await getOfflineCustomers(normPharmacy);
      return { success: true, customers: cached as Customer[] };
    } catch {
      const msg = err instanceof Error ? err.message : 'Unexpected customer fetch error';
      return { success: false, customers: [], error: msg };
    }
  }
};

/**
 * Creates a new tenant-scoped customer record.
 */
export const createCustomer = async (
  supabase: SupabaseClient,
  input: CreateCustomerInput
): Promise<CustomerOperationResult> => {
  const validation = validateCreateCustomerInput(input);
  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
      error: validation.errors[0]?.message || 'Validation failed'
    };
  }

  const normPharmacy = input.pharmacy_id.toLowerCase().trim();
  const id = crypto.randomUUID().toLowerCase();
  const now = new Date().toISOString();

  const customerRecord: Customer = {
    id,
    pharmacy_id: normPharmacy,
    name: normalizeCustomerName(input.name),
    phone: normalizePhoneNumber(input.phone),
    email: input.email ? input.email.trim().toLowerCase() : null,
    address: input.address ? input.address.trim() : null,
    notes: input.notes ? input.notes.trim() : null,
    status: 'ACTIVE',
    created_at: now,
    updated_at: now
  };

  // Creating a new customer strictly requires an active online connection to prevent
  // un-synchronized local customer UUIDs from breaking server sales sync.
  if (!isOnline()) {
    return {
      success: false,
      error: 'Registering new customers requires an active internet connection. Please connect to the network to register new customers, or proceed with existing synchronized customers / walk-in sale.'
    };
  }

  const { data, error } = await supabase
    .from('customers')
    .insert({
      id: customerRecord.id,
      pharmacy_id: customerRecord.pharmacy_id,
      name: customerRecord.name,
      phone: customerRecord.phone,
      email: customerRecord.email,
      address: customerRecord.address,
      notes: customerRecord.notes,
      status: customerRecord.status
    })
    .select('*')
    .single();

  if (error) {
    return {
      success: false,
      error: error.message
    };
  }

  const created = data as Customer;
  await saveSingleOfflineCustomer(created).catch(() => {});
  return {
    success: true,
    customer: created
  };
};

/**
 * Updates an existing customer record.
 */
export const updateCustomer = async (
  supabase: SupabaseClient,
  pharmacyId: string,
  customerId: string,
  updates: UpdateCustomerInput
): Promise<CustomerOperationResult> => {
  const validation = validateUpdateCustomerInput(updates);
  if (!validation.isValid) {
    return {
      success: false,
      errors: validation.errors,
      error: validation.errors[0]?.message || 'Validation failed'
    };
  }

  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normCustomerId = customerId.toLowerCase().trim();

  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) patch.name = normalizeCustomerName(updates.name);
  if (updates.phone !== undefined) patch.phone = normalizePhoneNumber(updates.phone);
  if (updates.email !== undefined) patch.email = updates.email ? updates.email.trim().toLowerCase() : null;
  if (updates.address !== undefined) patch.address = updates.address ? updates.address.trim() : null;
  if (updates.notes !== undefined) patch.notes = updates.notes ? updates.notes.trim() : null;
  if (updates.status !== undefined) patch.status = updates.status;

  if (isOnline()) {
    const { data, error } = await supabase
      .from('customers')
      .update(patch)
      .eq('pharmacy_id', normPharmacy)
      .eq('id', normCustomerId)
      .select('*')
      .single();

    if (error) {
      return {
        success: false,
        error: error.message
      };
    }

    const updated = data as Customer;
    await saveSingleOfflineCustomer(updated).catch(() => {});
    return {
      success: true,
      customer: updated
    };
  }

  return {
    success: false,
    error: 'Updating customer records requires an active internet connection.'
  };
};

/**
 * Retrieves authoritative transaction history for a specific customer,
 * strictly subject to M-8 Row Level Security and cashier self-scoping.
 */
export const getCustomerSalesHistory = async (
  supabase: SupabaseClient,
  pharmacyId: string,
  customerId: string,
  currentUserId: string,
  userRole: string | null
): Promise<{ success: boolean; sales: HistoricalSale[]; error?: string }> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normCustomer = customerId.toLowerCase().trim();

  try {
    const result = await getUnifiedSalesHistory(
      supabase,
      normPharmacy,
      currentUserId,
      userRole,
      {
        limit: 100
      }
    );

    if (result.error) {
      return { success: false, sales: [], error: result.error };
    }

    // Filter sales to this customer. Because getUnifiedSalesHistory already
    // enforced M-8 RLS and cashier self-scoping, cashiers will ONLY see
    // their own sales for this customer, while managers/owners see all sales!
    const customerSales = result.sales.filter((s) => s.customer_id === normCustomer);

    return {
      success: true,
      sales: customerSales
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query customer sales history';
    return { success: false, sales: [], error: msg };
  }
};
