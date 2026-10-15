import React, { useState, useEffect } from 'react';
import {
  X,
  ArrowRightLeft,
  ArrowDownToLine,
  Building2,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  FileText,
  Package,
  Layers,
  Loader2,
  User,
  ShieldCheck
} from 'lucide-react';
import {
  StockTransferWithBranches,
  StockTransferDetail
} from '../../lib/inventory/types';
import { fetchStockTransferDetails } from '../../lib/inventory/service';
import { formatMinorUnits, formatDate } from '../pos/formatters';

interface StockTransferDetailModalProps {
  pharmacyId: string;
  transferSummary: StockTransferWithBranches;
  currency?: string;
  canSeeCostPrice?: boolean;
  userRole: string;
  userDefaultBranchId?: string | null;
  isOnline: boolean;
  onClose: () => void;
  onOpenReceive?: (transfer: StockTransferWithBranches) => void;
}

export const StockTransferDetailModal: React.FC<StockTransferDetailModalProps> = ({
  pharmacyId,
  transferSummary,
  currency = 'NGN',
  canSeeCostPrice = false,
  userRole,
  userDefaultBranchId,
  isOnline,
  onClose,
  onOpenReceive
}) => {
  const [detail, setDetail] = useState<StockTransferDetail | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    const loadDetails = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const result = await fetchStockTransferDetails(pharmacyId, transferSummary.id);
        if (isMounted) {
          if (result.success && result.transfer) {
            setDetail(result.transfer);
          } else {
            setErrorMessage(result.error || 'Failed to load transfer details');
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setErrorMessage(err.message || 'Error loading transfer items');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadDetails();
    return () => {
      isMounted = false;
    };
  }, [pharmacyId, transferSummary.id]);

  const isOwner = userRole === 'OWNER';
  const isDestMatch =
    userDefaultBranchId &&
    userDefaultBranchId.toLowerCase() === transferSummary.destination_branch_id.toLowerCase();
  const canReceive = (isOwner || isDestMatch) && transferSummary.status === 'DISPATCHED';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
              <ArrowRightLeft className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Stock Transfer Details
                </h2>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border ${
                    transferSummary.status === 'RECEIVED'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  }`}
                >
                  {transferSummary.status}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-400">
                ID: {transferSummary.id}
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

        {/* Modal Content */}
        <div className="p-5 overflow-y-auto space-y-5 text-xs text-slate-300">
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 flex items-center gap-3">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Route & Metadata Overview Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Route Box */}
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-400" />
                <span>Inter-Branch Route</span>
              </h4>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Source:</span>
                <span className="font-semibold text-slate-200">
                  {detail?.source_branch_name || transferSummary.source_branch_name}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Destination:</span>
                <span className="font-semibold text-emerald-400">
                  {detail?.destination_branch_name || transferSummary.destination_branch_name}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-800">
                <span className="text-slate-400">Total Units:</span>
                <span className="font-bold text-white">
                  {detail?.total_quantity || transferSummary.total_quantity || 0} units ({detail?.total_items || transferSummary.total_items || 0} lines)
                </span>
              </div>
            </div>

            {/* Lifecycle Timestamps Box */}
            <div className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-teal-400" />
                <span>Audit & Timestamps</span>
              </h4>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Dispatched:</span>
                <span className="text-slate-200">{formatDate(transferSummary.dispatched_at)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Received:</span>
                <span className="text-slate-200">
                  {transferSummary.received_at ? formatDate(transferSummary.received_at) : 'Pending Ingest'}
                </span>
              </div>
              {transferSummary.notes && (
                <div className="pt-1 border-t border-slate-800 text-[11px]">
                  <span className="text-slate-400">Dispatch Notes: </span>
                  <span className="text-slate-300 italic">{transferSummary.notes}</span>
                </div>
              )}
              {transferSummary.receive_notes && (
                <div className="text-[11px]">
                  <span className="text-slate-400">Receipt Notes: </span>
                  <span className="text-slate-300 italic">{transferSummary.receive_notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* Line Items Table */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-teal-400" />
              <span>Transferred Batch Items</span>
            </h4>

            {isLoading ? (
              <div className="py-12 text-center text-slate-400">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-teal-400" />
                <span>Loading line items...</span>
              </div>
            ) : detail?.items && detail.items.length > 0 ? (
              <div className="rounded-xl border border-slate-800 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-800/60 text-slate-400">
                    <tr>
                      <th className="py-2.5 px-3">Product</th>
                      <th className="py-2.5 px-3">Batch Number</th>
                      <th className="py-2.5 px-3">Expiry</th>
                      <th className="py-2.5 px-3 text-right">Qty Dispatched</th>
                      <th className="py-2.5 px-3 text-right">Qty Received</th>
                      {canSeeCostPrice && <th className="py-2.5 px-3 text-right">Cost Price</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                    {detail.items.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-800/30">
                        <td className="py-2.5 px-3">
                          <div className="font-medium text-slate-200">{item.product_name}</div>
                          {item.product_sku && (
                            <div className="text-[10px] font-mono text-slate-400">{item.product_sku}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-300">
                          {item.batch_number}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {formatDate(item.expiry_date)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-teal-400">
                          {item.quantity}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-400">
                          {item.quantity_received !== null ? item.quantity_received : '—'}
                        </td>
                        {canSeeCostPrice && (
                          <td className="py-2.5 px-3 text-right font-mono text-slate-400">
                            {formatMinorUnits(item.cost_price, currency)}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-800 text-slate-500">
                No items recorded for this transfer.
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs transition cursor-pointer"
          >
            Close
          </button>

          {canReceive && onOpenReceive && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenReceive(transferSummary);
              }}
              disabled={!isOnline}
              className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>Receive Stock Transfer</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
