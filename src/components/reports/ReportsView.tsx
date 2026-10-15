import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  FullReportPayload,
  ReportDatePreset,
  ReportDateRange,
  ReportScopeParams
} from '../../lib/reports/types';
import { computeDateRange } from '../../lib/reports/formatters';
import { generatePharmacyReport } from '../../lib/reports/service';
import { ReportsSummaryCards } from './ReportsSummaryCards';
import { SalesAnalyticsTab } from './SalesAnalyticsTab';
import { InventoryValuationTab } from './InventoryValuationTab';
import { CashAuditTab } from './CashAuditTab';
import { ProcurementAnalyticsTab } from './ProcurementAnalyticsTab';
import {
  BarChart3,
  Calendar,
  Building2,
  Lock,
  RefreshCw,
  TrendingUp,
  Package,
  Coins,
  Truck,
  ShieldAlert,
  LayoutDashboard
} from 'lucide-react';
import { Branch } from '../../types/database';

export const ReportsView: React.FC = () => {
  const { user, pharmacy, branch, role, permissions, membership } = useAuth();

  // Role permissions
  const isOwner = role === 'OWNER';
  const isManager = role === 'MANAGER';
  const isPharmacist = role === 'PHARMACIST';
  const canViewReports = isOwner || isManager || isPharmacist || permissions.includes('reports.read');
  const canViewFinancials = isOwner || permissions.includes('reports.financial');

  // Authoritative default branch for pharmacist
  const pharmacistDefaultBranchId = membership?.default_branch_id || branch?.id || null;

  // Branch Selection State
  // For OWNER & MANAGER: 'all' or branch UUID.
  // For PHARMACIST: strictly pharmacistDefaultBranchId.
  const [selectedBranchId, setSelectedBranchId] = useState<string>(
    isPharmacist ? (pharmacistDefaultBranchId || 'all') : 'all'
  );

  // Date Range State
  const [datePreset, setDatePreset] = useState<ReportDatePreset>('30D');
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');

  // Active Sub-Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'sales' | 'inventory' | 'cash' | 'procurement'>('overview');

  // Branch Directory for Owner/Manager Dropdown
  const [branches, setBranches] = useState<Branch[]>([]);

  // Report Data State
  const [reportData, setReportData] = useState<FullReportPayload | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load Branches Directory for Filter
  useEffect(() => {
    if (!pharmacy?.id) return;
    const loadBranches = async () => {
      const { data } = await supabase
        .from('branches')
        .select('*')
        .eq('pharmacy_id', pharmacy.id)
        .order('is_main', { ascending: false });
      if (data) setBranches(data as Branch[]);
    };
    loadBranches();
  }, [pharmacy?.id]);

  // Load Report Action
  const loadReport = useCallback(async () => {
    if (!pharmacy?.id || !user?.id) return;
    if (!canViewReports) {
      setErrorMessage('Access Denied: You do not possess reports.read permission.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const dateRange: ReportDateRange = computeDateRange(
        datePreset,
        customStartDate,
        customEndDate
      );

      const params: ReportScopeParams = {
        pharmacyId: pharmacy.id,
        branchId: isPharmacist ? pharmacistDefaultBranchId : selectedBranchId,
        role: role || 'CASHIER',
        defaultBranchId: pharmacistDefaultBranchId,
        dateRange
      };

      const res = await generatePharmacyReport(supabase, params);
      if (res.success && res.data) {
        setReportData(res.data);
      } else {
        setErrorMessage(res.error || 'Failed to aggregate pharmacy reports.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unexpected error loading reports.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  }, [
    pharmacy?.id,
    user?.id,
    canViewReports,
    datePreset,
    customStartDate,
    customEndDate,
    isPharmacist,
    pharmacistDefaultBranchId,
    selectedBranchId,
    role
  ]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  // Access Denied Screen (e.g. for CASHIER)
  if (!canViewReports) {
    return (
      <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 text-center max-w-lg mx-auto mt-12">
        <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto mb-4 flex items-center justify-center">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-lg font-bold text-white mb-2">Reports Access Restricted</h2>
        <p className="text-xs text-slate-400 leading-relaxed mb-4">
          Your account role (<strong className="text-slate-200">{role || 'CASHIER'}</strong>) does not have executive reporting privileges (<code className="text-emerald-400">reports.read</code>).
        </p>
        <p className="text-[11px] text-slate-500">
          Terminal operators and cashiers are strictly limited to Point of Sale operations.
        </p>
      </div>
    );
  }

  // Assigned branch name for Pharmacist locked badge
  const assignedBranchName =
    branches.find((b) => b.id === pharmacistDefaultBranchId)?.name ||
    branch?.name ||
    'Assigned Branch';

  const currency = pharmacy?.currency || 'NGN';

  return (
    <div className="space-y-6">
      {/* Header & Controls Bar */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            <h1 className="text-lg font-bold text-white tracking-tight">
              Executive Analytics & Financial Intelligence
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Real-time business performance, inventory health, and cash accountability.
          </p>
        </div>

        {/* Global Controls: Date Preset & Branch Filter */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Branch Filter */}
          {isPharmacist ? (
            // Pharmacist: Locked Branch Badge
            <div
              className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 font-medium flex items-center gap-1.5"
              title="Pharmacist access is authoritatively restricted to assigned branch."
            >
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>{assignedBranchName}</span>
              <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-400">Locked</span>
            </div>
          ) : (
            // Owner / Manager: Selectable Branch Dropdown
            <div className="flex items-center gap-1.5 bg-slate-950 px-2 py-1 rounded-lg border border-slate-800">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="bg-transparent text-xs text-white focus:outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-slate-900 text-white">All Branches</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id} className="bg-slate-900 text-white">
                    {b.name} {b.is_main ? '(Main)' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Range Presets */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            {(['TODAY', '7D', '30D', 'CUSTOM'] as ReportDatePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setDatePreset(p)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold transition cursor-pointer ${
                  datePreset === p
                    ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {p === 'TODAY' ? 'Today' : p === '7D' ? '7 Days' : p === '30D' ? '30 Days' : 'Custom'}
              </button>
            ))}
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadReport}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 border border-slate-800 transition cursor-pointer disabled:opacity-50"
            title="Refresh Report Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>
      </div>

      {/* Custom Date Pickers (if CUSTOM selected) */}
      {datePreset === 'CUSTOM' && (
        <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-wrap items-center gap-4 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <Calendar className="w-4 h-4 text-emerald-400" />
            <span>Custom Date Range:</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-400">From:</label>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-slate-400">To:</label>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              className="px-2.5 py-1 rounded bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-emerald-500"
            />
          </div>
          <button
            onClick={loadReport}
            className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition cursor-pointer"
          >
            Apply Range
          </button>
        </div>
      )}

      {/* Sub-Tabs Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3 overflow-x-auto">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'overview'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <LayoutDashboard className="w-3.5 h-3.5" />
          <span>Executive Summary</span>
        </button>
        <button
          onClick={() => setActiveTab('sales')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'sales'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          <span>Sales & Tenders</span>
        </button>
        <button
          onClick={() => setActiveTab('inventory')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'inventory'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Inventory & Expiry</span>
        </button>
        <button
          onClick={() => setActiveTab('cash')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'cash'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Coins className="w-3.5 h-3.5" />
          <span>Cash & Shift Audits</span>
        </button>
        <button
          onClick={() => setActiveTab('procurement')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition cursor-pointer ${
            activeTab === 'procurement'
              ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>Procurement Fulfillment</span>
        </button>
      </div>

      {/* Error Notice */}
      {errorMessage && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-3">
          <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="py-20 text-center">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin mx-auto mb-3" />
          <div className="text-sm font-semibold text-white">Aggregating Authoritative Pharmacy Records...</div>
          <div className="text-xs text-slate-500 mt-1">Cross-referencing sales, inventory batches, and shifts.</div>
        </div>
      )}

      {/* Main Report Content */}
      {!isLoading && reportData && (
        <div className="space-y-6">
          {/* Top KPI Cards (Visible on All Tabs for Executive Focus) */}
          <ReportsSummaryCards
            summary={reportData.summary}
            canViewFinancials={canViewFinancials}
            currency={currency}
          />

          {/* Active Tab Body */}
          {activeTab === 'overview' ? (
            <div className="space-y-6">
              {/* Overview presents combined insights from sales and inventory */}
              <SalesAnalyticsTab data={reportData.sales} currency={currency} />
            </div>
          ) : activeTab === 'sales' ? (
            <SalesAnalyticsTab data={reportData.sales} currency={currency} />
          ) : activeTab === 'inventory' ? (
            <InventoryValuationTab
              data={reportData.inventory}
              canViewFinancials={canViewFinancials}
              currency={currency}
            />
          ) : activeTab === 'cash' ? (
            <CashAuditTab data={reportData.cash} currency={currency} />
          ) : (
            <ProcurementAnalyticsTab
              data={reportData.procurement}
              canViewFinancials={canViewFinancials}
              currency={currency}
            />
          )}
        </div>
      )}
    </div>
  );
};
