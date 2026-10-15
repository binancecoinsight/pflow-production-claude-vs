/**
 * PharmacyFlow Tender Integrity & Cash Register Reconciliation Engine (Phase 5D-14)
 * 
 * Provides financial calculations and persistence operations for cash drawer sessions,
 * shift reconciliation, tender breakdown, and cashier accountability.
 * 
 * FINANCIAL INVARIANTS:
 * 1. Money is strictly computed and stored in integer minor units (kobo/cents).
 * 2. Cash sales require amount_tendered >= total and change_due = amount_tendered - total.
 * 3. Non-cash sales (CARD, TRANSFER, OTHER) enforce amount_tendered = total and change_due = 0.
 * 4. Expected cash = opening_cash + cash_sales - cash_refunds.
 * 5. Variance = counted_cash - expected_cash (positive = over, negative = short, 0 = balanced).
 * 6. Access is strictly tenant-isolated and enforced by Migration M-12 Row Level Security.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { CashRegisterSession, RegisterSessionStatus, PaymentStatus } from '../../types/database';
import { PaymentMethod } from '../sales/types';

export type { CashRegisterSession, RegisterSessionStatus, PaymentStatus };

export interface OpenSessionParams {
  pharmacyId: string;
  branchId: string;
  cashierId: string;
  openingCash: number; // Integer minor units >= 0
  notes?: string | null;
}

export interface CloseSessionParams {
  sessionId: string;
  pharmacyId: string;
  countedCash: number; // Integer minor units >= 0
  expectedCash: number; // Integer minor units
  notes?: string | null;
}

export interface ShiftSalesBreakdown {
  cashSales: number;
  cardSales: number;
  transferSales: number;
  otherSales: number;
  totalSales: number;
  salesCount: number;
}

export interface ShiftReturnsBreakdown {
  cashRefunds: number;
  nonCashRefunds: number;
  totalRefunds: number;
  returnsCount: number;
}

export interface ShiftReconciliationSummary {
  openingCash: number;
  sales: ShiftSalesBreakdown;
  returns: ShiftReturnsBreakdown;
  expectedCash: number;
  countedCash?: number | null;
  variance?: number | null;
  status: 'BALANCED' | 'OVER' | 'SHORT' | 'IN_PROGRESS';
}

export interface DenominationCount {
  denomination: number; // In major units (e.g. 1000, 500, 200, 100, 50)
  count: number;
}

/**
 * Calculates total minor units from cash denomination counts.
 */
export function calculateDenominationsTotal(
  denominations: DenominationCount[],
  minorUnitsPerMajor: number = 100
): number {
  return denominations.reduce((acc, curr) => {
    const qty = Math.max(0, Math.floor(curr.count || 0));
    const denom = Math.max(0, Math.floor(curr.denomination || 0));
    return acc + qty * denom * minorUnitsPerMajor;
  }, 0);
}

/**
 * Pure deterministic calculation of shift reconciliation figures.
 */
export function computeShiftReconciliation(
  openingCash: number,
  sales: { total: number; payment_method: PaymentMethod; payment_status?: PaymentStatus }[],
  returns: { refund_amount: number; refund_payment_method: PaymentMethod }[],
  countedCash?: number | null
): ShiftReconciliationSummary {
  const cleanOpening = Math.max(0, Math.floor(openingCash || 0));

  let cashSales = 0;
  let cardSales = 0;
  let transferSales = 0;
  let otherSales = 0;
  let salesCount = 0;

  for (const s of sales) {
    const amount = Math.max(0, Math.floor(s.total || 0));
    salesCount++;

    // Authoritative Settlement Invariant: Only SETTLED sales affect physical drawer cash
    const isSettled = !s.payment_status || s.payment_status === 'SETTLED';

    if (s.payment_method === 'CASH') {
      if (isSettled) {
        cashSales += amount;
      }
    } else if (s.payment_method === 'CARD') {
      cardSales += amount;
    } else if (s.payment_method === 'TRANSFER') {
      transferSales += amount;
    } else {
      otherSales += amount;
    }
  }

  const totalSales = cashSales + cardSales + transferSales + otherSales;

  let cashRefunds = 0;
  let nonCashRefunds = 0;
  let returnsCount = 0;

  for (const r of returns) {
    const refund = Math.max(0, Math.floor(r.refund_amount || 0));
    returnsCount++;

    if (r.refund_payment_method === 'CASH') {
      cashRefunds += refund;
    } else {
      nonCashRefunds += refund;
    }
  }

  const totalRefunds = cashRefunds + nonCashRefunds;
  const expectedCash = cleanOpening + cashSales - cashRefunds;

  let variance: number | null = null;
  let status: 'BALANCED' | 'OVER' | 'SHORT' | 'IN_PROGRESS' = 'IN_PROGRESS';

  if (countedCash !== undefined && countedCash !== null) {
    const cleanCounted = Math.max(0, Math.floor(countedCash));
    variance = cleanCounted - expectedCash;
    if (variance === 0) {
      status = 'BALANCED';
    } else if (variance > 0) {
      status = 'OVER';
    } else {
      status = 'SHORT';
    }
  }

  return {
    openingCash: cleanOpening,
    sales: {
      cashSales,
      cardSales,
      transferSales,
      otherSales,
      totalSales,
      salesCount
    },
    returns: {
      cashRefunds,
      nonCashRefunds,
      totalRefunds,
      returnsCount
    },
    expectedCash,
    countedCash: countedCash !== undefined && countedCash !== null ? Math.floor(countedCash) : null,
    variance,
    status
  };
}

