/**
 * PharmacyFlow Reports Domain Pure Calculations (Phase 5D-20)
 * 
 * Strict Financial Invariants:
 * 1. Integer minor units throughout.
 * 2. Zero-cost batch (cost_price = 0) is valid (line_cogs = 0).
 * 3. Never fallback to product.cost_price.
 * 4. Incomplete COGS is explicitly flagged when batch resolution fails.
 * 5. Restocked returns reduce COGS; non-restocked returns do NOT reduce COGS.
 * 6. Division by zero in gross margin % yields 0% (never NaN or Infinity).
 */

import {
  CogsCalculationResult,
  PaymentMethodBreakdownItem,
  DailySalesPoint,
  TopProductItem,
  ExpiryRiskBreakdown,
  InventoryValuationData,
  AdjustmentsAuditSummary,
  CashAuditData,
  CashierShiftAuditItem,
  ProcurementAnalyticsData,
  SupplierFulfillmentItem
} from './types';
import { PaymentMethod } from '../sales/types';

export interface RawSaleItem {
  id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface RawReturnItem {
  product_id: string;
  batch_id: string;
  quantity: number;
  restock_to_inventory: boolean;
}

export interface RawSale {
  id: string;
  created_at: string;
  total: number;
  payment_method: PaymentMethod;
  payment_status?: string;
  branch_id: string;
}

export interface RawReturn {
  id: string;
  created_at: string;
  refund_amount: number;
  refund_payment_method: string;
  branch_id: string;
}

export interface RawBatch {
  id: string;
  product_id: string;
  batch_number: string;
  quantity: number;
  cost_price: number;
  expiry_date: string;
}

export interface RawProduct {
  id: string;
  name: string;
  selling_price: number;
}

export interface RawShiftSession {
  id: string;
  cashier_id: string;
  status: string;
  opening_cash: number;
  counted_cash: number | null;
  expected_cash: number | null;
  variance: number | null;
  opened_at: string;
  closed_at: string | null;
}

export interface RawStockAdjustment {
  adjustment_type: string;
  quantity_delta: number;
}

export interface RawPurchase {
  id: string;
  supplier_id: string | null;
  total_cost: number;
}

export interface RawPurchaseItem {
  purchase_id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
}

/**
 * Authoritative COGS and Gross Profit derivation.
 */
export function calculateCogsAndProfit(params: {
  saleItems: RawSaleItem[];
  batchCostsMap: Map<string, number>; // batch_id -> cost_price in minor units
  netRevenue: number; // Integer minor units
  returnItems: RawReturnItem[];
}): CogsCalculationResult {
  const { saleItems, batchCostsMap, netRevenue, returnItems } = params;

  let grossResolvedCogs = 0;
  let unresolvedCogsLinesCount = 0;
  let unresolvedCogsQuantity = 0;

  for (const item of saleItems) {
    const qty = Math.max(0, Math.floor(item.quantity || 0));
    const batchId = (item.batch_id || '').toLowerCase().trim();

    if (batchCostsMap.has(batchId)) {
      const unitCost = Math.max(0, Math.floor(batchCostsMap.get(batchId)!));
      grossResolvedCogs += qty * unitCost;
    } else {
      // Unresolved batch: NEVER fallback to product.cost_price.
      // Exclude from resolved COGS and track discrepancy.
      unresolvedCogsLinesCount += 1;
      unresolvedCogsQuantity += qty;
    }
  }

  // Deduct acquisition cost of RESTOCKED return items only
  let restockedReturnCogsDeduction = 0;
  for (const ret of returnItems) {
    if (ret.restock_to_inventory) {
      const qty = Math.max(0, Math.floor(ret.quantity || 0));
      const batchId = (ret.batch_id || '').toLowerCase().trim();
      if (batchCostsMap.has(batchId)) {
        const unitCost = Math.max(0, Math.floor(batchCostsMap.get(batchId)!));
        restockedReturnCogsDeduction += qty * unitCost;
      }
    }
  }

  const netCogs = Math.max(0, grossResolvedCogs - restockedReturnCogsDeduction);
  const grossProfit = netRevenue - netCogs;

  let grossMarginPct = 0;
  if (netRevenue > 0) {
    // Avoid floating point drift: calculate in basis points (1/10000) then round to 2 decimals
    grossMarginPct = Math.round((grossProfit / netRevenue) * 10000) / 100;
  }

  const isCogsIncomplete = unresolvedCogsLinesCount > 0;
  const cogsStatus = isCogsIncomplete ? 'PARTIALLY_UNRESOLVED' : 'FULLY_RESOLVED';

  return {
    grossResolvedCogs,
    restockedReturnCogsDeduction,
    netCogs,
    grossProfit,
    grossMarginPct,
    isCogsIncomplete,
    unresolvedCogsLinesCount,
    unresolvedCogsQuantity,
    cogsStatus
  };
}

/**
 * Breakdown of sales across payment methods.
 */
export function calculatePaymentMethodBreakdown(
  sales: RawSale[]
): PaymentMethodBreakdownItem[] {
  const methodMap = new Map<PaymentMethod, { amount: number; count: number }>();
  const allowedMethods: PaymentMethod[] = ['CASH', 'TRANSFER', 'CARD', 'OTHER'];

  for (const m of allowedMethods) {
    methodMap.set(m, { amount: 0, count: 0 });
  }

  let totalVolume = 0;

  for (const s of sales) {
    // Only SETTLED sales are counted in finalized volume
    if (s.payment_status && s.payment_status !== 'SETTLED') continue;

    const method = allowedMethods.includes(s.payment_method) ? s.payment_method : 'OTHER';
    const amount = Math.max(0, Math.floor(s.total || 0));
    const current = methodMap.get(method)!;
    current.amount += amount;
    current.count += 1;
    totalVolume += amount;
  }

  const result: PaymentMethodBreakdownItem[] = [];
  for (const m of allowedMethods) {
    const cur = methodMap.get(m)!;
    const percentage = totalVolume > 0 ? Math.round((cur.amount / totalVolume) * 10000) / 100 : 0;
    result.push({
      method: m,
      amount: cur.amount,
      count: cur.count,
      percentage
    });
  }

  return result;
}

/**
 * Aggregates daily net revenue and transaction counts.
 */
export function calculateDailyTimeline(
  sales: RawSale[],
  returns: RawReturn[]
): DailySalesPoint[] {
  const dailyMap = new Map<string, { gross: number; refunds: number; count: number }>();

  for (const s of sales) {
    if (s.payment_status && s.payment_status !== 'SETTLED') continue;
    const dateKey = (s.created_at || '').slice(0, 10);
    if (!dateKey) continue;

    const cur = dailyMap.get(dateKey) || { gross: 0, refunds: 0, count: 0 };
    cur.gross += Math.max(0, Math.floor(s.total || 0));
    cur.count += 1;
    dailyMap.set(dateKey, cur);
  }

  for (const r of returns) {
    const dateKey = (r.created_at || '').slice(0, 10);
    if (!dateKey) continue;

    const cur = dailyMap.get(dateKey) || { gross: 0, refunds: 0, count: 0 };
    cur.refunds += Math.max(0, Math.floor(r.refund_amount || 0));
    dailyMap.set(dateKey, cur);
  }

  const sortedDates = Array.from(dailyMap.keys()).sort();
  return sortedDates.map((d) => {
    const item = dailyMap.get(d)!;
    return {
      date: d,
      grossRevenue: item.gross,
      refunds: item.refunds,
      netRevenue: Math.max(0, item.gross - item.refunds),
      transactionCount: item.count
    };
  });
}

/**
 * Top products by units sold and by revenue generated.
 */
export function calculateTopProducts(
  saleItems: RawSaleItem[],
  productsMap: Map<string, RawProduct>,
  limit: number = 10
): { byVolume: TopProductItem[]; byRevenue: TopProductItem[] } {
  const productAgg = new Map<string, { units: number; revenue: number }>();

  for (const item of saleItems) {
    const pId = (item.product_id || '').toLowerCase().trim();
    const cur = productAgg.get(pId) || { units: 0, revenue: 0 };
    cur.units += Math.max(0, Math.floor(item.quantity || 0));
    cur.revenue += Math.max(0, Math.floor(item.line_total || 0));
    productAgg.set(pId, cur);
  }

  const allItems: TopProductItem[] = [];
  for (const [pId, agg] of productAgg.entries()) {
    const prod = productsMap.get(pId);
    allItems.push({
      productId: pId,
      productName: prod?.name || `Product #${pId.slice(0, 8)}`,
      unitsSold: agg.units,
      revenue: agg.revenue
    });
  }

  const byVolume = [...allItems].sort((a, b) => b.unitsSold - a.unitsSold).slice(0, limit);
  const byRevenue = [...allItems].sort((a, b) => b.revenue - a.revenue).slice(0, limit);

  return { byVolume, byRevenue };
}

/**
 * Analyzes inventory valuation at retail and cost, plus expiry risk.
 */
export function calculateInventoryValuation(
  batches: RawBatch[],
  productsMap: Map<string, RawProduct>,
  referenceDate: Date = new Date()
): { valuation: InventoryValuationData; expiry: ExpiryRiskBreakdown } {
  let retailValuation = 0;
  let costValuation = 0;
  let totalUnitsCount = 0;

  let within30Days = 0;
  let within60Days = 0;
  let within90Days = 0;
  let expired = 0;
  let healthy = 0;

  const nowEpoch = referenceDate.getTime();
  const MS_PER_DAY = 24 * 60 * 60 * 1000;

  for (const b of batches) {
    const qty = Math.max(0, Math.floor(b.quantity || 0));
    if (qty <= 0) continue; // Do not value depleted batches

    totalUnitsCount += qty;
    const cost = Math.max(0, Math.floor(b.cost_price || 0));
    costValuation += qty * cost;

    const prod = productsMap.get(b.product_id.toLowerCase().trim());
    const retailPrice = prod ? Math.max(0, Math.floor(prod.selling_price || 0)) : 0;
    retailValuation += qty * retailPrice;

    // Expiry breakdown
    if (b.expiry_date) {
      const expEpoch = new Date(b.expiry_date).getTime();
      const diffDays = Math.ceil((expEpoch - nowEpoch) / MS_PER_DAY);

      if (diffDays <= 0) {
        expired += 1;
      } else if (diffDays <= 30) {
        within30Days += 1;
      } else if (diffDays <= 60) {
        within60Days += 1;
      } else if (diffDays <= 90) {
        within90Days += 1;
      } else {
        healthy += 1;
      }
    } else {
      healthy += 1;
    }
  }

  const expiry: ExpiryRiskBreakdown = {
    within30Days,
    within60Days,
    within90Days,
    expired,
    healthy
  };

  const valuation: InventoryValuationData = {
    retailValuation,
    costValuation,
    totalBatchesCount: batches.filter((b) => (b.quantity || 0) > 0).length,
    totalUnitsCount,
    expiryRisk: expiry,
    adjustmentsAudit: {
      positiveQuantity: 0,
      negativeQuantity: 0,
      netQuantityDelta: 0,
      adjustmentEventsCount: 0
    }
  };

  return { valuation, expiry };
}

/**
 * Aggregates stock adjustment / shrinkage figures.
 */
export function calculateAdjustmentsSummary(
  adjustments: RawStockAdjustment[]
): AdjustmentsAuditSummary {
  let positiveQuantity = 0;
  let negativeQuantity = 0;

  for (const adj of adjustments) {
    const delta = Math.floor(adj.quantity_delta || 0);
    if (delta > 0) {
      positiveQuantity += delta;
    } else if (delta < 0) {
      negativeQuantity += Math.abs(delta);
    }
  }

  return {
    positiveQuantity,
    negativeQuantity,
    netQuantityDelta: positiveQuantity - negativeQuantity,
    adjustmentEventsCount: adjustments.length
  };
}

/**
 * Aggregates cash register shift audit metrics.
 */
export function calculateCashAudit(sessions: RawShiftSession[]): CashAuditData {
  let closedSessions = 0;
  let openSessions = 0;
  let totalExpectedCash = 0;
  let totalCountedCash = 0;
  let netVariance = 0;
  let balancedSessionsCount = 0;
  let overageSessionsCount = 0;
  let shortageSessionsCount = 0;

  const cashierMap = new Map<string, { sessionCount: number; netVariance: number; balancedCount: number }>();

  for (const s of sessions) {
    const cashierId = s.cashier_id || 'UNKNOWN';
    const cStat = cashierMap.get(cashierId) || { sessionCount: 0, netVariance: 0, balancedCount: 0 };
    cStat.sessionCount += 1;

    if (s.status === 'CLOSED') {
      closedSessions += 1;
      const expected = Math.floor(s.expected_cash || 0);
      const counted = Math.floor(s.counted_cash || 0);
      const variance = Math.floor(s.variance || (counted - expected));

      totalExpectedCash += expected;
      totalCountedCash += counted;
      netVariance += variance;
      cStat.netVariance += variance;

      if (variance === 0) {
        balancedSessionsCount += 1;
        cStat.balancedCount += 1;
      } else if (variance > 0) {
        overageSessionsCount += 1;
      } else {
        shortageSessionsCount += 1;
      }
    } else {
      openSessions += 1;
    }

    cashierMap.set(cashierId, cStat);
  }

  const balancedRatePct =
    closedSessions > 0 ? Math.round((balancedSessionsCount / closedSessions) * 10000) / 100 : 100;

  const cashierAudit: CashierShiftAuditItem[] = [];
  for (const [cId, stat] of cashierMap.entries()) {
    cashierAudit.push({
      cashierId: cId,
      sessionCount: stat.sessionCount,
      netVariance: stat.netVariance,
      balancedCount: stat.balancedCount
    });
  }

  return {
    totalSessions: sessions.length,
    closedSessions,
    openSessions,
    totalExpectedCash,
    totalCountedCash,
    netVariance,
    balancedSessionsCount,
    overageSessionsCount,
    shortageSessionsCount,
    balancedRatePct,
    cashierAudit
  };
}

/**
 * Aggregates operational and financial procurement figures.
 */
export function calculateProcurementAnalytics(
  purchases: RawPurchase[],
  purchaseItems: RawPurchaseItem[],
  suppliersMap: Map<string, string> // supplierId -> supplierName
): ProcurementAnalyticsData {
  let totalFinancialSpend = 0;
  const supplierAgg = new Map<string, { shipments: number; units: number; cost: number }>();

  for (const p of purchases) {
    const sId = (p.supplier_id || 'UNKNOWN').toLowerCase().trim();
    const cost = Math.max(0, Math.floor(p.total_cost || 0));
    totalFinancialSpend += cost;

    const cur = supplierAgg.get(sId) || { shipments: 0, units: 0, cost: 0 };
    cur.shipments += 1;
    cur.cost += cost;
    supplierAgg.set(sId, cur);
  }

  let totalUnitsDelivered = 0;
  for (const pi of purchaseItems) {
    const qty = Math.max(0, Math.floor(pi.quantity || 0));
    totalUnitsDelivered += qty;

    // Find supplier from purchase parent if possible
    const p = purchases.find((x) => x.id === pi.purchase_id);
    if (p) {
      const sId = (p.supplier_id || 'UNKNOWN').toLowerCase().trim();
      const cur = supplierAgg.get(sId);
      if (cur) {
        cur.units += qty;
      }
    }
  }

  const supplierBreakdown: SupplierFulfillmentItem[] = [];
  for (const [sId, agg] of supplierAgg.entries()) {
    const name = suppliersMap.get(sId) || (sId === 'unknown' ? 'Unassigned Supplier' : `Supplier #${sId.slice(0, 8)}`);
    supplierBreakdown.push({
      supplierId: sId,
      supplierName: name,
      shipmentsCount: agg.shipments,
      unitsDelivered: agg.units,
      totalCost: agg.cost
    });
  }

  supplierBreakdown.sort((a, b) => b.totalCost - a.totalCost);

  return {
    inboundShipmentsCount: purchases.length,
    totalUnitsDelivered,
    activeSuppliersCount: supplierAgg.size,
    totalFinancialSpend,
    supplierBreakdown
  };
}
