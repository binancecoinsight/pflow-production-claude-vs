import React from 'react';
import { SummaryKpiMetrics } from '../../lib/reports/types';
import { formatReportCurrency, formatReportPercent } from '../../lib/reports/formatters';
import {
  TrendingUp,
  Receipt,
  CreditCard,
  Coins,
  AlertTriangle,
  Clock,
  ShieldAlert
} from 'lucide-react';

interface ReportsSummaryCardsProps {
  summary: SummaryKpiMetrics;
  canViewFinancials: boolean; // True for OWNER, False for MANAGER/PHARMACIST
  currency?: string;
}

export const ReportsSummaryCards: React.FC<ReportsSummaryCardsProps> = ({
  summary,
  canViewFinancials,
  currency = 'NGN'
}) => {
  const isVarianceNegative = summary.cashDiscrepancy < 0;
  const isVarianceBalanced = summary.cashDiscrepancy === 0;

  return (
    <div className="space-y-4">
      {/* COGS Incomplete Audit Notice (if any lines lacked authoritative historical batches) */}
      {summary.isCogsIncomplete && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-200 text-xs">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-amber-300">
              COGS Audit Notice: Incomplete Historical Batch Linkage
            </div>
            <p className="mt-0.5 text-amber-200/90 leading-relaxed">
              {summary.unresolvedCogsLinesCount} line item{summary.unresolvedCogsLinesCount === 1 ? '' : 's'} ({summary.unresolvedCogsQuantity} unit{summary.unresolvedCogsQuantity === 1 ? '' : 's'}) could not be resolved to authoritative historical batches. Gross profit and margin are marked partial to prevent financial distortion.
            </p>
          </div>
        </div>
      )}

      {/* Grid of 6 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Card 1: Net Revenue */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Net Revenue</span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-white tracking-tight">
              {formatReportCurrency(summary.netRevenue, false, currency)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Settled sales minus returns
            </div>
          </div>
        </div>

        {/* Card 2: Gross Profit */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Gross Profit</span>
            <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-white tracking-tight flex items-center gap-1.5">
              <span>{formatReportCurrency(summary.grossProfit, !canViewFinancials, currency)}</span>
              {canViewFinancials && summary.isCogsIncomplete && (
                <span className="text-[10px] px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-normal">
                  Partial
                </span>
              )}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Margin: {formatReportPercent(summary.grossMarginPct, !canViewFinancials)}
            </div>
          </div>
        </div>

        {/* Card 3: Transactions */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Transactions</span>
            <div className="p-1.5 rounded-lg bg-teal-500/10 text-teal-400">
              <Receipt className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-white tracking-tight font-mono">
              {summary.transactionCount.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Completed retail orders
            </div>
          </div>
        </div>

        {/* Card 4: Average Ticket */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Average Ticket</span>
            <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-white tracking-tight">
              {formatReportCurrency(summary.averageTicket, false, currency)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              Per settled transaction
            </div>
          </div>
        </div>

        {/* Card 5: Cash Discrepancy */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Shift Cash Variance</span>
            <div className={`p-1.5 rounded-lg ${isVarianceNegative ? 'bg-rose-500/10 text-rose-400' : isVarianceBalanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'}`}>
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className={`text-lg font-bold tracking-tight ${isVarianceNegative ? 'text-rose-400' : isVarianceBalanced ? 'text-emerald-400' : 'text-amber-400'}`}>
              {summary.cashDiscrepancy === 0 ? 'Balanced (₦0.00)' : formatReportCurrency(summary.cashDiscrepancy, false, currency)}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {isVarianceBalanced ? 'Drawer count balanced' : isVarianceNegative ? 'Net cash shortage' : 'Net cash overage'}
            </div>
          </div>
        </div>

        {/* Card 6: Expiring Batches */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-2">
            <span>Expiring &lt;30d</span>
            <div className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className={`text-lg font-bold font-mono tracking-tight ${summary.expiringBatchesCount30D > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {summary.expiringBatchesCount30D}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              {summary.expiringBatchesCount30D > 0 ? 'Requires clinical review' : 'No immediate expiries'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
