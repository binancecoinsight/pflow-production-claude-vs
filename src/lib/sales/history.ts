/**
 * PharmacyFlow Sales History & Transaction Management Service (Phase 5D-9)
 * 
 * Provides unified, secure access to authoritative PostgreSQL sales and local pending offline
 * transactions, strictly enforcing tenant isolation, cashier self-scoping, and immutability.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { PaymentMethod, PaymentStatus } from './types';
import { getTransactionsByPharmacy, getLocalTransaction, STORES, openOfflineDb } from '../offline/db';
import { SyncQueueItem, OperationResult } from '../offline/types';
import { isOnline } from '../offline/network';

export type SaleProvenance = 'SERVER_COMMITTED' | 'LOCAL_PENDING';

export type HistoricalSaleSyncStatus =
  | 'COMMITTED'
  | 'PENDING'
  | 'SYNCING'
  | 'RETRYABLE'
  | 'AUTH_REQUIRED'
  | 'DEVICE_BLOCKED'
  | 'PERMANENT_FAILURE';

export interface HistoricalSaleLineItem {
  id: string;
  product_id: string;
  product_name?: string;
  batch_id: string;
  batch_number?: string;
  quantity: number;
  unit_price: number; // Minor integer units
  discount: number;
  tax: number;
  line_total: number;
}

export interface HistoricalSale {
  id: string;
  client_op_id?: string;
  pharmacy_id: string;
  branch_id: string;
  branch_name?: string;
  cashier_id: string;
  cashier_name?: string;
  customer_id: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: PaymentMethod;
  amount_tendered?: number;
  change_due?: number;
  payment_status?: PaymentStatus;
  created_at: string; // ISO 8601 string
  provenance: SaleProvenance;
  sync_status: HistoricalSaleSyncStatus;
  sync_error?: string | null;
  line_items: HistoricalSaleLineItem[];
}

export interface SalesFilterOptions {
  branchId?: string;
  paymentMethod?: PaymentMethod | 'ALL';
  syncStatus?: 'ALL' | 'COMMITTED' | 'PENDING' | 'ATTENTION';
  startDate?: string; // ISO string
  endDate?: string;   // ISO string
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

/**
 * Checks whether a given role is subject to Cashier Self-Only visibility.
 * Cashiers are strictly restricted to inspecting only their own transactions.
 */
export const isCashierSelfOnly = (role: string | null | undefined): boolean => {
  return role === 'CASHIER';
};

/**
 * Checks whether a user role has broad management/clinical visibility across all cashiers.
 */
export const hasManagementSalesAccess = (role: string | null | undefined): boolean => {
  return role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST';
};

/**
 * Fetches authoritative committed sales from PostgreSQL via PostgREST / RLS.
 */
