/**
 * PharmacyFlow Reports Domain Data Fetcher & Aggregator Service (Phase 5D-20)
 * 
 * Strict Security Boundaries:
 * 1. Read-Only, Online-Only.
 * 2. Tenant isolation enforced on all queries (eq('pharmacy_id', pharmacyId)).
 * 3. Pharmacists are strictly and authoritatively locked to default_branch_id.
 *    Client-supplied branchId is discarded for PHARMACIST role.
 * 4. Cashiers are strictly denied report generation.
 * 5. COGS derives exclusively from authoritative historical inventory_batches.cost_price.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import {
  FullReportPayload,
  ReportScopeParams,
  SummaryKpiMetrics,
  SalesAnalyticsData,
  InventoryValuationData,
  CashAuditData,
  ProcurementAnalyticsData
} from './types';
import {
  calculateCogsAndProfit,
  calculatePaymentMethodBreakdown,
  calculateDailyTimeline,
  calculateTopProducts,
  calculateInventoryValuation,
  calculateAdjustmentsSummary,
  calculateCashAudit,
  calculateProcurementAnalytics,
  RawSaleItem,
  RawReturnItem,
  RawSale,
  RawReturn,
  RawBatch,
  RawProduct,
  RawShiftSession,
  RawStockAdjustment,
  RawPurchase,
  RawPurchaseItem
} from './calculations';

export interface GenerateReportResult {
  success: boolean;
  data?: FullReportPayload;
  error?: string;
  code?: 'FORBIDDEN_CASHIER' | 'FORBIDDEN_UNAUTHORIZED' | 'MISSING_BRANCH' | 'FETCH_ERROR';
}

/**
 * Resolves the authoritative effective branch filter based on user role.
 */
export function resolveEffectiveBranchId(params: ReportScopeParams): string | null {
  if (params.role === 'PHARMACIST') {
    // Security Rule: For Pharmacists, strictly use defaultBranchId.
    // Untrusted client-supplied branchId is completely ignored.
    return params.defaultBranchId || null;
  }

  // OWNER and MANAGER can select any branch or null ("All Branches")
  if (!params.branchId || params.branchId === 'all') {
    return null;
  }

  return params.branchId;
}

/**
 * Generates the consolidated report across sales, COGS, inventory, shifts, and procurement.
 */
