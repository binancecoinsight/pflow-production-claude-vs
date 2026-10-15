/**
 * PharmacyFlow Returns & Refunds Service (Phase 5D-10)
 * 
 * Provides client methods for initiating and inspecting returns against authoritative
 * sales, calculating returnable item balances, and invoking atomic database RPCs.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { HistoricalSale } from './history';
import { PaymentMethod } from './types';
import { createLocalTransaction } from '../offline/db';
import { isOnline } from '../offline/network';

export interface ReturnItemInput {
  product_id: string;
  batch_id: string;
  quantity: number;
  restock_to_inventory?: boolean;
}

export interface ProcessReturnInput {
  pharmacy_id: string;
  branch_id: string;
  sale_id: string;
  items: ReturnItemInput[];
  refund_amount: number; // in integer minor units or currency amount
  refund_payment_method: PaymentMethod;
  reason: string;
  client_op_id?: string;
  forceOffline?: boolean;
}

export interface ReturnItemRecord {
  id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  restock_to_inventory: boolean;
}

export interface ReturnRecord {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  original_sale_id: string;
  refund_amount: number;
  refund_payment_method: PaymentMethod;
  reason: string;
  authorized_by: string;
  status: 'COMPLETED' | 'PENDING' | 'REJECTED';
  created_at: string;
  items: ReturnItemRecord[];
}

export interface ProcessReturnResult {
  success: boolean;
  return_id?: string;
  refund_amount?: number;
  status?: string;
  offline_queued?: boolean;
  error?: string;
}

/**
 * Checks whether an authenticated role has permission to authorize returns.
 * Per M-2/M-9: OWNER, MANAGER, and PHARMACIST hold 'sales.refund'.
 * CASHIER role is prohibited from authorizing refunds.
 */
export const canUserProcessReturns = (role: string | null | undefined): boolean => {
  return role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST';
};

/**
 * Calculates remaining returnable quantities for each item in a sale.
 */
export const calculateReturnableQuantities = (
  sale: HistoricalSale,
  existingReturns: ReturnRecord[]
): Map<string, number> => {
  const returnableMap = new Map<string, number>();

  // Initialize with originally sold quantities: key = `${product_id}:${batch_id}`
  for (const item of sale.line_items) {
    const key = `${item.product_id.toLowerCase().trim()}:${item.batch_id.toLowerCase().trim()}`;
    const current = returnableMap.get(key) || 0;
    returnableMap.set(key, current + item.quantity);
  }

  // Deduct quantities already returned in previous return records
  for (const ret of existingReturns) {
    for (const item of ret.items) {
      const key = `${item.product_id.toLowerCase().trim()}:${item.batch_id.toLowerCase().trim()}`;
      const current = returnableMap.get(key) || 0;
      returnableMap.set(key, Math.max(0, current - item.quantity));
    }
  }

  return returnableMap;
};

/**
 * Queries all previously executed returns for a given sale within the active pharmacy tenant.
 */
export const getSaleReturns = async (
  client: SupabaseClient,
  pharmacyId: string,
  saleId: string
): Promise<{ returns: ReturnRecord[]; error: string | null }> => {
  try {
    const { data, error } = await client
      .from('sale_returns')
      .select(`
        id,
        pharmacy_id,
        branch_id,
        original_sale_id,
        refund_amount,
        refund_payment_method,
        reason,
        authorized_by,
        status,
        created_at,
        return_items (
          id,
          product_id,
          batch_id,
          quantity,
          restock_to_inventory
        )
      `)
      .eq('pharmacy_id', pharmacyId.toLowerCase().trim())
      .eq('original_sale_id', saleId.toLowerCase().trim())
      .order('created_at', { ascending: false });

    if (error) {
      return { returns: [], error: error.message };
    }

    const returns: ReturnRecord[] = (data || []).map((row: any) => ({
      id: row.id,
      pharmacy_id: row.pharmacy_id,
      branch_id: row.branch_id,
      original_sale_id: row.original_sale_id,
      refund_amount: Number(row.refund_amount) || 0,
      refund_payment_method: row.refund_payment_method as PaymentMethod,
      reason: row.reason,
      authorized_by: row.authorized_by,
      status: row.status,
      created_at: row.created_at,
      items: (row.return_items || []).map((item: any) => ({
        id: item.id,
        product_id: item.product_id,
        batch_id: item.batch_id,
        quantity: Number(item.quantity) || 0,
        restock_to_inventory: Boolean(item.restock_to_inventory)
      }))
    }));

    return { returns, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to query sale returns';
    return { returns: [], error: msg };
  }
};

/**
 * Submits an atomic return transaction to the PostgreSQL database engine via rpc_process_sale_return.
 */
export const submitSaleReturn = async (
  client: SupabaseClient,
  input: ProcessReturnInput
): Promise<ProcessReturnResult> => {
  const normPharmacy = input.pharmacy_id.toLowerCase().trim();
  const normBranch = input.branch_id.toLowerCase().trim();
  const normSale = input.sale_id.toLowerCase().trim();
  const clientOpId = input.client_op_id || crypto.randomUUID().toLowerCase();

  if (input.items.length === 0) {
    return { success: false, error: 'At least one line item must be selected for return' };
  }

  if (input.refund_amount < 0) {
    return { success: false, error: 'Refund amount cannot be negative' };
  }

  // If offline mode is requested or browser is disconnected, queue in durable IndexedDB store
  if (input.forceOffline || !isOnline()) {
    try {
      await createLocalTransaction({
        pharmacy_id: normPharmacy,
        client_op_id: clientOpId,
        transaction_type: 'SALE_RETURN',
        payload: {
          pharmacy_id: normPharmacy,
          branch_id: normBranch,
          sale_id: normSale,
          items: input.items.map((i) => ({
            product_id: i.product_id.toLowerCase().trim(),
            batch_id: i.batch_id.toLowerCase().trim(),
            quantity: Math.floor(i.quantity),
            restock_to_inventory: i.restock_to_inventory ?? true
          })),
          refund_amount: input.refund_amount,
          refund_payment_method: input.refund_payment_method,
          reason: input.reason.trim()
        }
      });

      return {
        success: true,
        return_id: clientOpId,
        refund_amount: input.refund_amount,
        status: 'PENDING',
        offline_queued: true
      };
    } catch (offlineErr: unknown) {
      const msg = offlineErr instanceof Error ? offlineErr.message : 'Failed to queue offline return';
      return { success: false, error: msg };
    }
  }

  try {
    const { data, error } = await client.rpc('rpc_process_sale_return', {
      p_pharmacy_id: normPharmacy,
      p_branch_id: normBranch,
      p_sale_id: normSale,
      p_items: input.items.map((i) => ({
        product_id: i.product_id.toLowerCase().trim(),
        batch_id: i.batch_id.toLowerCase().trim(),
        quantity: Math.floor(i.quantity),
        restock_to_inventory: i.restock_to_inventory ?? true
      })),
      p_refund_amount: input.refund_amount,
      p_refund_payment_method: input.refund_payment_method,
      p_reason: input.reason.trim(),
      p_client_op_id: clientOpId
    });

    if (error) {
      return { success: false, error: error.message };
    }

    const row = Array.isArray(data) ? data[0] : data;
    return {
      success: true,
      return_id: row?.return_id,
      refund_amount: Number(row?.refund_amount) || input.refund_amount,
      status: row?.status || 'COMPLETED'
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unexpected return execution error';
    return { success: false, error: msg };
  }
};
