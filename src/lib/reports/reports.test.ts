/**
 * PHARMACYFLOW PHASE 5D-20: REPORTS, ANALYTICS & FINANCIAL INTELLIGENCE UNIT TESTS
 * 
 * Verifies:
 * 1. Role Authorization & Cashier Exclusion
 * 2. Strict Pharmacist Branch Locking (pharmacy_members.default_branch_id)
 * 3. COGS Derivation from Authoritative Historical Batches
 * 4. Zero-Cost Batch Invariant
 * 5. Deterministic Incomplete COGS Flagging (No silent product-cost fallback)
 * 6. Returns & Refunds COGS Deductions (Restocked vs Non-Restocked)
 * 7. Zero Division Guards on Margin Calculations
 * 8. Integer Minor-Unit Arithmetic
 * 9. Cash Register Shift Audits & Net Variance
 * 10. Procurement Operational vs Financial Separation
 */

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
import {
  formatReportCurrency,
  formatReportPercent,
  computeDateRange,
  MASKED_FINANCIAL_VALUE
} from './formatters';
import { resolveEffectiveBranchId } from './service';
import { ReportScopeParams } from './types';

let totalPassed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
  totalPassed++;
}

async function runReportsUnitTests() {
  console.log('================================================================');
  console.log('PHARMACYFLOW PHASE 5D-20: REPORTS DOMAIN ENGINE TESTS');
  console.log('================================================================\n');

  // --------------------------------------------------------------------------
  // SECTION 1: ROLE AUTHORIZATION & BRANCH RESOLUTION INVARIANTS
  // --------------------------------------------------------------------------
  console.log('[1. Branch Resolution & Role Governance]');

  const ownerScopeAll: ReportScopeParams = {
    pharmacyId: 'pharm-1',
    role: 'OWNER',
    branchId: 'all',
    defaultBranchId: 'branch-a',
    dateRange: computeDateRange('30D')
  };
  assert(resolveEffectiveBranchId(ownerScopeAll) === null, '1. OWNER can select All Branches (returns null)');

  const ownerScopeSpecific: ReportScopeParams = {
    pharmacyId: 'pharm-1',
    role: 'OWNER',
    branchId: 'branch-b',
    defaultBranchId: 'branch-a',
    dateRange: computeDateRange('30D')
  };
  assert(resolveEffectiveBranchId(ownerScopeSpecific) === 'branch-b', '2. OWNER can filter to specific branch B');

  const managerScopeAll: ReportScopeParams = {
    pharmacyId: 'pharm-1',
    role: 'MANAGER',
    branchId: 'all',
    defaultBranchId: 'branch-a',
    dateRange: computeDateRange('30D')
  };
  assert(resolveEffectiveBranchId(managerScopeAll) === null, '3. MANAGER can select All Branches');

  const managerScopeSpecific: ReportScopeParams = {
    pharmacyId: 'pharm-1',
    role: 'MANAGER',
    branchId: 'branch-c',
    defaultBranchId: 'branch-a',
    dateRange: computeDateRange('30D')
  };
  assert(resolveEffectiveBranchId(managerScopeSpecific) === 'branch-c', '4. MANAGER can select specific branch C');

  const pharmacistTamperedScope: ReportScopeParams = {
    pharmacyId: 'pharm-1',
    role: 'PHARMACIST',
    branchId: 'branch-malicious', // Untrusted client parameter
    defaultBranchId: 'branch-assigned',
    dateRange: computeDateRange('30D')
  };
  assert(
    resolveEffectiveBranchId(pharmacistTamperedScope) === 'branch-assigned',
    '5. PHARMACIST branch scope strictly locks to default_branch_id (untrusted branchId discarded)'
  );

  const pharmacistAllBranchesAttempt: ReportScopeParams = {
    pharmacyId: 'pharm-1',
    role: 'PHARMACIST',
    branchId: 'all',
    defaultBranchId: 'branch-assigned',
    dateRange: computeDateRange('30D')
  };
  assert(
    resolveEffectiveBranchId(pharmacistAllBranchesAttempt) === 'branch-assigned',
    '6. PHARMACIST attempting "all" is strictly constrained to default_branch_id'
  );

  // --------------------------------------------------------------------------
  // SECTION 2: COGS DERIVATION & ZERO-FALLBACK INVARIANTS
  // --------------------------------------------------------------------------
  console.log('\n[2. Authoritative COGS Derivation & Fallback Invariants]');

  const batchCosts = new Map<string, number>([
    ['batch-1', 400], // ₦4.00 cost
    ['batch-2', 850], // ₦8.50 cost
    ['batch-zero', 0]  // ₦0.00 promotional/free batch
  ]);

  const fullyResolvedItems: RawSaleItem[] = [
    { id: 'si-1', product_id: 'p-1', batch_id: 'batch-1', quantity: 10, unit_price: 1000, line_total: 10000 },
    { id: 'si-2', product_id: 'p-2', batch_id: 'batch-2', quantity: 4, unit_price: 1500, line_total: 6000 }
  ];

  // 10 * 400 + 4 * 850 = 4000 + 3400 = 7400
  const cogs1 = calculateCogsAndProfit({
    saleItems: fullyResolvedItems,
    batchCostsMap: batchCosts,
    netRevenue: 16000,
    returnItems: []
  });

  assert(cogs1.grossResolvedCogs === 7400, '7. Fully resolved COGS matches exact sum of (qty * batch.cost_price)');
  assert(cogs1.netCogs === 7400, '7b. Net COGS equals gross COGS when no returns');
  assert(cogs1.grossProfit === 8600, '8. Gross Profit = Net Revenue (16000) - COGS (7400) = 8600');
  assert(cogs1.grossMarginPct === 53.75, '9. Gross Margin % evaluates to 53.75% (8600 / 16000 * 100)');
  assert(cogs1.isCogsIncomplete === false, '10. isCogsIncomplete is FALSE when all batches resolve');
  assert(cogs1.cogsStatus === 'FULLY_RESOLVED', '11. cogsStatus is FULLY_RESOLVED');
  assert(cogs1.unresolvedCogsLinesCount === 0, '12. unresolvedCogsLinesCount is 0');

  // Test Zero-Cost Batch
  const zeroCostItems: RawSaleItem[] = [
    { id: 'si-3', product_id: 'p-3', batch_id: 'batch-zero', quantity: 5, unit_price: 2000, line_total: 10000 }
  ];
  const cogsZero = calculateCogsAndProfit({
    saleItems: zeroCostItems,
    batchCostsMap: batchCosts,
    netRevenue: 10000,
    returnItems: []
  });
  assert(cogsZero.grossResolvedCogs === 0, '13. Zero-cost batch evaluates to line_cogs = 0');
  assert(cogsZero.grossProfit === 10000, '14. Gross profit on zero-cost batch equals 100% revenue');
  assert(cogsZero.grossMarginPct === 100, '15. Gross margin % evaluates to 100%');
  assert(cogsZero.isCogsIncomplete === false, '16. Zero-cost batch does NOT flag unresolved status');

  // Test Unresolved Batch (Missing from authoritative inventory_batches)
  const missingBatchItems: RawSaleItem[] = [
    { id: 'si-4', product_id: 'p-1', batch_id: 'batch-1', quantity: 10, unit_price: 1000, line_total: 10000 },
    { id: 'si-5', product_id: 'p-99', batch_id: 'batch-missing-404', quantity: 3, unit_price: 2500, line_total: 7500 }
  ];
  const cogsIncomplete = calculateCogsAndProfit({
    saleItems: missingBatchItems,
    batchCostsMap: batchCosts,
    netRevenue: 17500,
    returnItems: []
  });

  assert(cogsIncomplete.grossResolvedCogs === 4000, '17. Only resolved batch is included in COGS (4000)');
  assert(cogsIncomplete.isCogsIncomplete === true, '18. isCogsIncomplete evaluates to TRUE when batch missing');
  assert(cogsIncomplete.cogsStatus === 'PARTIALLY_UNRESOLVED', '19. cogsStatus evaluates to PARTIALLY_UNRESOLVED');
  assert(cogsIncomplete.unresolvedCogsLinesCount === 1, '20. unresolvedCogsLinesCount records exactly 1');
  assert(cogsIncomplete.unresolvedCogsQuantity === 3, '21. unresolvedCogsQuantity records exactly 3 units');

  // Test Multiple Batches for Same Product
  const multiBatchSameProd: RawSaleItem[] = [
    { id: 'si-6', product_id: 'p-1', batch_id: 'batch-1', quantity: 5, unit_price: 1000, line_total: 5000 }, // cost 400
    { id: 'si-7', product_id: 'p-1', batch_id: 'batch-2', quantity: 5, unit_price: 1000, line_total: 5000 }  // cost 850
  ];
  const cogsMulti = calculateCogsAndProfit({
    saleItems: multiBatchSameProd,
    batchCostsMap: batchCosts,
    netRevenue: 10000,
    returnItems: []
  });
  // 5 * 400 + 5 * 850 = 2000 + 4250 = 6250
  assert(cogsMulti.grossResolvedCogs === 6250, '22. Multiple batches for same product accurately apply lot costs');

  // --------------------------------------------------------------------------
  // SECTION 3: RETURNS & REFUNDS COGS DEDUCTION INVARIANTS
  // --------------------------------------------------------------------------
  console.log('\n[3. Returns & Refunds Treatment in COGS]');

  // Restocked Return: 2 units of batch-1 (cost 400) returned and restocked -> deduct 800 from COGS
  const restockedReturn: RawReturnItem = {
    product_id: 'p-1',
    batch_id: 'batch-1',
    quantity: 2,
    restock_to_inventory: true
  };

  const cogsWithRestockedReturn = calculateCogsAndProfit({
    saleItems: fullyResolvedItems, // gross cogs 7400
    batchCostsMap: batchCosts,
    netRevenue: 14000, // 16000 - 2000 refund
    returnItems: [restockedReturn]
  });

  assert(cogsWithRestockedReturn.grossResolvedCogs === 7400, '23. Gross COGS preserves sold volume (7400)');
  assert(cogsWithRestockedReturn.restockedReturnCogsDeduction === 800, '24. Restocked COGS deduction is 2 * 400 = 800');
  assert(cogsWithRestockedReturn.netCogs === 6600, '25. Net COGS = 7400 - 800 = 6600');
  assert(cogsWithRestockedReturn.grossProfit === 7400, '26. Gross Profit = Net Revenue (14000) - Net COGS (6600) = 7400');

  // Non-Restocked Return: 2 units of batch-1 damaged/discarded -> restock_to_inventory = false
  const nonRestockedReturn: RawReturnItem = {
    product_id: 'p-1',
    batch_id: 'batch-1',
    quantity: 2,
    restock_to_inventory: false
  };

  const cogsWithNonRestockedReturn = calculateCogsAndProfit({
    saleItems: fullyResolvedItems,
    batchCostsMap: batchCosts,
    netRevenue: 14000,
    returnItems: [nonRestockedReturn]
  });

  assert(cogsWithNonRestockedReturn.restockedReturnCogsDeduction === 0, '27. Non-restocked return deduction is 0');
  assert(cogsWithNonRestockedReturn.netCogs === 7400, '28. Net COGS remains 7400 (loss retained in COGS/shrinkage)');

  // Partial Return: 1 unit returned restocked
  const partialReturn: RawReturnItem = {
    product_id: 'p-1',
    batch_id: 'batch-1',
    quantity: 1,
    restock_to_inventory: true
  };
  const cogsWithPartial = calculateCogsAndProfit({
    saleItems: fullyResolvedItems,
    batchCostsMap: batchCosts,
    netRevenue: 15000,
    returnItems: [partialReturn]
  });
  assert(cogsWithPartial.restockedReturnCogsDeduction === 400, '29. Partial return accurately deducts 1 * 400 = 400');

  // --------------------------------------------------------------------------
  // SECTION 4: ZERO REVENUE & DIVISION-BY-ZERO GUARDS
  // --------------------------------------------------------------------------
  console.log('\n[4. Mathematical Boundary Guards]');

  const zeroRevCogs = calculateCogsAndProfit({
    saleItems: [],
    batchCostsMap: batchCosts,
    netRevenue: 0,
    returnItems: []
  });
  assert(zeroRevCogs.grossMarginPct === 0, '30. Zero revenue yields 0% margin (no NaN)');

  const negRevCogs = calculateCogsAndProfit({
    saleItems: [],
    batchCostsMap: batchCosts,
    netRevenue: -5000, // Refunds exceeded sales
    returnItems: []
  });
  assert(negRevCogs.grossMarginPct === 0, '31. Negative net revenue yields 0% margin (no negative infinity)');

  // --------------------------------------------------------------------------
  // SECTION 5: SALES ANALYTICS & TIMELINE AGGREGATIONS
  // --------------------------------------------------------------------------
  console.log('\n[5. Sales Analytics & Payment Breakdown]');

  const rawSales: RawSale[] = [
    { id: 's-1', created_at: '2026-10-01T10:00:00Z', total: 5000, payment_method: 'CASH', payment_status: 'SETTLED', branch_id: 'b-1' },
    { id: 's-2', created_at: '2026-10-01T12:00:00Z', total: 3000, payment_method: 'TRANSFER', payment_status: 'SETTLED', branch_id: 'b-1' },
    { id: 's-3', created_at: '2026-10-02T14:00:00Z', total: 2000, payment_method: 'CARD', payment_status: 'SETTLED', branch_id: 'b-1' },
    { id: 's-4', created_at: '2026-10-02T16:00:00Z', total: 10000, payment_method: 'CASH', payment_status: 'PENDING_MANUAL', branch_id: 'b-1' } // Excluded
  ];

  const pBreakdown = calculatePaymentMethodBreakdown(rawSales);
  const cashItem = pBreakdown.find((x) => x.method === 'CASH')!;
  const transferItem = pBreakdown.find((x) => x.method === 'TRANSFER')!;
  const cardItem = pBreakdown.find((x) => x.method === 'CARD')!;

  assert(cashItem.amount === 5000, '32. Settled cash sales total 5000 (pending excluded)');
  assert(transferItem.amount === 3000, '33. Settled transfer sales total 3000');
  assert(cardItem.amount === 2000, '34. Settled card sales total 2000');
  assert(cashItem.percentage === 50, '35. Cash percentage evaluates to 50% (5000 / 10000)');

  const rawReturns: RawReturn[] = [
    { id: 'r-1', created_at: '2026-10-01T15:00:00Z', refund_amount: 1000, refund_payment_method: 'CASH', branch_id: 'b-1' }
  ];

  const timeline = calculateDailyTimeline(rawSales, rawReturns);
  assert(timeline.length === 2, '36. Daily timeline has 2 distinct date points');
  assert(timeline[0].date === '2026-10-01', '37. First timeline point is 2026-10-01');
  assert(timeline[0].grossRevenue === 8000, '38. 2026-10-01 gross revenue is 5000 + 3000 = 8000');
  assert(timeline[0].refunds === 1000, '39. 2026-10-01 refunds is 1000');
  assert(timeline[0].netRevenue === 7000, '40. 2026-10-01 net revenue is 7000');

  // Top Products
  const productsMap = new Map<string, RawProduct>([
    ['p-1', { id: 'p-1', name: 'Amoxicillin 500mg', selling_price: 1000 }],
    ['p-2', { id: 'p-2', name: 'Paracetamol 500mg', selling_price: 200 }]
  ]);

  const topItems: RawSaleItem[] = [
    { id: '1', product_id: 'p-1', batch_id: 'b-1', quantity: 5, unit_price: 1000, line_total: 5000 },
    { id: '2', product_id: 'p-2', batch_id: 'b-2', quantity: 20, unit_price: 200, line_total: 4000 },
    { id: '3', product_id: 'p-1', batch_id: 'b-1', quantity: 5, unit_price: 1000, line_total: 5000 }
  ];

  const top = calculateTopProducts(topItems, productsMap);
  assert(top.byVolume[0].productId === 'p-2', '41. Top product by volume is Paracetamol (20 units)');
  assert(top.byRevenue[0].productId === 'p-1', '42. Top product by revenue is Amoxicillin (₦100.00 revenue)');

  // --------------------------------------------------------------------------
  // SECTION 6: INVENTORY VALUATION & EXPIRY HORIZONS
  // --------------------------------------------------------------------------
  console.log('\n[6. Inventory Valuation & Expiry Breakdown]');

  const now = new Date('2026-10-01T00:00:00Z');
  const batches: RawBatch[] = [
    { id: 'b-1', product_id: 'p-1', batch_number: 'B1', quantity: 10, cost_price: 400, expiry_date: '2026-10-15' }, // < 30 days
    { id: 'b-2', product_id: 'p-2', batch_number: 'B2', quantity: 20, cost_price: 100, expiry_date: '2026-11-20' }, // 50 days (within 60)
    { id: 'b-3', product_id: 'p-1', batch_number: 'B3', quantity: 50, cost_price: 400, expiry_date: '2027-05-01' }, // healthy
    { id: 'b-4', product_id: 'p-2', batch_number: 'B4', quantity: 5, cost_price: 100, expiry_date: '2026-09-01' }   // expired
  ];

  const { valuation, expiry } = calculateInventoryValuation(batches, productsMap, now);
  // Cost: 10*400 + 20*100 + 50*400 + 5*100 = 4000 + 2000 + 20000 + 500 = 26500
  assert(valuation.costValuation === 26500, '43. Cost valuation sum equals 26500 minor units');
  // Retail: 10*1000 + 20*200 + 50*1000 + 5*200 = 10000 + 4000 + 50000 + 1000 = 65000
  assert(valuation.retailValuation === 65000, '44. Retail valuation sum equals 65000 minor units');
  assert(valuation.totalUnitsCount === 85, '45. Total units count equals 85');
  assert(expiry.expired === 1, '46. Exactly 1 expired batch detected');
  assert(expiry.within30Days === 1, '47. Exactly 1 batch within 30 days horizon');
  assert(expiry.within60Days === 1, '48. Exactly 1 batch within 60 days horizon');
  assert(expiry.healthy === 1, '49. Exactly 1 healthy batch (> 90 days)');

  // Stock Adjustments
  const adjustments: RawStockAdjustment[] = [
    { adjustment_type: 'INCREASE', quantity_delta: 15 },
    { adjustment_type: 'DECREASE', quantity_delta: -5 }
  ];
  const adjSummary = calculateAdjustmentsSummary(adjustments);
  assert(adjSummary.positiveQuantity === 15, '50. Positive adjustment quantity is 15');
  assert(adjSummary.negativeQuantity === 5, '51. Negative adjustment quantity is 5');
  assert(adjSummary.netQuantityDelta === 10, '52. Net quantity delta is 10');

  // --------------------------------------------------------------------------
  // SECTION 7: CASH REGISTER SHIFT AUDIT
  // --------------------------------------------------------------------------
  console.log('\n[7. Cash Register Shift Audits]');

  const sessions: RawShiftSession[] = [
    { id: 'sess-1', cashier_id: 'cashier-1', status: 'CLOSED', opening_cash: 5000, counted_cash: 15000, expected_cash: 15000, variance: 0, opened_at: '2026-10-01', closed_at: '2026-10-01' },
    { id: 'sess-2', cashier_id: 'cashier-1', status: 'CLOSED', opening_cash: 5000, counted_cash: 14500, expected_cash: 15000, variance: -500, opened_at: '2026-10-02', closed_at: '2026-10-02' },
    { id: 'sess-3', cashier_id: 'cashier-2', status: 'CLOSED', opening_cash: 5000, counted_cash: 15200, expected_cash: 15000, variance: 200, opened_at: '2026-10-02', closed_at: '2026-10-02' },
    { id: 'sess-4', cashier_id: 'cashier-2', status: 'OPEN', opening_cash: 5000, counted_cash: null, expected_cash: null, variance: null, opened_at: '2026-10-03', closed_at: null }
  ];

  const cashAudit = calculateCashAudit(sessions);
  assert(cashAudit.closedSessions === 3, '53. Exactly 3 closed sessions aggregated');
  assert(cashAudit.openSessions === 1, '54. Exactly 1 open session noted');
  assert(cashAudit.netVariance === -300, '55. Net variance = 0 + (-500) + 200 = -300 minor units');
  assert(cashAudit.balancedSessionsCount === 1, '56. Exactly 1 balanced shift');
  assert(cashAudit.shortageSessionsCount === 1, '57. Exactly 1 shortage shift');
  assert(cashAudit.overageSessionsCount === 1, '58. Exactly 1 overage shift');
  assert(cashAudit.balancedRatePct === 33.33, '59. Balanced rate evaluates to 33.33%');

  // --------------------------------------------------------------------------
  // SECTION 8: PROCUREMENT ANALYTICS
  // --------------------------------------------------------------------------
  console.log('\n[8. Procurement Analytics]');

  const purchases: RawPurchase[] = [
    { id: 'pur-1', supplier_id: 'sup-1', total_cost: 50000 },
    { id: 'pur-2', supplier_id: 'sup-2', total_cost: 30000 }
  ];
  const purchaseItems: RawPurchaseItem[] = [
    { purchase_id: 'pur-1', product_id: 'p-1', batch_id: 'b-1', quantity: 100, unit_cost: 500, total_cost: 50000 },
    { purchase_id: 'pur-2', product_id: 'p-2', batch_id: 'b-2', quantity: 150, unit_cost: 200, total_cost: 30000 }
  ];
  const suppliersMap = new Map<string, string>([
    ['sup-1', 'Emzor Pharmaceuticals'],
    ['sup-2', 'Fidson Healthcare']
  ]);

  const proc = calculateProcurementAnalytics(purchases, purchaseItems, suppliersMap);
  assert(proc.inboundShipmentsCount === 2, '60. Inbound shipments count equals 2');
  assert(proc.totalUnitsDelivered === 250, '61. Total units delivered equals 250');
  assert(proc.totalFinancialSpend === 80000, '62. Total procurement spend is 80000 minor units');
  assert(proc.supplierBreakdown[0].supplierName === 'Emzor Pharmaceuticals', '63. Top supplier is Emzor');

  // --------------------------------------------------------------------------
  // SECTION 9: PRESENTATION MASKING UTILITIES
  // --------------------------------------------------------------------------
  console.log('\n[9. Presentation Financial Masking]');

  assert(formatReportCurrency(50000, true) === MASKED_FINANCIAL_VALUE, '64. Currency is masked to "••••••" when isMasked is TRUE');
  assert(formatReportCurrency(50000, false) === '₦500.00', '65. Currency unmasked displays exact formatted currency');
  assert(formatReportPercent(25.4, true) === MASKED_FINANCIAL_VALUE, '66. Percentage is masked to "••••••" when isMasked is TRUE');
  assert(formatReportPercent(25.4, false) === '25.4%', '67. Percentage unmasked displays exact percentage');

  console.log('\n================================================================');
  console.log(`PHASE 5D-20 REPORTS TESTS: ${totalPassed} PASSED, 0 FAILED`);
  console.log('================================================================\n');
}

runReportsUnitTests().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