export async function generatePharmacyReport(
  supabase: SupabaseClient,
  params: ReportScopeParams
): Promise<GenerateReportResult> {
  try {
    // 1. Role Boundary Verification
    if (params.role === 'CASHIER') {
      return {
        success: false,
        error: 'FORBIDDEN: Cashiers do not have reports access.',
        code: 'FORBIDDEN_CASHIER'
      };
    }

    if (!params.pharmacyId) {
      return {
        success: false,
        error: 'INVALID_REQUEST: Missing pharmacy ID.',
        code: 'FETCH_ERROR'
      };
    }

    // 2. Resolve Authoritative Branch Scope
    const effectiveBranchId = resolveEffectiveBranchId(params);
    const { startIso, endIso } = params.dateRange;

    // 3. Query Settled Sales within Date & Branch Scope
    let salesQuery = supabase
      .from('sales')
      .select('id, created_at, total, payment_method, payment_status, branch_id')
      .eq('pharmacy_id', params.pharmacyId)
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    if (effectiveBranchId) {
      salesQuery = salesQuery.eq('branch_id', effectiveBranchId);
    }

    const { data: salesRows, error: salesErr } = await salesQuery;
    if (salesErr) {
      return { success: false, error: `Failed to fetch sales: ${salesErr.message}`, code: 'FETCH_ERROR' };
    }
    const sales: RawSale[] = (salesRows || []) as RawSale[];
    const settledSales = sales.filter((s) => !s.payment_status || s.payment_status === 'SETTLED');

    // 4. Query Returns within Date & Branch Scope
    let returnsQuery = supabase
      .from('sale_returns')
      .select('id, created_at, refund_amount, refund_payment_method, branch_id')
      .eq('pharmacy_id', params.pharmacyId)
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    if (effectiveBranchId) {
      returnsQuery = returnsQuery.eq('branch_id', effectiveBranchId);
    }

    const { data: returnsRows, error: returnsErr } = await returnsQuery;
    if (returnsErr) {
      return { success: false, error: `Failed to fetch returns: ${returnsErr.message}`, code: 'FETCH_ERROR' };
    }
    const returns: RawReturn[] = (returnsRows || []) as RawReturn[];

    // 5. Query Sale Line Items for COGS & Top Products
    const saleIds = settledSales.map((s) => s.id);
    let saleItems: RawSaleItem[] = [];

    if (saleIds.length > 0) {
      // Chunk saleIds if needed (PostgreSQL limit)
      const { data: itemsRows, error: itemsErr } = await supabase
        .from('sale_items')
        .select('id, product_id, batch_id, quantity, unit_price, line_total')
        .eq('pharmacy_id', params.pharmacyId)
        .in('sale_id', saleIds);

      if (itemsErr) {
        return { success: false, error: `Failed to fetch sale items: ${itemsErr.message}`, code: 'FETCH_ERROR' };
      }
      saleItems = (itemsRows || []) as RawSaleItem[];
    }

    // 6. Query Return Items for Restocked COGS Deductions
    const returnIds = returns.map((r) => r.id);
    let returnItems: RawReturnItem[] = [];

    if (returnIds.length > 0) {
      const { data: retItemsRows, error: retItemsErr } = await supabase
        .from('return_items')
        .select('product_id, batch_id, quantity, restock_to_inventory')
        .eq('pharmacy_id', params.pharmacyId)
        .in('return_id', returnIds);

      if (retItemsErr) {
        return { success: false, error: `Failed to fetch return items: ${retItemsErr.message}`, code: 'FETCH_ERROR' };
      }
      returnItems = (retItemsRows || []) as RawReturnItem[];
    }

    // 7. Resolve Authoritative Historical Batches for COGS
    // Extract unique batch IDs from both sale_items and return_items
    const distinctBatchIdsSet = new Set<string>();
    for (const si of saleItems) {
      if (si.batch_id) distinctBatchIdsSet.add(si.batch_id.toLowerCase().trim());
    }
    for (const ri of returnItems) {
      if (ri.batch_id) distinctBatchIdsSet.add(ri.batch_id.toLowerCase().trim());
    }

    const batchCostsMap = new Map<string, number>();
    if (distinctBatchIdsSet.size > 0) {
      const distinctBatchIds = Array.from(distinctBatchIdsSet);
      const { data: batchRows, error: batchErr } = await supabase
        .from('inventory_batches')
        .select('id, cost_price')
        .eq('pharmacy_id', params.pharmacyId)
        .in('id', distinctBatchIds);

      if (batchErr) {
        return { success: false, error: `Failed to fetch batches: ${batchErr.message}`, code: 'FETCH_ERROR' };
      }

      for (const b of batchRows || []) {
        batchCostsMap.set(b.id.toLowerCase().trim(), Math.floor(b.cost_price || 0));
      }
    }

    // 8. Query Products Catalog for Names and Retail Selling Prices
    const { data: productRows, error: prodErr } = await supabase
      .from('products')
      .select('id, name, selling_price')
      .eq('pharmacy_id', params.pharmacyId);

    if (prodErr) {
      return { success: false, error: `Failed to fetch products: ${prodErr.message}`, code: 'FETCH_ERROR' };
    }
    const productsMap = new Map<string, RawProduct>();
    for (const p of productRows || []) {
      productsMap.set(p.id.toLowerCase().trim(), p as RawProduct);
    }

    // 9. Query Current Inventory Batches for Valuation & Expiry Risk
    let currentBatchesQuery = supabase
      .from('inventory_batches')
      .select('id, product_id, batch_number, quantity, cost_price, expiry_date')
      .eq('pharmacy_id', params.pharmacyId);

    if (effectiveBranchId) {
      currentBatchesQuery = currentBatchesQuery.eq('branch_id', effectiveBranchId);
    }

    const { data: currentBatchesRows, error: curBatchesErr } = await currentBatchesQuery;
    if (curBatchesErr) {
      return { success: false, error: `Failed to fetch inventory batches: ${curBatchesErr.message}`, code: 'FETCH_ERROR' };
    }
    const currentBatches: RawBatch[] = (currentBatchesRows || []) as RawBatch[];

    // 10. Query Stock Adjustments for Shrinkage Audit
    let adjQuery = supabase
      .from('stock_adjustments')
      .select('adjustment_type, quantity_delta')
      .eq('pharmacy_id', params.pharmacyId)
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    if (effectiveBranchId) {
      adjQuery = adjQuery.eq('branch_id', effectiveBranchId);
    }

    const { data: adjRows, error: adjErr } = await adjQuery;
    if (adjErr) {
      return { success: false, error: `Failed to fetch adjustments: ${adjErr.message}`, code: 'FETCH_ERROR' };
    }
    const adjustments: RawStockAdjustment[] = (adjRows || []) as RawStockAdjustment[];

    // 11. Query Cash Register Sessions for Cash Shift Audit
    let sessionsQuery = supabase
      .from('cash_register_sessions')
      .select('id, cashier_id, status, opening_cash, counted_cash, expected_cash, variance, opened_at, closed_at')
      .eq('pharmacy_id', params.pharmacyId)
      .gte('opened_at', startIso)
      .lte('opened_at', endIso);

    if (effectiveBranchId) {
      sessionsQuery = sessionsQuery.eq('branch_id', effectiveBranchId);
    }

    const { data: sessionRows, error: sessErr } = await sessionsQuery;
    if (sessErr) {
      return { success: false, error: `Failed to fetch shift sessions: ${sessErr.message}`, code: 'FETCH_ERROR' };
    }
    const sessions: RawShiftSession[] = (sessionRows || []) as RawShiftSession[];

    // 12. Query Purchases and Suppliers for Procurement Analytics
    let purchasesQuery = supabase
      .from('purchases')
      .select('id, supplier_id, total_cost')
      .eq('pharmacy_id', params.pharmacyId)
      .gte('created_at', startIso)
      .lte('created_at', endIso);

    if (effectiveBranchId) {
      purchasesQuery = purchasesQuery.eq('branch_id', effectiveBranchId);
    }

    const { data: purchaseRows, error: purchErr } = await purchasesQuery;
    if (purchErr) {
      return { success: false, error: `Failed to fetch purchases: ${purchErr.message}`, code: 'FETCH_ERROR' };
    }
    const purchases: RawPurchase[] = (purchaseRows || []) as RawPurchase[];

    let purchaseItems: RawPurchaseItem[] = [];
    if (purchases.length > 0) {
      const purchaseIds = purchases.map((p) => p.id);
      const { data: piRows, error: piErr } = await supabase
        .from('purchase_items')
        .select('purchase_id, product_id, batch_id, quantity, unit_cost, total_cost')
        .eq('pharmacy_id', params.pharmacyId)
        .in('purchase_id', purchaseIds);

      if (piErr) {
        return { success: false, error: `Failed to fetch purchase items: ${piErr.message}`, code: 'FETCH_ERROR' };
      }
      purchaseItems = (piRows || []) as RawPurchaseItem[];
    }

    // Query Suppliers Directory for Names
    const { data: supplierRows, error: suppErr } = await supabase
      .from('suppliers')
      .select('id, name')
      .eq('pharmacy_id', params.pharmacyId);

    if (suppErr) {
      return { success: false, error: `Failed to fetch suppliers: ${suppErr.message}`, code: 'FETCH_ERROR' };
    }
    const suppliersMap = new Map<string, string>();
    for (const s of supplierRows || []) {
      suppliersMap.set(s.id.toLowerCase().trim(), s.name);
    }

    // ==========================================
    // PERFORM DETERMINISTIC REPORT DERIVATIONS
    // ==========================================

    // Revenue totals
    const grossSales = settledSales.reduce((acc, curr) => acc + Math.max(0, Math.floor(curr.total || 0)), 0);
    const totalRefunds = returns.reduce((acc, curr) => acc + Math.max(0, Math.floor(curr.refund_amount || 0)), 0);
    const netRevenue = Math.max(0, grossSales - totalRefunds);
    const transactionCount = settledSales.length;
    const averageTicket = transactionCount > 0 ? Math.round(netRevenue / transactionCount) : 0;

    // COGS & Profit
    const cogsResult = calculateCogsAndProfit({
      saleItems,
      batchCostsMap,
      netRevenue,
      returnItems
    });

    // Sales Analytics
    const paymentMethodBreakdown = calculatePaymentMethodBreakdown(settledSales);
    const dailyTimeline = calculateDailyTimeline(settledSales, returns);
    const { byVolume: topProductsByVolume, byRevenue: topProductsByRevenue } = calculateTopProducts(
      saleItems,
      productsMap
    );

    const salesAnalytics: SalesAnalyticsData = {
      grossSales,
      totalRefunds,
      netRevenue,
      transactionCount,
      paymentMethodBreakdown,
      dailyTimeline,
      topProductsByVolume,
      topProductsByRevenue
    };

    // Inventory Valuation & Expiry
    const { valuation: invValuation, expiry: expiryRisk } = calculateInventoryValuation(
      currentBatches,
      productsMap
    );
    const adjustmentsAudit = calculateAdjustmentsSummary(adjustments);
    invValuation.adjustmentsAudit = adjustmentsAudit;

    const inventoryData: InventoryValuationData = invValuation;

    // Cash Audit
    const cashAuditData: CashAuditData = calculateCashAudit(sessions);

    // Procurement Analytics
    const procurementData: ProcurementAnalyticsData = calculateProcurementAnalytics(
      purchases,
      purchaseItems,
      suppliersMap
    );

    // Summary KPIs
    const summary: SummaryKpiMetrics = {
      netRevenue,
      grossProfit: cogsResult.grossProfit,
      grossMarginPct: cogsResult.grossMarginPct,
      isCogsIncomplete: cogsResult.isCogsIncomplete,
      unresolvedCogsLinesCount: cogsResult.unresolvedCogsLinesCount,
      unresolvedCogsQuantity: cogsResult.unresolvedCogsQuantity,
      transactionCount,
      averageTicket,
      cashDiscrepancy: cashAuditData.netVariance,
      expiringBatchesCount30D: expiryRisk.within30Days + expiryRisk.expired,
      expiringBatchesCount60D: expiryRisk.within60Days,
      expiringBatchesCount90D: expiryRisk.within90Days
    };

    const payload: FullReportPayload = {
      pharmacyId: params.pharmacyId,
      effectiveBranchId,
      dateRange: params.dateRange,
      summary,
      sales: salesAnalytics,
      cogs: cogsResult,
      inventory: inventoryData,
      cash: cashAuditData,
      procurement: procurementData,
      generatedAt: new Date().toISOString()
    };

    return { success: true, data: payload };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown report generation error';
    return { success: false, error: msg, code: 'FETCH_ERROR' };
  }
}
