import React from 'react';
import { CheckCircle2, CloudUpload, HardDrive, ArrowRight, ShieldCheck, Printer } from 'lucide-react';
import { Sale } from '../../lib/sales/types';
import { LocalTransaction, SyncQueueItem } from '../../lib/offline/types';
import { formatMinorUnits } from './formatters';

interface SaleSuccessModalProps {
  sale: Sale;
  transaction?: LocalTransaction;
  queueItem?: SyncQueueItem;
  onClose: () => void;
  onViewReceipt?: () => void;
}

export const SaleSuccessModal: React.FC<SaleSuccessModalProps> = ({
  sale,
  transaction,
  queueItem,
  onClose,
  onViewReceipt
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500" />

        {/* Modal Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 mx-auto mb-3 flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Sale Successfully Recorded</h2>
          <p className="text-xs text-slate-400 mt-1">
            Committed to local offline ledger and queued for background synchronization.
          </p>
        </div>

        {/* Dual Storage Status Indicators */}
        <div className="grid grid-cols-2 gap-3 mb-5">
          {/* Status 1: Local IndexedDB Commitment */}
          <div className="p-3 rounded-xl bg-slate-950 border border-emerald-500/20 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold mb-1">
              <HardDrive className="w-3.5 h-3.5" />
              <span>Local Ledger</span>
            </div>
            <div className="text-[11px] text-slate-300">
              Committed Locally ({transaction?.status || 'PENDING'})
            </div>
          </div>

          {/* Status 2: Background Sync Queueing */}
          <div className="p-3 rounded-xl bg-slate-950 border border-sky-500/20 text-xs">
            <div className="flex items-center gap-2 text-sky-400 font-semibold mb-1">
              <CloudUpload className="w-3.5 h-3.5" />
              <span>Sync Status</span>
            </div>
            <div className="text-[11px] text-slate-300">
              Queued ({queueItem?.status || 'PENDING'})
            </div>
          </div>
        </div>

        {/* Sale Summary Receipt Details */}
        <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 mb-5 space-y-2 text-xs">
          <div className="flex justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Total Amount:</span>
            <span className="font-bold text-emerald-400 text-sm font-mono">
              {formatMinorUnits(sale.total, sale.currency)}
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Payment Method:</span>
            <span className="font-medium text-slate-200 uppercase">{sale.payment_method}</span>
          </div>

          <div className="flex justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Items Sold:</span>
            <span className="font-medium text-slate-200">
              {sale.line_items.reduce((acc, li) => acc + li.quantity, 0)} items ({sale.line_items.length} lines)
            </span>
          </div>

          <div className="flex justify-between py-1 border-b border-slate-800/60">
            <span className="text-slate-400">Client Op ID:</span>
            <span className="font-mono text-[10px] text-slate-400 truncate max-w-[220px]" title={sale.client_op_id}>
              {sale.client_op_id}
            </span>
          </div>

          <div className="flex justify-between py-1">
            <span className="text-slate-400">Sale ID:</span>
            <span className="font-mono text-[10px] text-slate-400 truncate max-w-[220px]" title={sale.id}>
              {sale.id}
            </span>
          </div>
        </div>

        {/* Architectural Reassurance Notice */}
        <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950/40 border border-slate-800/60 text-[11px] text-slate-400 mb-5">
          <ShieldCheck className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>
            Sale is immutably hashed and queued. Phase 5D-2 background dispatcher will sign and push to the PostgreSQL ledger when connectivity permits.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          {onViewReceipt && (
            <button
              type="button"
              onClick={onViewReceipt}
              className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center justify-center gap-2 border border-slate-700 transition cursor-pointer"
            >
              <Printer className="w-4 h-4 text-emerald-400" />
              <span>View Receipt</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition cursor-pointer"
          >
            <span>Start Next Sale</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
