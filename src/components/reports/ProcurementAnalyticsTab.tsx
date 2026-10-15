import React from 'react';
import { ProcurementAnalyticsData } from '../../lib/reports/types';
import { formatReportCurrency } from '../../lib/reports/formatters';
import { Truck, Package, ShieldCheck, DollarSign } from 'lucide-react';

interface ProcurementAnalyticsTabProps {
  data: ProcurementAnalyticsData;
  canViewFinancials: boolean; // True for OWNER, False for MANAGER/PHARMACIST
  currency?: string;
}

export const ProcurementAnalyticsTab: React.FC<ProcurementAnalyticsTabProps> = ({
  data,
  canViewFinancials,
  currency = 'NGN'
}) => {
  return (
    <div className="space-y-6">
      {/* Top Cards: Procurement Volume & Spend */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Inbound Shipments */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Inbound Shipments</span>
            <Truck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {data.inboundShipmentsCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Received purchase deliveries</div>
        </div>

        {/* Total Units Delivered */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Delivered Inventory Units</span>
            <Package className="w-4 h-4 text-sky-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {data.totalUnitsDelivered.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Physical units received</div>
        </div>

        {/* Active Suppliers */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Active Suppliers</span>
            <ShieldCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {data.activeSuppliersCount}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Suppliers with shipments</div>
        </div>

        {/* Total Financial Spend (Gated) */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Procurement Spend</span>
            <DollarSign className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatReportCurrency(data.totalFinancialSpend, !canViewFinancials, currency)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {canViewFinancials ? 'Total purchase expenditure' : 'Restricted to Owner'}
          </div>
        </div>
      </div>

      {/* Supplier Fulfillment Breakdown */}
      <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-400" />
            <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
              Supplier Fulfillment & Spend Breakdown
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            {data.supplierBreakdown.length} Supplier{data.supplierBreakdown.length === 1 ? '' : 's'}
          </span>
        </div>

        {data.supplierBreakdown.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500">
            No procurement shipments received in selected window.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-[11px] text-slate-400 uppercase tracking-wider">
                  <th className="pb-2 font-medium">Supplier</th>
                  <th className="pb-2 font-medium text-right">Shipments</th>
                  <th className="pb-2 font-medium text-right">Delivered Units</th>
                  <th className="pb-2 font-medium text-right">Total Expenditure</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {data.supplierBreakdown.map((s) => (
                  <tr key={s.supplierId} className="hover:bg-slate-800/30 transition">
                    <td className="py-2.5 text-slate-200 font-sans font-medium">
                      {s.supplierName}
                    </td>
                    <td className="py-2.5 text-right text-slate-300">{s.shipmentsCount}</td>
                    <td className="py-2.5 text-right text-emerald-400">{s.unitsDelivered.toLocaleString()}</td>
                    <td className="py-2.5 text-right font-semibold text-white">
                      {formatReportCurrency(s.totalCost, !canViewFinancials, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
          Procurement financial spend is gated strictly by <code className="text-slate-400">reports.financial</code>. Operational unit metrics remain visible to store management.
        </div>
      </div>
    </div>
  );
};
