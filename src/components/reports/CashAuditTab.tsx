import React from 'react';
import { CashAuditData } from '../../lib/reports/types';
import { formatReportCurrency } from '../../lib/reports/formatters';
import { Coins, CheckCircle, AlertTriangle, UserCheck, ShieldCheck } from 'lucide-react';

interface CashAuditTabProps {
  data: CashAuditData;
  currency?: string;
}

export const CashAuditTab: React.FC<CashAuditTabProps> = ({ data, currency = 'NGN' }) => {
  const isNetShortage = data.netVariance < 0;
  const isNetOverage = data.netVariance > 0;

  return (
    <div className="space-y-6">
      {/* Top Cards: Session Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Closed Sessions */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Closed Shifts</span>
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {data.closedSessions} / {data.totalSessions}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {data.openSessions} shift{data.openSessions === 1 ? '' : 's'} currently open
          </div>
        </div>

        {/* Balanced Rate */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Balanced Shift Rate</span>
            <ShieldCheck className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {data.balancedRatePct}%
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {data.balancedSessionsCount} of {data.closedSessions} shifts balanced cleanly
          </div>
        </div>

        {/* Expected vs Counted Cash */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Total Expected Cash</span>
            <Coins className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatReportCurrency(data.totalExpectedCash, false, currency)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Counted: {formatReportCurrency(data.totalCountedCash, false, currency)}
          </div>
        </div>

        {/* Net Variance */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Net Shift Variance</span>
            <Coins
              className={`w-4 h-4 ${
                isNetShortage ? 'text-rose-400' : isNetOverage ? 'text-amber-400' : 'text-emerald-400'
              }`}
            />
          </div>
          <div
            className={`text-xl font-bold tracking-tight ${
              isNetShortage ? 'text-rose-400' : isNetOverage ? 'text-amber-400' : 'text-emerald-400'
            }`}
          >
            {data.netVariance === 0 ? 'Balanced (₦0.00)' : formatReportCurrency(data.netVariance, false, currency)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {isNetShortage
              ? 'Net shortage across shifts'
              : isNetOverage
              ? 'Net overage across shifts'
              : 'Zero variance across shifts'}
          </div>
        </div>
      </div>

      {/* Cashier Accountability Breakdown */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Cashier Shift Accountability
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {data.cashierAudit.length} Cashier Terminal{data.cashierAudit.length === 1 ? '' : 's'}
          </span>
        </div>

        {data.cashierAudit.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No cashier shifts closed in selected window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="pb-2 font-medium">Cashier ID</th>
                  <th className="pb-2 font-medium text-right">Total Shifts</th>
                  <th className="pb-2 font-medium text-right">Balanced Shifts</th>
                  <th className="pb-2 font-medium text-right">Balanced %</th>
                  <th className="pb-2 font-medium text-right">Net Shift Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {data.cashierAudit.map((c) => {
                  const bPct =
                    c.sessionCount > 0
                      ? Math.round((c.balancedCount / c.sessionCount) * 10000) / 100
                      : 100;
                  const isNegative = c.netVariance < 0;

                  return (
                    <tr key={c.cashierId} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 text-slate-300 font-sans">
                        <span className="font-mono text-xs bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                          {c.cashierId.slice(0, 8)}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-300">{c.sessionCount}</td>
                      <td className="py-2.5 text-right text-emerald-400">{c.balancedCount}</td>
                      <td className="py-2.5 text-right text-slate-300">{bPct}%</td>
                      <td
                        className={`py-2.5 text-right font-semibold ${
                          c.netVariance === 0
                            ? 'text-emerald-400'
                            : isNegative
                            ? 'text-rose-400'
                            : 'text-amber-400'
                        }`}
                      >
                        {formatReportCurrency(c.netVariance, false, currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
          Reconciled against Migration M-12 server-authoritative formula: <code className="text-slate-400">expected_cash = opening_cash + cash_sales - cash_refunds</code>.
        </div>
      </div>
    </div>
  );
};
