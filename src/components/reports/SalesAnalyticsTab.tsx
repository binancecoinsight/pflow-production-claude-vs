import React from 'react';
import { SalesAnalyticsData } from '../../lib/reports/types';
import { formatReportCurrency } from '../../lib/reports/formatters';
import { CreditCard, Banknote, ArrowRightLeft, Layers, Package, TrendingUp } from 'lucide-react';

interface SalesAnalyticsTabProps {
  data: SalesAnalyticsData;
  currency?: string;
}

export const SalesAnalyticsTab: React.FC<SalesAnalyticsTabProps> = ({ data, currency = 'NGN' }) => {
  const getMethodIcon = (method: string) => {
    switch (method) {
      case 'CASH':
        return <Banknote className="w-4 h-4 text-emerald-400" />;
      case 'TRANSFER':
        return <ArrowRightLeft className="w-4 h-4 text-sky-400" />;
      case 'CARD':
        return <CreditCard className="w-4 h-4 text-purple-400" />;
      default:
        return <Layers className="w-4 h-4 text-slate-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Grid: Payment Method Breakdown & Sales Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Payment Methods */}
        <div className="lg:col-span-1 p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Tender Distribution
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">By Settled Volume</span>
          </div>

          <div className="space-y-4">
            {data.paymentMethodBreakdown.map((item) => (
              <div key={item.method} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2 text-slate-300">
                    {getMethodIcon(item.method)}
                    <span className="font-medium">{item.method}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold text-white">
                      {formatReportCurrency(item.amount, false, currency)}
                    </span>
                    <span className="text-[11px] text-slate-500 ml-1.5">({item.percentage}%)</span>
                  </div>
                </div>
                {/* Visual Progress Bar */}
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      item.method === 'CASH'
                        ? 'bg-emerald-500'
                        : item.method === 'TRANSFER'
                        ? 'bg-sky-500'
                        : item.method === 'CARD'
                        ? 'bg-purple-500'
                        : 'bg-slate-400'
                    }`}
                    style={{ width: `${Math.min(100, Math.max(0, item.percentage))}%` }}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-slate-800/80 flex justify-between text-xs text-slate-400">
            <span>Total Gross Sales:</span>
            <span className="font-semibold text-white">
              {formatReportCurrency(data.grossSales, false, currency)}
            </span>
          </div>
          {data.totalRefunds > 0 && (
            <div className="mt-1 flex justify-between text-xs text-rose-400">
              <span>Refund Deductions:</span>
              <span>-{formatReportCurrency(data.totalRefunds, false, currency)}</span>
            </div>
          )}
        </div>

        {/* Daily Sales Timeline */}
        <div className="lg:col-span-2 p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Daily Sales Timeline
            </h3>
            <span className="text-[11px] text-slate-500 font-mono">
              {data.dailyTimeline.length} Active Days
            </span>
          </div>

          {data.dailyTimeline.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No sales transactions recorded in selected window.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                    <th className="pb-2 font-medium">Date</th>
                    <th className="pb-2 font-medium text-right">Transactions</th>
                    <th className="pb-2 font-medium text-right">Gross Sales</th>
                    <th className="pb-2 font-medium text-right">Refunds</th>
                    <th className="pb-2 font-medium text-right">Net Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {data.dailyTimeline.map((day) => (
                    <tr key={day.date} className="hover:bg-slate-800/30 transition">
                      <td className="py-2.5 text-slate-300 font-sans">{day.date}</td>
                      <td className="py-2.5 text-right text-slate-400">{day.transactionCount}</td>
                      <td className="py-2.5 text-right text-slate-300">
                        {formatReportCurrency(day.grossRevenue, false, currency)}
                      </td>
                      <td className="py-2.5 text-right text-rose-400">
                        {day.refunds > 0 ? `-${formatReportCurrency(day.refunds, false, currency)}` : '—'}
                      </td>
                      <td className="py-2.5 text-right font-semibold text-emerald-400">
                        {formatReportCurrency(day.netRevenue, false, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Grid: Top Selling Products */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Top by Volume */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <Package className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Top Products by Volume
            </h3>
          </div>

          {data.topProductsByVolume.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No dispensed products in this period.
            </div>
          ) : (
            <div className="space-y-3">
              {data.topProductsByVolume.map((prod, idx) => (
                <div
                  key={prod.productId}
                  className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="w-5 text-center font-mono text-slate-500 font-bold text-[11px]">
                      #{idx + 1}
                    </span>
                    <span className="font-medium text-slate-200 truncate">{prod.productName}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-emerald-400 font-mono">{prod.unitsSold} units</span>
                    <div className="text-[10px] text-slate-500">
                      {formatReportCurrency(prod.revenue, false, currency)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top by Revenue */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-sky-400" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Top Products by Revenue
            </h3>
          </div>

          {data.topProductsByRevenue.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No dispensed products in this period.
            </div>
          ) : (
            <div className="space-y-3">
              {data.topProductsByRevenue.map((prod, idx) => (
                <div
                  key={prod.productId}
                  className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/60"
                >
                  <div className="flex items-center gap-2.5 min-w-0 pr-2">
                    <span className="w-5 text-center font-mono text-slate-500 font-bold text-[11px]">
                      #{idx + 1}
                    </span>
                    <span className="font-medium text-slate-200 truncate">{prod.productName}</span>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="font-bold text-white font-mono">
                      {formatReportCurrency(prod.revenue, false, currency)}
                    </span>
                    <div className="text-[10px] text-slate-500">{prod.unitsSold} units sold</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
