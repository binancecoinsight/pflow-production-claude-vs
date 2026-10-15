import React, { useState } from 'react';
import {
  X,
  ArrowDownToLine,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Building2,
  WifiOff,
  Package,
  Layers
} from 'lucide-react';
import {
  StockTransferWithBranches,
  StockTransferReceiveResult
} from '../../lib/inventory/types';
import { receiveStockTransfer } from '../../lib/inventory/service';
import { formatDate } from '../pos/formatters';

interface StockTransferReceiveModalProps {
  pharmacyId: string;
  transfer: StockTransferWithBranches;
  userRole: string;
  userDefaultBranchId?: string | null;
  isOnline: boolean;
  onClose: () => void;
  onReceiveSuccess: (result: StockTransferReceiveResult) => void;
}

export const StockTransferReceiveModal: React.FC<StockTransferReceiveModalProps> = ({
  pharmacyId,
  transfer,
  userRole,
  userDefaultBranchId,
  isOnline,
  onClose,
  onReceiveSuccess
}) => {
  const isOwner = userRole === 'OWNER';
  const isDestinationMatch =
    userDefaultBranchId &&
    userDefaultBranchId.toLowerCase() === transfer.destination_branch_id.toLowerCase();
  const isAuthorized = isOwner || isDestinationMatch;

  const [notes, setNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<StockTransferReceiveResult | null>(null);

  const handleConfirmReceive = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isOnline) {
      setErrorMessage('Stock transfer receipt requires an active server connection. Offline receives are not supported.');
      return;
    }

    if (transfer.status !== 'DISPATCHED') {
      setErrorMessage(`Transfer is in ${transfer.status} status and cannot be received.`);
      return;
    }

    if (!isAuthorized) {
      setErrorMessage('Permission Denied: You must be assigned to the destination branch to receive this transfer.');
      return;
    }

    setIsSubmitting(true);
    try {
      const clientOpId = crypto.randomUUID();
      const result = await receiveStockTransfer({
        pharmacy_id: pharmacyId,
        transfer_id: transfer.id,
        client_op_id: clientOpId,
        notes: notes.trim() || null
      });

      if (!result.success) {
        let msg = result.error || 'Failed to receive stock transfer';
        if (result.errorCode === 'FORBIDDEN_BRANCH') {
          msg = 'Permission Denied: Only staff assigned to the destination branch (or Owners) can receive stock.';
        } else if (result.errorCode === 'TRANSFER_ALREADY_RECEIVED') {
          msg = 'This transfer has already been received.';
        } else if (result.errorCode === 'INVALID_TRANSFER_STATUS') {
          msg = 'Transfer is not in DISPATCHED status.';
        } else if (result.errorCode === 'BATCH_METADATA_CONFLICT') {
          msg = 'Batch Conflict: Incoming transfer batch expiry date conflicts with existing destination batch metadata.';
        }
        setErrorMessage(msg);
        return;
      }

      setSuccessResult(result);
      onReceiveSuccess(result);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred during transfer receipt.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              <ArrowDownToLine className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Receive Stock Transfer
              </h2>
              <p className="text-xs text-slate-400">
                Authoritative inventory ingestion at destination branch
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs text-slate-300">
          {!isOnline && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-3">
              <WifiOff className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                <strong>Offline Mode Active:</strong> Receiving stock requires live PostgreSQL ledger confirmation. Operations are temporarily paused.
              </span>
            </div>
          )}

          {!isAuthorized && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
              <span>
                <strong>Branch Authorization Warning:</strong> This transfer is destined for <strong>{transfer.destination_branch_name}</strong>. Only staff assigned to that branch (or Pharmacy Owners) may confirm receipt.
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successResult ? (
            <div className="py-6 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-white">Stock Transfer Received Successfully</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                All items from transfer <span className="font-mono text-emerald-400">{transfer.id.slice(0, 8)}</span> have been credited to inventory at {transfer.destination_branch_name}. Transfer is now in RECEIVED status.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs cursor-pointer shadow-lg shadow-emerald-600/20 transition"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleConfirmReceive} className="space-y-4">
              {/* Transfer Summary Card */}
              <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Transfer Reference:</span>
                  <span className="font-mono text-slate-200">{transfer.id.slice(0, 8)}...</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Source Branch:</span>
                  <span className="font-medium text-slate-200">{transfer.source_branch_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Destination Branch:</span>
                  <span className="font-medium text-emerald-400">{transfer.destination_branch_name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Items / Total Units:</span>
                  <span className="font-bold text-slate-200">
                    {transfer.total_items || 0} line items ({transfer.total_quantity || 0} units)
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Dispatched At:</span>
                  <span className="text-slate-300">{formatDate(transfer.dispatched_at)}</span>
                </div>
              </div>

              {/* Optional Notes */}
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">
                  Receipt Inspection Notes (Optional)
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Verified seals and quantities intact"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Invariant Explanation */}
              <div className="p-3 rounded-lg bg-slate-950/40 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <p className="font-medium text-slate-300">Authoritative Invariant Protection:</p>
                <p>
                  Receiving stock executes a double-entry ledger entry (+Q TRANSFER_IN at destination) and completes the in-transit balance. Partial receipts are rejected by PostgreSQL constraints.
                </p>
              </div>

              {/* Actions */}
              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !isOnline || !isAuthorized}
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Confirming Receipt...</span>
                    </>
                  ) : (
                    <>
                      <ArrowDownToLine className="w-3.5 h-3.5" />
                      <span>Confirm & Ingest Stock</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
