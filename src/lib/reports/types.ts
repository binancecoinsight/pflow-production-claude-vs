/**
 * PharmacyFlow Reports, Analytics & Financial Intelligence Domain Types (Phase 5D-20)
 * 
 * Strict Architectural Rules:
 * 1. Monetary calculations are in integer minor units (kobo/cents).
 * 2. Pure Read-Model — zero database mutations.
 * 3. Pharmacists are strictly scoped to pharmacy_members.default_branch_id.
 * 4. COGS derives strictly from authoritative historical inventory_batches.cost_price.
 * 5. If batch cannot be resolved, is_cogs_incomplete is true and unresolved items are tracked.
 */

import { UserRole } from '../../types/database';
import { PaymentMethod } from '../sales/types';

export type ReportDatePreset = 'TODAY' | '7D' | '30D' | 'CUSTOM';

export interface ReportDateRange {
  startIso: string; // UTC ISO string start (00:00:00.000Z)
  endIso: string;   // UTC ISO string end (23:59:59.999Z)
  preset: ReportDatePreset;
}

export interface ReportScopeParams {
  pharmacyId: string;
  branchId?: string | null; // Requested branch ID
  role: UserRole;
  defaultBranchId?: string | null; // Authoritative assignment for PHARMACIST
  dateRange: ReportDateRange;
}

export interface CogsCalculationResult {
  grossResolvedCogs: number; // Integer minor units
  restockedReturnCogsDeduction: number; // Integer minor units
  netCogs: number; // Integer minor units
  grossProfit: number; // Integer minor units
  grossMarginPct: number; // Float rounded to 2 decimal places (e.g. 28.5)
  isCogsIncomplete: boolean;
  unresolvedCogsLinesCount: number;
  unresolvedCogsQuantity: number;
  cogsStatus: 'FULLY_RESOLVED' | 'PARTIALLY_UNRESOLVED';
}

export interface SummaryKpiMetrics {
  netRevenue: number; // Integer minor units
  grossProfit: number; // Integer minor units
  grossMarginPct: number;
  isCogsIncomplete: boolean;
  unresolvedCogsLinesCount: number;
  unresolvedCogsQuantity: number;
  transactionCount: number;
  averageTicket: number; // Integer minor units
  cashDiscrepancy: number; // Integer minor units (net shift variance)
  expiringBatchesCount30D: number;
  expiringBatchesCount60D: number;
  expiringBatchesCount90D: number;
}

export interface PaymentMethodBreakdownItem {
  method: PaymentMethod;
  amount: number; // Integer minor units
  count: number;
  percentage: number; // 0 to 100
}

export interface DailySalesPoint {
  date: string; // YYYY-MM-DD
  grossRevenue: number; // Integer minor units
  refunds: number; // Integer minor units
  netRevenue: number; // Integer minor units
  transactionCount: number;
}

export interface TopProductItem {
  productId: string;
  productName: string;
  unitsSold: number;
  revenue: number; // Integer minor units
}

export interface SalesAnalyticsData {
  grossSales: number; // Integer minor units
  totalRefunds: number; // Integer minor units
  netRevenue: number; // Integer minor units
  transactionCount: number;
  paymentMethodBreakdown: PaymentMethodBreakdownItem[];
  dailyTimeline: DailySalesPoint[];
  topProductsByVolume: TopProductItem[];
  topProductsByRevenue: TopProductItem[];
}

export interface ExpiryRiskBreakdown {
  within30Days: number;
  within60Days: number;
  within90Days: number;
  expired: number;
  healthy: number;
}

export interface AdjustmentsAuditSummary {
  positiveQuantity: number;
  negativeQuantity: number;
  netQuantityDelta: number;
  adjustmentEventsCount: number;
}

export interface InventoryValuationData {
  retailValuation: number; // Integer minor units
  costValuation: number; // Integer minor units
  totalBatchesCount: number;
  totalUnitsCount: number;
  expiryRisk: ExpiryRiskBreakdown;
  adjustmentsAudit: AdjustmentsAuditSummary;
}

export interface CashierShiftAuditItem {
  cashierId: string;
  sessionCount: number;
  netVariance: number; // Integer minor units
  balancedCount: number;
}

export interface CashAuditData {
  totalSessions: number;
  closedSessions: number;
  openSessions: number;
  totalExpectedCash: number; // Integer minor units
  totalCountedCash: number; // Integer minor units
  netVariance: number; // Integer minor units
  balancedSessionsCount: number;
  overageSessionsCount: number;
  shortageSessionsCount: number;
  balancedRatePct: number; // 0 to 100
  cashierAudit: CashierShiftAuditItem[];
}

export interface SupplierFulfillmentItem {
  supplierId: string;
  supplierName: string;
  shipmentsCount: number;
  unitsDelivered: number;
  totalCost: number; // Integer minor units
}

export interface ProcurementAnalyticsData {
  inboundShipmentsCount: number;
  totalUnitsDelivered: number;
  activeSuppliersCount: number;
  totalFinancialSpend: number; // Integer minor units
  supplierBreakdown: SupplierFulfillmentItem[];
}

export interface FullReportPayload {
  pharmacyId: string;
  effectiveBranchId: string | null; // null represents "All Branches"
  dateRange: ReportDateRange;
  summary: SummaryKpiMetrics;
  sales: SalesAnalyticsData;
  cogs: CogsCalculationResult;
  inventory: InventoryValuationData;
  cash: CashAuditData;
  procurement: ProcurementAnalyticsData;
  generatedAt: string; // ISO string
}