export const fetchAuthoritativeSales = async (
  client: SupabaseClient,
  pharmacyId: string,
  userId: string,
  role: string | null | undefined,
  options?: SalesFilterOptions
): Promise<{ sales: HistoricalSale[]; error: string | null }> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normUser = userId.toLowerCase().trim();

  // If client is offline, return gracefully
  if (!isOnline()) {
    return { sales: [], error: 'Device is currently offline' };
  }

  try {
    let query = client
      .from('sales')
      .select(`
        id,
        pharmacy_id,
        branch_id,
        cashier_id,
        customer_id,
        currency,
        subtotal,
        discount,
        tax,
        total,
        payment_method,
        amount_tendered,
        change_due,
        payment_status,
        created_at,
        sale_items (
          id,
          product_id,
          batch_id,
          quantity,
          unit_price,
          discount,
          tax,
          line_total
        )
      `)
      .eq('pharmacy_id', normPharmacy);

    // Cashier self-only scoping enforcement
    if (isCashierSelfOnly(role)) {
      query = query.eq('cashier_id', normUser);
    }

    // Branch filter
    if (options?.branchId && options.branchId !== 'ALL') {
      query = query.eq('branch_id', options.branchId.toLowerCase().trim());
    }

    // Payment method filter
    if (options?.paymentMethod && options.paymentMethod !== 'ALL') {
      query = query.eq('payment_method', options.paymentMethod);
    }

    // Date range filters
    if (options?.startDate) {
      query = query.gte('created_at', options.startDate);
    }
    if (options?.endDate) {
      query = query.lte('created_at', options.endDate);
    }

    // Bounded pagination
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error } = await query;

    if (error) {
      return { sales: [], error: error.message };
    }

    const sales: HistoricalSale[] = (data || []).map((row: any) => ({
      id: row.id,
      pharmacy_id: row.pharmacy_id,
      branch_id: row.branch_id,
      cashier_id: row.cashier_id,
      customer_id: row.customer_id || null,
      currency: row.currency || 'NGN',
      subtotal: Number(row.subtotal) || 0,
      discount: Number(row.discount) || 0,
      tax: Number(row.tax) || 0,
      total: Number(row.total) || 0,
      payment_method: row.payment_method as PaymentMethod,
      created_at: row.created_at,
      provenance: 'SERVER_COMMITTED',
      sync_status: 'COMMITTED',
      line_items: (row.sale_items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        discount: Number(item.discount) || 0,
        tax: Number(item.tax) || 0,
        line_total: Number(item.line_total) || 0
      }))
    }));

    return { sales, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query authoritative sales';
    return { sales: [], error: msg };
  }
};

/**
 * Fetches locally queued/pending transactions from IndexedDB.
 */
export const fetchLocalPendingSales = async (
  pharmacyId: string,
  userId: string,
  role: string | null | undefined,
  customFactory?: IDBFactory
): Promise<HistoricalSale[]> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normUser = userId.toLowerCase().trim();

  const transactions = await getTransactionsByPharmacy(normPharmacy, customFactory);
  const db = await openOfflineDb(customFactory);

  // Retrieve sync queue items for pharmacy
  const queueMap = new Map<string, SyncQueueItem>();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORES.QUEUE, 'readonly');
    const store = tx.objectStore(STORES.QUEUE);
    const index = store.index('pharmacy_id');
    const req = index.getAll(normPharmacy);

    req.onsuccess = () => {
      const items = (req.result || []) as SyncQueueItem[];
      for (const item of items) {
        if (item.pharmacy_id === normPharmacy) {
          queueMap.set(item.client_op_id.toLowerCase().trim(), item);
        }
      }
      resolve();
    };
    req.onerror = () => reject(new Error(req.error?.message));
  });

  const results: HistoricalSale[] = [];

  for (const tx of transactions) {
    if (tx.pharmacy_id !== normPharmacy) continue;
    const payload = tx.payload as Record<string, any>;
    const txCashier = (payload.cashier_id || '').toLowerCase().trim();

    // Cashier self-only scoping
    if (isCashierSelfOnly(role) && txCashier !== normUser) {
      continue;
    }

    const queueItem = queueMap.get(tx.client_op_id.toLowerCase().trim());
    const queueStatus = queueItem?.status || tx.status;

    // Filter out transactions that have already been server-committed
    // (they will be returned by authoritative server query)
    if (tx.status === 'COMMITTED' && queueStatus === 'COMMITTED') {
      continue;
    }

    const lineItems: HistoricalSaleLineItem[] = Array.isArray(payload.line_items)
      ? payload.line_items.map((li: any) => ({
          id: li.id || crypto.randomUUID().toLowerCase(),
          product_id: li.product_id,
          batch_id: li.batch_id,
          quantity: Number(li.quantity) || 0,
          unit_price: Number(li.unit_price) || 0,
          discount: Number(li.discount) || 0,
          tax: Number(li.tax) || 0,
          line_total: Number(li.line_total) || 0
        }))
      : [
          {
            id: crypto.randomUUID().toLowerCase(),
            product_id: payload.product_id,
            batch_id: payload.batch_id,
            quantity: Number(payload.quantity) || 1,
            unit_price: Number(payload.subtotal) || 0,
            discount: 0,
            tax: 0,
            line_total: Number(payload.total) || 0
          }
        ];

    const saleId = payload.sale_id || tx.id;
    const createdAtIso = new Date(tx.created_at).toISOString();

    results.push({
      id: saleId,
      client_op_id: tx.client_op_id,
      pharmacy_id: tx.pharmacy_id,
      branch_id: payload.branch_id || '',
      cashier_id: payload.cashier_id || '',
      customer_id: payload.customer_id || null,
      currency: payload.currency || 'NGN',
      subtotal: Number(payload.subtotal) || 0,
      discount: Number(payload.discount) || 0,
      tax: Number(payload.tax) || 0,
      total: Number(payload.total) || 0,
      payment_method: (payload.payment_method as PaymentMethod) || 'CASH',
      created_at: createdAtIso,
      provenance: 'LOCAL_PENDING',
      sync_status: queueStatus as HistoricalSaleSyncStatus,
      sync_error: queueItem?.last_error || null,
      line_items: lineItems
    });
  }

  // Sort descending by created_at
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return results;
};