/**
 * Validates tender integrity for a sale transaction.
 */
export function validateTender(
  total: number,
  paymentMethod: PaymentMethod,
  amountTendered?: number
): {
  isValid: boolean;
  amountTendered: number;
  changeDue: number;
  error?: string;
} {
  const cleanTotal = Math.max(0, Math.floor(total));

  if (paymentMethod === 'CASH') {
    const tender = amountTendered !== undefined ? Math.floor(amountTendered) : cleanTotal;
    if (tender < cleanTotal) {
      return {
        isValid: false,
        amountTendered: tender,
        changeDue: 0,
        error: `Insufficient cash tendered: ${tender} is less than total ${cleanTotal}`
      };
    }
    return {
      isValid: true,
      amountTendered: tender,
      changeDue: Math.max(0, tender - cleanTotal)
    };
  }

  // Non-cash tender (CARD, TRANSFER, OTHER) enforces exact tender with 0 change
  return {
    isValid: true,
    amountTendered: cleanTotal,
    changeDue: 0
  };
}

const LOCAL_SESSION_KEY_PREFIX = 'pharmacyflow_active_session_';

/**
 * Local offline cache helper for active session
 */
export function getLocalActiveSession(pharmacyId: string, cashierId: string): CashRegisterSession | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_SESSION_KEY_PREFIX}${pharmacyId}_${cashierId}`);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setLocalActiveSession(session: CashRegisterSession | null, pharmacyId: string, cashierId: string): void {
  try {
    const key = `${LOCAL_SESSION_KEY_PREFIX}${pharmacyId}_${cashierId}`;
    if (session) {
      localStorage.setItem(key, JSON.stringify(session));
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Queries Supabase for the currently active/open register session for a cashier.
 */
export async function getActiveCashRegisterSession(
  supabase: SupabaseClient,
  pharmacyId: string,
  cashierId: string,
  branchId?: string
): Promise<CashRegisterSession | null> {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normCashier = cashierId.toLowerCase().trim();

  let query = supabase
    .from('cash_register_sessions')
    .select('*')
    .eq('pharmacy_id', normPharmacy)
    .eq('cashier_id', normCashier)
    .eq('status', 'OPEN')
    .order('opened_at', { ascending: false })
    .limit(1);

  if (branchId) {
    query = query.eq('branch_id', branchId.toLowerCase().trim());
  }

  const { data, error } = await query;

  if (error) {
    // Fall back to local storage if network or permissions fail
    return getLocalActiveSession(normPharmacy, normCashier);
  }

  const session = data && data.length > 0 ? (data[0] as CashRegisterSession) : null;
  setLocalActiveSession(session, normPharmacy, normCashier);
  return session;
}

/**
 * Opens a new cash register shift session.
 */
export async function openCashRegisterSession(
  supabase: SupabaseClient,
  params: OpenSessionParams
): Promise<{ success: boolean; session?: CashRegisterSession; error?: string }> {
  const normPharmacy = params.pharmacyId.toLowerCase().trim();
  const normBranch = params.branchId.toLowerCase().trim();
  const normCashier = params.cashierId.toLowerCase().trim();
  const openingCash = Math.max(0, Math.floor(params.openingCash));

  const sessionPayload = {
    id: crypto.randomUUID().toLowerCase(),
    pharmacy_id: normPharmacy,
    branch_id: normBranch,
    cashier_id: normCashier,
    opening_cash: openingCash,
    notes: params.notes ? params.notes.trim() : null,
    status: 'OPEN' as RegisterSessionStatus,
    opened_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from('cash_register_sessions')
    .insert(sessionPayload)
    .select('*')
    .single();

  if (error) {
    return { 
      success: false, 
      error: error.message || 'Cannot open register shift: active server connection required for cash drawer accountability.' 
    };
  }

  const session = data as CashRegisterSession;
  setLocalActiveSession(session, normPharmacy, normCashier);
  return { success: true, session };
}

/**
 * Computes shift metrics for an active session by querying sales and returns.
 */
export async function fetchShiftMetrics(
  supabase: SupabaseClient,
  pharmacyId: string,
  branchId: string,
  cashierId: string,
  openedAt: string,
  openingCash: number,
  closedAt?: string | null
): Promise<ShiftReconciliationSummary> {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  const normBranch = branchId.toLowerCase().trim();
  const normCashier = cashierId.toLowerCase().trim();

  // Query Sales within shift window
  let salesQuery = supabase
    .from('sales')
    .select('total, payment_method, payment_status, created_at')
    .eq('pharmacy_id', normPharmacy)
    .eq('branch_id', normBranch)
    .eq('cashier_id', normCashier)
    .gte('created_at', openedAt);

  if (closedAt) {
    salesQuery = salesQuery.lte('created_at', closedAt);
  }

  const { data: salesData } = await salesQuery;

  // Query Returns within shift window
  let returnsQuery = supabase
    .from('sale_returns')
    .select('refund_amount, refund_payment_method, created_at')
    .eq('pharmacy_id', normPharmacy)
    .eq('branch_id', normBranch)
    .eq('cashier_id', normCashier)
    .gte('created_at', openedAt);

  if (closedAt) {
    returnsQuery = returnsQuery.lte('created_at', closedAt);
  }

  const { data: returnsData } = await returnsQuery;

  const salesList = (salesData || []).map((s) => ({
    total: typeof s.total === 'number' ? s.total : 0,
    payment_method: s.payment_method as PaymentMethod,
    payment_status: s.payment_status as PaymentStatus
  }));

  const returnsList = (returnsData || []).map((r) => ({
    refund_amount: typeof r.refund_amount === 'number' ? r.refund_amount : 0,
    refund_payment_method: r.refund_payment_method as PaymentMethod
  }));

  return computeShiftReconciliation(openingCash, salesList, returnsList);
}

/**
 * Closes an open cash register session with counted cash and calculated variance.
 */
export async function closeCashRegisterSession(
  supabase: SupabaseClient,
  params: CloseSessionParams
): Promise<{ success: boolean; session?: CashRegisterSession; error?: string }> {
  const normPharmacy = params.pharmacyId.toLowerCase().trim();
  const countedCash = Math.max(0, Math.floor(params.countedCash));
  const expectedCash = Math.floor(params.expectedCash);
  const variance = countedCash - expectedCash;
  const closedAt = new Date().toISOString();

  // 1. Prefer Server-Authoritative RPC
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc('rpc_close_cash_register_session', {
      p_session_id: params.sessionId,
      p_pharmacy_id: normPharmacy,
      p_counted_cash: countedCash,
      p_notes: params.notes ? params.notes.trim() : null
    });

    if (!rpcError && rpcData) {
      const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;
      if (row) {
        const session = row as CashRegisterSession;
        setLocalActiveSession(null, normPharmacy, session.cashier_id);
        return { success: true, session };
      }
    }
  } catch {
    // Fall back to direct update if RPC is unavailable in client mocks
  }

  // 2. Direct Update Fallback (Governed by chk_register_sessions_closed_math & lifecycle trigger)
  const updatePayload = {
    closed_at: closedAt,
    counted_cash: countedCash,
    expected_cash: expectedCash,
    variance: variance,
    notes: params.notes ? params.notes.trim() : null,
    status: 'CLOSED' as RegisterSessionStatus
  };

  const { data, error } = await supabase
    .from('cash_register_sessions')
    .update(updatePayload)
    .eq('id', params.sessionId)
    .eq('pharmacy_id', normPharmacy)
    .select('*')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  const session = data as CashRegisterSession;
  setLocalActiveSession(null, normPharmacy, session.cashier_id);
  return { success: true, session };
}

/**
 * Lists register sessions for reporting and reconciliation.
 */
export async function listCashRegisterSessions(
  supabase: SupabaseClient,
  pharmacyId: string,
  options?: {
    branchId?: string;
    cashierId?: string;
    status?: RegisterSessionStatus;
    limit?: number;
  }
): Promise<CashRegisterSession[]> {
  const normPharmacy = pharmacyId.toLowerCase().trim();
  let query = supabase
    .from('cash_register_sessions')
    .select('*')
    .eq('pharmacy_id', normPharmacy)
    .order('opened_at', { ascending: false })
    .limit(options?.limit || 50);

  if (options?.branchId) {
    query = query.eq('branch_id', options.branchId.toLowerCase().trim());
  }

  if (options?.cashierId) {
    query = query.eq('cashier_id', options.cashierId.toLowerCase().trim());
  }

  if (options?.status) {
    query = query.eq('status', options.status);
  }

  const { data, error } = await query;
  if (error || !data) return [];
  return data as CashRegisterSession[];
}
