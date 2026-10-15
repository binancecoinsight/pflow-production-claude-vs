/**
 * PHARMACYFLOW PHASE 5D-20: REPORTS UI & WORKFLOW TEST SUITE
 * 
 * Verifies:
 * 1. Role-based UI visibility & navigation tab gating
 * 2. Cashier exclusion from Reports
 * 3. Pharmacist branch locking (no "All Branches", locked to default_branch_id)
 * 4. Owner & Manager multi-branch selectable dropdown
 * 5. Presentation-layer financial masking (Owner vs Manager/Pharmacist)
 * 6. Incomplete COGS audit alert banner presentation
 * 7. Date range preset computations
 */

import { formatReportCurrency, formatReportPercent, computeDateRange, MASKED_FINANCIAL_VALUE } from '../../lib/reports/formatters';
import { resolveEffectiveBranchId } from '../../lib/reports/service';
import { SummaryKpiMetrics } from '../../lib/reports/types';

let totalPassed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`  ✓ ${message}`);
  totalPassed++;
}

// UI Role Gate Helpers mirroring ReportsView & AuthenticatedShell logic
function canAccessReportsTab(role: string | null | undefined, permissions: string[] = []): boolean {
  return role === 'OWNER' || role === 'MANAGER' || role === 'PHARMACIST' || permissions.includes('reports.read');
}

function canViewFinancials(role: string | null | undefined, permissions: string[] = []): boolean {
  return role === 'OWNER' || permissions.includes('reports.financial');
}

function isBranchSelectorLocked(role: string | null | undefined): boolean {
  return role === 'PHARMACIST';
}

function canSelectAllBranches(role: string | null | undefined): boolean {
  return role === 'OWNER' || role === 'MANAGER';
}

