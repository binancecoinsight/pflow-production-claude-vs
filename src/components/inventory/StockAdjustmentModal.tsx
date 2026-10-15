import React, { useState, useMemo } from 'react';
import { 
  X, 
  Sliders, 
  Package, 
  Building2, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldCheck, 
  PlusCircle, 
  MinusCircle, 
  FileText, 
  Info,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { 
  LocalProduct, 
  LocalBatch, 
  StockAdjustmentDirection, 
  StockAdjustmentReason,
  StockAdjustmentResult 
} from '../../lib/inventory/types';
import { adjustInventoryStock } from '../../lib/inventory/service';
import { formatDate } from '../pos/formatters';

interface StockAdjustmentModalProps {
  pharmacyId: string;
  pharmacyName: string;
  currency?: string;
  branchId: string;
  branchName: string;
  products: LocalProduct[];
  batchesMap: Record<string, LocalBatch[]>;
  initialProductId?: string | null;
  initialBatchId?: string | null;
  isOnline: boolean;
  onClose: () => void;
  onAdjustmentSuccess: (result: StockAdjustmentResult) => void;
}

export const StockAdjustmentModal: React.FC<StockAdjustmentModalProps> = ({
  pharmacyId,
  pharmacyName,
  currency = 'NGN',
  branchId,
  branchName,
  products,
  batchesMap,
  initialProductId,
  initialBatchId,
  isOnline,
  onClose,
  onAdjustmentSuccess
}) => {
  // Selected target state
  const [selectedProductId, setSelectedProductId] = useState<string>(initialProductId || (products[0]?.id || ''));
  const [selectedBatchId, setSelectedBatchId] = useState<string>(initialBatchId || '');

  // Adjustment Parameters
  const [direction, setDirection] = useState<StockAdjustmentDirection>('DECREASE');
  const [quantityInput, setQuantityInput] = useState<string>('1');
  const [reason, setReason] = useState<StockAdjustmentReason>('COUNT_DISCREPANCY');
  const [notes, setNotes] = useState<string>('');

  // Execution & UI Feedback State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<StockAdjustmentResult | null>(null);

  // Available batches for selected product
  const availableBatches = useMemo(() => {
    if (!selectedProductId) return [];
    return batchesMap[selectedProductId] || [];
  }, [selectedProductId, batchesMap]);

  // Selected batch object
  const activeBatch = useMemo(() => {
    if (!selectedBatchId) {
      return availableBatches[0] || null;
    }
    return availableBatches.find((b) => b.id.toLowerCase() === selectedBatchId.toLowerCase()) || availableBatches[0] || null;
  }, [selectedBatchId, availableBatches]);

  // Sync selectedBatchId if needed
  React.useEffect(() => {
    if (activeBatch && activeBatch.id !== selectedBatchId) {
      setSelectedBatchId(activeBatch.id);
    }
  }, [activeBatch, selectedBatchId]);

  // Current selected product object
  const activeProduct = useMemo(() => {
    return products.find((p) => p.id.toLowerCase() === selectedProductId.toLowerCase()) || null;
  }, [selectedProductId, products]);

  // Parsed quantity magnitude
  const parsedQuantity = useMemo(() => {
    const q = parseInt(quantityInput, 10);
    return isNaN(q) ? 0 : q;
  }, [quantityInput]);

  // Projected stock calculation
  const currentStock = activeBatch ? activeBatch.projected_stock : 0;
  const projectedResultStock = useMemo(() => {
    if (!activeBatch || parsedQuantity <= 0) return currentStock;
    return direction === 'INCREASE' 
      ? currentStock + parsedQuantity 
      : currentStock - parsedQuantity;
  }, [activeBatch, currentStock, direction, parsedQuantity]);

  // Validation
  const isValidAdjustment = useMemo(() => {
    if (!isOnline) return false;
    if (!activeBatch || !activeProduct) return false;
    if (parsedQuantity <= 0 || !Number.isInteger(parsedQuantity)) return false;
    if (!reason) return false;
    return true;
  }, [isOnline, activeBatch, activeProduct, parsedQuantity, reason]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValidAdjustment || !activeBatch || !activeProduct) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessResult(null);

    const clientOpId = crypto.randomUUID();

    const result = await adjustInventoryStock({
      pharmacy_id: pharmacyId,
      branch_id: branchId,
      product_id: activeProduct.id,
      batch_id: activeBatch.id,
      direction,
      quantity: parsedQuantity,
      reason,
      notes: notes.trim() || undefined,
      client_op_id: clientOpId
    });

    setIsSubmitting(false);

    if (result.success) {
      setSuccessResult(result);
      onAdjustmentSuccess(result);
    } else {
      setErrorMessage(result.error || 'Failed to submit inventory stock adjustment.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-start justify-between gap-4 bg-slate-950/40">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">
                  Inventory Stock Adjustment
                </h2>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Phase 5D-16
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
                <span>{pharmacyName}</span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Building2 className="w-3 h-3 text-slate-400" />
                  {branchName}
                </span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Offline Warning Banner */}
          {!isOnline && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0" />
              <div>
                <p className="font-semibold text-rose-200">Offline: Server Connection Required</p>
                <p className="text-[11px] text-rose-300/80 mt-0.5">
                  Stock adjustments modify authoritative physical inventory and cannot be executed while offline.
                </p>
              </div>
            </div>
          )}

          {/* Error Message Alert */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Success Message Banner */}
          {successResult && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 space-y-1">
                <p className="font-bold text-emerald-200 text-sm">Stock Adjustment Complete</p>
                <p className="text-[11px] text-emerald-300/90">
                  Authoritative quantity updated: <strong className="font-mono">{successResult.previous_quantity}</strong> → <strong className="font-mono">{successResult.resulting_quantity}</strong>
                </p>
                <p className="text-[10px] font-mono text-emerald-400/80">
                  Ledger movement appended • Reference ID: {successResult.adjustment_id?.slice(0, 8)}...
                </p>
              </div>
            </div>
          )}

          {!successResult && (
            <form onSubmit={handleSubmit} className="space-y-4" id="stock-adjustment-form">
              {/* Product Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Target Product
                </label>
                <select
                  value={selectedProductId}
                  onChange={(e) => {
                    setSelectedProductId(e.target.value);
                    const newBatches = batchesMap[e.target.value] || [];
                    if (newBatches[0]) setSelectedBatchId(newBatches[0].id);
                  }}
                  disabled={isSubmitting || Boolean(initialProductId)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.generic_name ? `(${p.generic_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Batch Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Target Inventory Batch
                </label>
                {availableBatches.length === 0 ? (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 text-center">
                    No active batches found for this product.
                  </div>
                ) : (
                  <select
                    value={activeBatch?.id || ''}
                    onChange={(e) => setSelectedBatchId(e.target.value)}
                    disabled={isSubmitting || Boolean(initialBatchId)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 font-mono transition"
                  >
                    {availableBatches.map((b) => (
                      <option key={b.id} value={b.id}>
                        Lot: {b.batch_number} • Exp: {formatDate(b.expiry_date)} • Stock: {b.projected_stock}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Active Batch Summary Card */}
              {activeBatch && (
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block uppercase">Current Stock</span>
                    <span className="font-mono font-bold text-sm text-white">
                      {activeBatch.projected_stock} units
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 block uppercase">Expiry Date</span>
                    <span className="font-mono text-slate-300">
                      {formatDate(activeBatch.expiry_date)}
                    </span>
                  </div>
                </div>
              )}

              {/* Direction Selector (Increase / Decrease) */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Adjustment Direction
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDirection('INCREASE')}
                    disabled={isSubmitting}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
                      direction === 'INCREASE'
                        ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Increase (+)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('DECREASE')}
                    disabled={isSubmitting}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold transition cursor-pointer ${
                      direction === 'DECREASE'
                        ? 'bg-rose-500/10 border-rose-500/40 text-rose-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <MinusCircle className="w-4 h-4" />
                    <span>Decrease (-)</span>
                  </button>
                </div>
              </div>

              {/* Quantity Magnitude Input */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Adjustment Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={quantityInput}
                    onChange={(e) => setQuantityInput(e.target.value)}
                    disabled={isSubmitting}
                    placeholder="e.g. 5"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white font-mono focus:outline-none focus:border-amber-500 transition"
                  />
                </div>

                {/* Projected Resulting Quantity Card */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Projected New Stock
                  </label>
                  <div className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs flex items-center justify-between">
                    <span className="text-slate-400">Result:</span>
                    <span className={`font-mono font-bold ${
                      projectedResultStock < 0 
                        ? 'text-rose-400' 
                        : projectedResultStock === 0 
                        ? 'text-amber-400' 
                        : 'text-emerald-400'
                    }`}>
                      {projectedResultStock} units
                    </span>
                  </div>
                </div>
              </div>

              {/* Reason Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Adjustment Reason <span className="text-rose-400">*</span>
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value as StockAdjustmentReason)}
                  disabled={isSubmitting}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-amber-500 transition"
                >
                  <option value="COUNT_DISCREPANCY">Physical Count Discrepancy</option>
                  <option value="DAMAGED">Damaged / Broken Stock</option>
                  <option value="EXPIRED">Expired Medication Removal</option>
                  <option value="RECEIVED_CORRECTION">Inbound Receipt Count Correction</option>
                  <option value="THEFT">Shrinkage / Unaccounted Loss</option>
                  <option value="OTHER">Other Operational Reason</option>
                </select>
              </div>

              {/* Notes / Reference */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Audit Notes / Reference (Optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting}
                  placeholder="Provide context for audit compliance..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white placeholder-slate-400 focus:outline-none focus:border-amber-500 transition resize-none"
                />
              </div>
            </form>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">
            Authoritative Server Operation • Generates Immutable Ledger Movement
          </span>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
            >
              {successResult ? 'Close' : 'Cancel'}
            </button>

            {!successResult && (
              <button
                type="submit"
                form="stock-adjustment-form"
                disabled={!isValidAdjustment || isSubmitting}
                className={`px-4 py-2 rounded-xl font-medium text-xs flex items-center gap-2 transition cursor-pointer ${
                  isValidAdjustment && !isSubmitting
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                    : 'bg-slate-800 text-slate-400 cursor-not-allowed'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5" />
                    <span>Apply Adjustment</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
