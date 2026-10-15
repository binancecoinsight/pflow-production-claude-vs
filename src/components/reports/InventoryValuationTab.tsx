import React from 'react';
import { InventoryValuationData } from '../../lib/reports/types';
import { formatReportCurrency } from '../../lib/reports/formatters';
import { Package, Clock, AlertTriangle, ArrowUpDown, Shield } from 'lucide-react';

interface InventoryValuationTabProps {
  data: InventoryValuationData;
  canViewFinancials: boolean; // True for OWNER, False for MANAGER/PHARMACIST
  currency?: string;
}

export const InventoryValuationTab: React.FC<InventoryValuationTabProps> = ({
  data,
  canViewFinancials,
  currency = 'NGN'
}) => {
  return (
    <div className="space-y-6">
      {/* Top Cards: Valuation Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {/* Retail Valuation */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Retail Valuation</span>
            <Package className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatReportCurrency(data.retailValuation, false, currency)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Based on current selling prices</div>
        </div>

        {/* Cost Valuation */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Cost Valuation</span>
            <Shield className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight">
            {formatReportCurrency(data.costValuation, !canViewFinancials, currency)}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {canViewFinancials ? 'Based on batch cost prices' : 'Restricted to Owner'}
          </div>
        </div>

        {/* Total Active Batches */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Active Batches</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">Stock &gt; 0</span>
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {data.totalBatchesCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">In selected branch inventory</div>
        </div>

        {/* Total Units in Stock */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="text-xs text-slate-400 mb-1 flex items-center justify-between">
            <span>Total Units on Hand</span>
            <ArrowUpDown className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl font-bold text-white tracking-tight font-mono">
            {data.totalUnitsCount.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Physical inventory units</div>
        </div>
      </div>

      {/* Second Grid: Expiry Risk Horizons & Stock Adjustments Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expiry Risk Horizons */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Expiry Risk Horizons
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">FEFO Expiry Forecast</span>
          </div>

          <div className="space-y-3">
            {/* Expired */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs">
              <div className="flex items-center gap-2 text-rose-300">
                <AlertTriangle className="w-4 h-4 text-rose-400" />
                <span className="font-semibold">Expired Batches (Immediate Quarantine)</span>
              </div>
              <span className="font-bold text-rose-400 font-mono text-sm">
                {data.expiryRisk.expired}
              </span>
            </div>

            {/* Within 30 Days */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs">
              <div className="flex items-center gap-2 text-amber-300">
                <Clock className="w-4 h-4 text-amber-400" />
                <span className="font-medium">Critical Expiry (Within 30 Days)</span>
              </div>
              <span className="font-bold text-amber-400 font-mono text-sm">
                {data.expiryRisk.within30Days}
              </span>
            </div>

            {/* Within 60 Days */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Clock className="w-4 h-4 text-sky-400" />
                <span className="font-medium">Near Expiry (31 to 60 Days)</span>
              </div>
              <span className="font-bold text-sky-400 font-mono text-sm">
                {data.expiryRisk.within60Days}
              </span>
            </div>

            {/* Within 90 Days */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <Clock className="w-4 h-4 text-slate-400" />
                <span className="font-medium">Upcoming Horizon (61 to 90 Days)</span>
              </div>
              <span className="font-bold text-slate-300 font-mono text-sm">
                {data.expiryRisk.within90Days}
              </span>
            </div>

            {/* Healthy */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="font-medium">Safe Stock (&gt; 90 Days)</span>
              </div>
              <span className="font-bold text-emerald-400 font-mono text-sm">
                {data.expiryRisk.healthy}
              </span>
            </div>
          </div>
        </div>

        {/* Stock Adjustments & Shrinkage Audit */}
        <div className="p-5 rounded-xl bg-slate-900/80 border border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <ArrowUpDown className="w-4 h-4 text-teal-400" />
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">
                Inventory Adjustments & Shrinkage
              </h3>
            </div>
            <span className="text-[11px] text-slate-500 font-mono">
              {data.adjustmentsAudit.adjustmentEventsCount} Audit Events
            </span>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                <div className="text-slate-400 text-[11px]">Positive Adjustments</div>
                <div className="text-lg font-bold text-emerald-400 font-mono mt-0.5">
                  +{data.adjustmentsAudit.positiveQuantity} units
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Discovered / found stock</div>
              </div>

              <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
                <div className="text-slate-400 text-[11px]">Negative Adjustments</div>
                <div className="text-lg font-bold text-rose-400 font-mono mt-0.5">
                  -{data.adjustmentsAudit.negativeQuantity} units
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5">Shrinkage, damages & losses</div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-slate-950/80 border border-slate-800 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-300 font-medium">Net Stock Adjustment Delta:</span>
                <span
                  className={`font-mono font-bold text-sm ${
                    data.adjustmentsAudit.netQuantityDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}
                >
                  {data.adjustmentsAudit.netQuantityDelta >= 0 ? '+' : ''}
                  {data.adjustmentsAudit.netQuantityDelta} units
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                Reflects authoritative adjustments executed via Migration M-14 (<code className="text-slate-400">rpc_adjust_inventory_stock</code>) during selected report date window.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
