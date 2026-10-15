import React, { useEffect } from 'react';
import { AlertTriangle, Barcode, X, Check, ShieldAlert, Tag, Package } from 'lucide-react';
import { LocalProduct } from '../../lib/inventory/types';
import { formatMinorUnits } from './formatters';

interface BarcodeDuplicateModalProps {
  isOpen: boolean;
  barcode: string;
  matches: LocalProduct[];
  currency: string;
  onSelectProduct: (product: LocalProduct) => void;
  onClose: () => void;
}

export const BarcodeDuplicateModal: React.FC<BarcodeDuplicateModalProps> = ({
  isOpen,
  barcode,
  matches,
  currency,
  onSelectProduct,
  onClose
}) => {
  // Listen for Escape key to safely cancel
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-barcode-title"
    >
      <div className="bg-slate-900 border border-amber-500/40 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Warning Header */}
        <div className="p-5 border-b border-slate-800 bg-amber-500/10 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 id="duplicate-barcode-title" className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Multiple Products Match Barcode
                </h2>
                <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold bg-slate-950 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <Barcode className="w-3.5 h-3.5" />
                  <span>{barcode}</span>
                </span>
              </div>
              <p className="text-xs text-amber-200/80 mt-1">
                {matches.length} products in this pharmacy share this barcode. Automated selection is disabled to ensure safety. Inspect the items below and select the correct active product, or cancel.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            title="Cancel scan (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning Banner */}
        <div className="px-5 py-2.5 bg-slate-950/60 border-b border-slate-800 flex items-center gap-2 text-xs text-slate-400">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            Fail-Safe Invariant: Inactive products cannot be selected. Cancelling leaves your cart completely unchanged.
          </span>
        </div>

        {/* Matches Candidate List */}
        <div className="p-5 overflow-y-auto space-y-3 flex-1 max-h-[450px]">
          {matches.map((product) => {
            const isInactive = product.status?.toUpperCase() === 'INACTIVE';

            return (
              <div
                key={product.id}
                className={`p-4 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  isInactive
                    ? 'bg-slate-950/40 border-slate-800/60 opacity-60'
                    : 'bg-slate-950/80 border-slate-800 hover:border-emerald-500/50 hover:bg-slate-900/60'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-white">
                      {product.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                        isInactive
                          ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      }`}
                    >
                      {product.status}
                    </span>
                    {product.category && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-800 text-slate-300 border border-slate-700">
                        {product.category}
                      </span>
                    )}
                  </div>

                  {product.generic_name && (
                    <div className="text-xs text-slate-400 italic mt-0.5">
                      Generic: {product.generic_name}
                    </div>
                  )}

                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400 font-mono flex-wrap">
                    {product.sku && (
                      <span className="flex items-center gap-1">
                        <Tag className="w-3 h-3 text-slate-500" />
                        <span>SKU: {product.sku}</span>
                      </span>
                    )}
                    {product.unit && (
                      <span>Unit: {product.unit}</span>
                    )}
                  </div>
                </div>

                {/* Price and Explicit Selection Action */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-bold text-emerald-400 font-mono">
                      {formatMinorUnits(product.selling_price, currency)}
                    </div>
                    <div className="text-[10px] text-slate-500">Selling Price</div>
                  </div>

                  {isInactive ? (
                    <button
                      type="button"
                      disabled
                      className="px-3 py-2 rounded-xl bg-slate-800/80 text-slate-500 text-xs font-semibold border border-slate-700 cursor-not-allowed"
                      title="Inactive products cannot be sold"
                    >
                      INACTIVE — Cannot be sold
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onSelectProduct(product)}
                      className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 text-xs font-bold flex items-center gap-1.5 shadow-md shadow-emerald-500/20 transition cursor-pointer"
                      title={`Select ${product.name} and add to sale cart`}
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Select This Product</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400">
            Press Esc or click Cancel to abort. The current sale cart will remain unchanged.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs transition cursor-pointer"
          >
            Cancel Scan
          </button>
        </div>
      </div>
    </div>
  );
};