/**
 * Unified sales retrieval combining local pending transactions with authoritative server records.
 */
export const getUnifiedSalesHistory = async (
  client: SupabaseClient,
  pharmacyId: string,
  userId: string,
  role: string | null | undefined,
  options?: SalesFilterOptions,
  customFactory?: IDBFactory
): Promise<{ sales: HistoricalSale[]; isOffline: boolean; error: string | null }> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();

  // 1. Always load local pending sales first (from IndexedDB)
  const localPending = await fetchLocalPendingSales(normPharmacy, userId, role, customFactory);

  // 2. If offline, return local pending transactions with offline notification
  if (!isOnline()) {
    return {
      sales: localPending,
      isOffline: true,
      error: null
    };
  }

  // 3. If online, fetch authoritative sales from PostgreSQL
  const { sales: serverSales, error } = await fetchAuthoritativeSales(
    client,
    normPharmacy,
    userId,
    role,
    options
  );

  // 4. Combine datasets: Pending sales on top, followed by server-committed sales
  // Avoid duplicate entries if a sale is present in both
  const serverIdSet = new Set(serverSales.map((s) => s.id.toLowerCase()));
  let filteredPending = localPending.filter((p) => !serverIdSet.has(p.id.toLowerCase()));

  // Filter local pending by payment method if specified
  if (options?.paymentMethod && options.paymentMethod !== 'ALL') {
    filteredPending = filteredPending.filter((p) => p.payment_method === options.paymentMethod);
  }

  // Filter local pending by branch if specified
  if (options?.branchId && options.branchId !== 'ALL') {
    filteredPending = filteredPending.filter(
      (p) => p.branch_id.toLowerCase().trim() === options.branchId?.toLowerCase().trim()
    );
  }

  // Filter combined results if status filter specified
  let combined = [...filteredPending, ...serverSales];
  if (options?.syncStatus && options.syncStatus !== 'ALL') {
    if (options.syncStatus === 'COMMITTED') {
      combined = combined.filter((s) => s.sync_status === 'COMMITTED');
    } else if (options.syncStatus === 'PENDING') {
      combined = combined.filter((s) => s.sync_status === 'PENDING' || s.sync_status === 'SYNCING');
    } else if (options.syncStatus === 'ATTENTION') {
      combined = combined.filter(
        (s) =>
          s.sync_status === 'RETRYABLE' ||
          s.sync_status === 'AUTH_REQUIRED' ||
          s.sync_status === 'DEVICE_BLOCKED' ||
          s.sync_status === 'PERMANENT_FAILURE'
      );
    }
  }

  // Text search filter (locally applied to candidate page for responsiveness)
  if (options?.searchQuery?.trim()) {
    const q = options.searchQuery.toLowerCase().trim();
    combined = combined.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        (s.client_op_id && s.client_op_id.toLowerCase().includes(q)) ||
        s.cashier_id.toLowerCase().includes(q) ||
        s.payment_method.toLowerCase().includes(q)
    );
  }

  return {
    sales: combined,
    isOffline: false,
    error
  };
};