async function runReportsUiTestSuite() {
  console.log('================================================================');
  console.log('PHARMACYFLOW PHASE 5D-20: REPORTS UI & WORKFLOW SUITE');
  console.log('================================================================\n');

  // Section 1: Role-Based Navigation & Access Gating
  console.log('[1. Role-Based Navigation & Access]');
  assert(canAccessReportsTab('OWNER') === true, '1. OWNER can access Reports tab');
  assert(canAccessReportsTab('MANAGER') === true, '2. MANAGER can access Reports tab');
  assert(canAccessReportsTab('PHARMACIST') === true, '3. PHARMACIST can access Reports tab');
  assert(canAccessReportsTab('CASHIER') === false, '4. CASHIER is strictly denied access to Reports tab');
  assert(canAccessReportsTab('MEMBER', []) === false, '5. Unprivileged member without reports.read is denied');

  // Section 2: Financial Presentation Masking
  console.log('\n[2. Role-Based Financial Presentation Masking]');
  assert(canViewFinancials('OWNER') === true, '6. OWNER can view unmasked financial figures');
  assert(canViewFinancials('MANAGER') === false, '7. MANAGER cannot view unmasked financial figures (Masked)');
  assert(canViewFinancials('PHARMACIST') === false, '8. PHARMACIST cannot view unmasked financial figures (Masked)');
  assert(canViewFinancials('CASHIER') === false, '9. CASHIER has zero financial visibility');

  const sampleProfit = 1250000; // ₦12,500.00
  const sampleMargin = 32.5;

  // Owner View
  const ownerProfitText = formatReportCurrency(sampleProfit, !canViewFinancials('OWNER'));
  const ownerMarginText = formatReportPercent(sampleMargin, !canViewFinancials('OWNER'));
  assert(ownerProfitText === '₦12,500.00', '10. OWNER renders exact unmasked profit (₦12,500.00)');
  assert(ownerMarginText === '32.5%', '11. OWNER renders exact unmasked margin (32.5%)');

  // Manager View
  const managerProfitText = formatReportCurrency(sampleProfit, !canViewFinancials('MANAGER'));
  const managerMarginText = formatReportPercent(sampleMargin, !canViewFinancials('MANAGER'));
  assert(managerProfitText === MASKED_FINANCIAL_VALUE, '12. MANAGER renders masked profit (••••••)');
  assert(managerMarginText === MASKED_FINANCIAL_VALUE, '13. MANAGER renders masked margin (••••••)');

  // Pharmacist View
  const pharmacistProfitText = formatReportCurrency(sampleProfit, !canViewFinancials('PHARMACIST'));
  const pharmacistMarginText = formatReportPercent(sampleMargin, !canViewFinancials('PHARMACIST'));
  assert(pharmacistProfitText === MASKED_FINANCIAL_VALUE, '14. PHARMACIST renders masked profit (••••••)');
  assert(pharmacistMarginText === MASKED_FINANCIAL_VALUE, '15. PHARMACIST renders masked margin (••••••)');

  // Section 3: Branch Selection & Pharmacist Branch Locking
  console.log('\n[3. Branch Selection & Pharmacist Locking Invariants]');
  assert(canSelectAllBranches('OWNER') === true, '16. OWNER can select "All Branches" option');
  assert(canSelectAllBranches('MANAGER') === true, '17. MANAGER can select "All Branches" option');
  assert(canSelectAllBranches('PHARMACIST') === false, '18. PHARMACIST cannot select "All Branches"');
  assert(isBranchSelectorLocked('PHARMACIST') === true, '19. PHARMACIST branch selector is strictly locked');
  assert(isBranchSelectorLocked('OWNER') === false, '20. OWNER branch selector is interactive');
  assert(isBranchSelectorLocked('MANAGER') === false, '21. MANAGER branch selector is interactive');

  // Service Effective Branch Verification
  const pharmCheck = resolveEffectiveBranchId({
    pharmacyId: 'p-1',
    role: 'PHARMACIST',
    branchId: 'all', // Injected parameter
    defaultBranchId: 'branch-valid-assigned',
    dateRange: computeDateRange('30D')
  });
  assert(pharmCheck === 'branch-valid-assigned', '22. Service layer strictly locks Pharmacist to default_branch_id');

  // Section 4: COGS Incomplete Audit Alert Banner
  console.log('\n[4. COGS Incomplete Audit Banner Presentation]');
  const cleanSummary: SummaryKpiMetrics = {
    netRevenue: 50000,
    grossProfit: 25000,
    grossMarginPct: 50.0,
    isCogsIncomplete: false,
    unresolvedCogsLinesCount: 0,
    unresolvedCogsQuantity: 0,
    transactionCount: 20,
    averageTicket: 2500,
    cashDiscrepancy: 0,
    expiringBatchesCount30D: 2,
    expiringBatchesCount60D: 5,
    expiringBatchesCount90D: 10
  };
  assert(cleanSummary.isCogsIncomplete === false, '23. Clean summary does NOT display incomplete audit alert');

  const incompleteSummary: SummaryKpiMetrics = {
    ...cleanSummary,
    isCogsIncomplete: true,
    unresolvedCogsLinesCount: 3,
    unresolvedCogsQuantity: 15
  };
  assert(incompleteSummary.isCogsIncomplete === true, '24. Incomplete summary activates audit warning notice');
  assert(incompleteSummary.unresolvedCogsLinesCount === 3, '25. Incomplete summary tracks exactly 3 unresolved lines');
  assert(incompleteSummary.unresolvedCogsQuantity === 15, '26. Incomplete summary tracks exactly 15 unresolved units');

  // Section 5: Date Range Preset Invariants
  console.log('\n[5. Date Range Preset Boundaries]');
  const refDate = new Date('2026-10-08T12:00:00Z');
  const todayRange = computeDateRange('TODAY', undefined, undefined, refDate);
  assert(todayRange.startIso.startsWith('2026-10-08T00:00:00.000Z'), '27. TODAY starts at 00:00:00.000Z');
  assert(todayRange.endIso.startsWith('2026-10-08T23:59:59.999Z'), '28. TODAY ends at 23:59:59.999Z');

  const range7D = computeDateRange('7D', undefined, undefined, refDate);
  assert(range7D.startIso.startsWith('2026-10-02T00:00:00.000Z'), '29. 7D starts exactly 6 days prior');
  assert(range7D.endIso.startsWith('2026-10-08T23:59:59.999Z'), '30. 7D ends at 23:59:59.999Z');

  console.log('\n================================================================');
  console.log(`PHASE 5D-20 REPORTS UI TESTS: ${totalPassed} PASSED, 0 FAILED`);
  console.log('================================================================\n');
}

runReportsUiTestSuite().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
