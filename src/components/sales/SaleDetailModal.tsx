import React from 'react';
import { 
  X, 
  Receipt, 
  Clock, 
  CheckCircle2, 
  AlertTriangle, 
  ShieldCheck, 
  Building2, 
  User as UserIcon, 
  CreditCard, 
  Layers, 
  Lock, 
  RotateCcw, 
  Info,
  Printer
} from 'lucide-react';
import { HistoricalSale } from '../../lib/sales/history';
import { canUserProcessReturns } from '../../lib/sales/returns';
import { formatMinorUnits, formatDate } from '../pos/formatters';

interface SaleDetailModalProps {
  sale: HistoricalSale | null;
  currency: string;
  role?: string | null;
  onClose: () => void;
  onInitiateReturn?: () => void;
  onViewReceipt?: () => void;
}

export const SaleDetailModal: React.FC<SaleDetailModalProps> = ({
  sale,
  currency,
  role,
  onClose,
  onInitiateReturn,
  onViewReceipt
}) => {
  if (!sale) return null;

  const isServerCommitted = sale.provenance === 'SERVER_COMMITTED';
  const isPending = sale.provenance === 'LOCAL_PENDING';
  const canReturn = isServerCommitted && canUserProcessReturns(role);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800/80 flex items-start justify-between gap-4 bg-slate-950/40">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Sale #{sale.id.slice(0, 8)}
                </h2>
                {/* Provenance Badge */}
                {isServerCommitted ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Server Committed</span>
                  </span>
                ) : (
                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                    sale.sync_status === 'PERMANENT_FAILURE' || sale.sync_status === 'AUTH_REQUIRED'
                      ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  }`}>
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>Local Pending ({sale.sync_status})</span>
                  </span>
                )}
                {/* Payment Method Badge */}
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                  {sale.payment_method}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 mt-2 font-mono flex-wrap">
                <span>Time: {new Date(sale.created_at).toLocaleString()}</span>
                <span>•</span>
                <span>ID: {sale.id}</span>
                {sale.client_op_id && (
                  <>
                    <span>•</span>
                    <span>Op: {sale.client_op_id.slice(0, 8)}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transaction Metadata & Financial Summary */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Subtotal</span>
            <span className="text-slate-200 font-mono text-sm mt-0.5 block">
              {formatMinorUnits(sale.subtotal, currency)}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Discount</span>
            <span className="font-mono text-sm mt-0.5 block text-slate-400">
              {sale.discount > 0 ? `-${formatMinorUnits(sale.discount, currency)}` : '₦0.00'}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Tax</span>
            <span className="text-slate-400 font-mono text-sm mt-0.5 block">
              {formatMinorUnits(sale.tax, currency)}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Total Paid</span>
            <span className="font-mono text-base font-bold mt-0.5 block text-emerald-400">
              {formatMinorUnits(sale.total, currency)}
            </span>
          </div>
        </div>

        {/* Operational Context Strip */}
        <div className="px-5 py-2.5 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between gap-4 text-xs text-slate-400 flex-wrap">
          <div className="flex items-center gap-2">
            <Building2 className="w-3.5 h-3.5 text-slate-400" />
            <span>Branch: <strong className="text-slate-300 font-mono">{sale.branch_name || sale.branch_id}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
            <span>Cashier: <strong className="text-slate-300 font-mono">{sale.cashier_name || sale.cashier_id.slice(0, 8)}</strong></span>
          </div>
          <div className="flex items-center gap-2">
            <CreditCard className="w-3.5 h-3.5 text-slate-400" />
            <span>Tender: <strong className="text-slate-300">{sale.payment_method}</strong></span>
          </div>
        </div>

        {/* Pending Sync Alert (If Local Pending) */}
        {isPending && (
          <div className="px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-start gap-2 text-xs text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <strong>Pending Synchronization:</strong> This sale was generated locally and is queued for server transmission. Authoritative ledger entry and PostgreSQL stock deduction will occur upon server synchronization.
              {sale.sync_error && (
                <p className="mt-1 text-[11px] text-rose-300 font-mono">
                  Sync error: {sale.sync_error}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Line Items Table */}
        <div className="p-5 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Sale Line Items ({sale.line_items.length})</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-mono">
              Currency: {currency}
            </span>
          </div>

          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Item / Product</th>
                <th className="py-2.5 px-3">Batch</th>
                <th className="py-2.5 px-3 text-right">Quantity</th>
                <th className="py-2.5 px-3 text-right">Unit Price</th>
                <th className="py-2.5 px-3 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs">
              {sale.line_items.map((item, idx) => (
                <tr key={item.id || idx} className="hover:bg-slate-800/30">
                  <td className="py-3 px-3">
                    <div className="font-semibold text-slate-200">
                      {item.product_name || `Product [${item.product_id.slice(0, 8)}]`}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      ID: {item.product_id}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-mono text-slate-400">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[11px] text-slate-300 border border-slate-700">
                      {item.batch_number || item.batch_id.slice(0, 8)}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-slate-100">
                    {item.quantity}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-300">
                    {formatMinorUnits(item.unit_price, currency)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-emerald-400">
                    {formatMinorUnits(item.line_total, currency)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Modal Footer & Disabled Workflows */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[11px] text-slate-400">
            <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>Immutable record • Editing, re-pricing, or deleting sales is strictly prohibited</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Return / Refund Workflow */}
            {onViewReceipt && (
              <button
                type="button"
                onClick={onViewReceipt}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="View and print customer receipt"
              >
                <Printer className="w-3.5 h-3.5 text-emerald-400" />
                <span>View Receipt</span>
              </button>
            )}

            {canReturn ? (
              <button
                type="button"
                onClick={onInitiateReturn}
                className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                title="Initiate transaction return and restock"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Process Return</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="px-3 py-1.5 rounded-xl bg-slate-800 text-slate-500 text-xs font-medium border border-slate-700/60 flex items-center gap-1.5 cursor-not-allowed opacity-60"
                title={
                  isPending
                    ? 'Pending offline sales cannot be returned until synced with server'
                    : 'Returns require Manager, Owner, or Pharmacist authorization'
                }
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Return (Restricted)</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