/**
 * Retrieves a single historical sale by ID, strictly enforcing pharmacy tenant isolation
 * and cashier self-only scoping.
 */
export const getHistoricalSaleById = async (
  client: SupabaseClient,
  pharmacyId: string,
  saleId: string,
  userId: string,
  role: string | null | undefined,
  customFactory?: IDBFactory
): Promise<{ sale: HistoricalSale | null; error: string | null }> => {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normSale = saleId.toLowerCase().trim();
  const normUser = userId.toLowerCase().trim();

  // 1. Check local pending transactions first
  const localTransactions = await getTransactionsByPharmacy(normPharmacy, customFactory);
  for (const tx of localTransactions) {
    if (tx.pharmacy_id !== normPharmacy) continue;
    const payload = tx.payload as Record<string, any>;
    const curSaleId = (payload.sale_id || tx.id).toLowerCase().trim();

    if (curSaleId === normSale) {
      const txCashier = (payload.cashier_id || '').toLowerCase().trim();
      // Cashier self-only guard
      if (isCashierSelfOnly(role) && txCashier !== normUser) {
        return { sale: null, error: 'Unauthorized: Cashiers may only inspect their own transactions' };
      }

      const pendingSale: HistoricalSale = {
        id: curSaleId,
        client_op_id: tx.client_op_id,
        pharmacy_id: tx.pharmacy_id,
        branch_id: payload.branch_id || '',
        cashier_id: payload.cashier_id || '',
        customer_id: payload.customer_id || null,
        currency: payload.currency || 'NGN',
        subtotal: Number(payload.subtotal) || 0,
        discount: Number(payload.discount) || 0,
        tax: Number(payload.tax) || 0,
        total: Number(payload.total) || 0,
        payment_method: (payload.payment_method as PaymentMethod) || 'CASH',
        created_at: new Date(tx.created_at).toISOString(),
        provenance: 'LOCAL_PENDING',
        sync_status: tx.status as HistoricalSaleSyncStatus,
        line_items: Array.isArray(payload.line_items) ? payload.line_items : []
      };

      return { sale: pendingSale, error: null };
    }
  }

  // 2. Query authoritative server if online
  if (!isOnline()) {
    return { sale: null, error: 'Cannot query server: device is offline' };
  }

  try {
    let query = client
      .from('sales')
      .select(`
        id,
        pharmacy_id,
        branch_id,
        cashier_id,
        customer_id,
        currency,
        subtotal,
        discount,
        tax,
        total,
        payment_method,
        created_at,
        sale_items (
          id,
          product_id,
          batch_id,
          quantity,
          unit_price,
          discount,
          tax,
          line_total
        )
      `)
      .eq('pharmacy_id', normPharmacy)
      .eq('id', normSale);

    // Cashier self-only check
    if (isCashierSelfOnly(role)) {
      query = query.eq('cashier_id', normUser);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return { sale: null, error: error.message };
    }

    if (!data) {
      return { sale: null, error: 'Sale not found or access restricted' };
    }

    const sale: HistoricalSale = {
      id: data.id,
      pharmacy_id: data.pharmacy_id,
      branch_id: data.branch_id,
      cashier_id: data.cashier_id,
      customer_id: data.customer_id || null,
      currency: data.currency || 'NGN',
      subtotal: Number(data.subtotal) || 0,
      discount: Number(data.discount) || 0,
      tax: Number(data.tax) || 0,
      total: Number(data.total) || 0,
      payment_method: data.payment_method as PaymentMethod,
      created_at: data.created_at,
      provenance: 'SERVER_COMMITTED',
      sync_status: 'COMMITTED',
      line_items: (data.sale_items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: Number(item.quantity) || 0,
        unit_price: Number(item.unit_price) || 0,
        discount: Number(item.discount) || 0,
        tax: Number(item.tax) || 0,
        line_total: Number(item.line_total) || 0
      }))
    };

    return { sale, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error fetching sale by ID';
    return { sale: null, error: msg };
  }
};
