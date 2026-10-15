import React from 'react';
import { 
  X, 
  Package, 
  Calendar, 
  Building2, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  ShieldAlert, 
  Sparkles, 
  Layers, 
  DollarSign, 
  Info,
  Sliders,
  Edit3,
  PowerOff,
  CheckCircle,
  Loader2
} from 'lucide-react';
import { LocalProduct, LocalBatch, BatchExpiryInfo } from '../../lib/inventory/types';
import { formatMinorUnits, formatDate } from '../pos/formatters';

interface ProductDetailModalProps {
  product: LocalProduct | null;
  batches: Array<LocalBatch & { expiry: BatchExpiryInfo }>;
  currency: string;
  canSeeCostPrice: boolean;
  branchName?: string;
  canAdjustStock?: boolean;
  onOpenStockAdjustment?: (productId: string, batchId: string) => void;
  canManageCatalog?: boolean;
  onEditProduct?: (product: LocalProduct) => void;
  onToggleProductStatus?: (product: LocalProduct) => void;
  isTogglingStatus?: boolean;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  batches,
  currency,
  canSeeCostPrice,
  branchName = 'Main Branch',
  canAdjustStock = false,
  onOpenStockAdjustment,
  canManageCatalog = false,
  onEditProduct,
  onToggleProductStatus,
  isTogglingStatus = false,
  onClose
}) => {
  if (!product) return null;

  // Calculate total projected stock across all batches
  const totalProjectedStock = batches.reduce((sum, b) => sum + b.projected_stock, 0);

  // Identify earliest-expiring non-expired batch for provisional FEFO pick
  const validBatches = batches.filter((b) => !b.expiry.is_expired && b.projected_stock > 0);
  const fefoBatchId = validBatches.length > 0
    ? [...validBatches].sort((a, b) => a.expiry_date.localeCompare(b.expiry_date))[0]?.id
    : null;

  const isInactive = product.status?.toUpperCase() === 'INACTIVE';

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
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {product.name}
                </h2>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase border ${
                  product.status === 'ACTIVE'
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {product.status}
                </span>
                {product.category && (
                  <span className="px-2 py-0.5 rounded text-[11px] bg-slate-800 text-slate-300 border border-slate-700">
                    {product.category}
                  </span>
                )}
              </div>
              {product.generic_name && (
                <p className="text-xs text-slate-400 mt-0.5 italic">
                  Generic: {product.generic_name}
                </p>
              )}
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-2 font-mono">
                {product.sku && <span>SKU: {product.sku}</span>}
                {product.sku && product.barcode && <span>•</span>}
                {product.barcode && <span>Barcode: {product.barcode}</span>}
                {product.unit && (
                  <>
                    <span>•</span>
                    <span className="font-sans text-slate-400">Unit: {product.unit}</span>
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

        {/* Product Financials & Total Projected Stock Strip */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Selling Price</span>
            <span className="text-emerald-400 font-bold font-mono text-sm mt-0.5 block">
              {formatMinorUnits(product.selling_price, currency)}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Cost Price</span>
            <span className="font-mono text-sm mt-0.5 block text-slate-300">
              {canSeeCostPrice ? (
                formatMinorUnits(product.cost_price, currency)
              ) : (
                <span className="text-slate-500 italic text-xs" title="Restricted to authorized management roles">
                  — (Restricted)
                </span>
              )}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Batch Count</span>
            <span className="text-white font-mono text-sm mt-0.5 block">
              {batches.length} {batches.length === 1 ? 'batch' : 'batches'}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block text-[11px] uppercase tracking-wider font-semibold">Projected Stock</span>
            <span className={`font-mono text-sm font-bold mt-0.5 inline-flex items-center gap-1.5 ${
              totalProjectedStock < 0
                ? 'text-rose-400'
                : totalProjectedStock === 0
                ? 'text-slate-400'
                : totalProjectedStock <= 10
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}>
              {totalProjectedStock < 0
                ? `${totalProjectedStock} (Deficit)`
                : `${totalProjectedStock} units`}
            </span>
          </div>
        </div>

        {/* Critical Non-Authoritative Projection Disclaimer */}
        <div className="px-5 py-2.5 bg-amber-500/5 border-b border-amber-500/10 flex items-center gap-2 text-[11px] text-amber-300">
          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            <strong>Provisional Data:</strong> Batches and projected stock are read-model values cached locally. Real-time authoritative inventory deduction and deficit journals are enforced on the server upon sale sync.
          </span>
        </div>

        {/* Batches Table / Explorer */}
        <div className="p-5 overflow-y-auto flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-400" />
              <span>Available Inventory Batches</span>
            </h3>
            <span className="text-[11px] text-slate-400">
              Sorted by Expiry (Earliest First)
            </span>
          </div>

          {batches.length === 0 ? (
            <div className="py-12 text-center text-slate-400 border border-dashed border-slate-800 rounded-xl">
              <Package className="w-8 h-8 mx-auto text-slate-600 mb-2 opacity-50" />
              <p className="text-xs font-medium">No inventory batches recorded for this product.</p>
              <p className="text-[11px] text-slate-400 mt-1">
                Batches will appear here once an authoritative inventory snapshot is downloaded from the server.
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {batches.map((batch) => {
                const isFefoPick = batch.id === fefoBatchId;
                const isExpired = batch.expiry.is_expired;
                const isExpiringSoon = !isExpired && batch.expiry.days_until_expiry <= 90;

                return (
                  <div
                    key={batch.id}
                    className={`p-3.5 rounded-xl border transition ${
                      isFefoPick
                        ? 'bg-emerald-500/5 border-emerald-500/30'
                        : isExpired
                        ? 'bg-rose-500/5 border-rose-500/20'
                        : 'bg-slate-950/60 border-slate-800'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Batch Info & Tags */}
                      <div className="flex items-start gap-3">
                        <div className="font-mono text-xs font-bold text-white bg-slate-800 px-2 py-1 rounded border border-slate-700">
                          {batch.batch_number}
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* FEFO Tag */}
                            {isFefoPick && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <Sparkles className="w-3 h-3 text-emerald-400" />
                                <span>Provisional FEFO Pick</span>
                              </span>
                            )}

                            {/* Expiry Badge */}
                            {isExpired ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3 text-rose-400" />
                                <span>Expired ({formatDate(batch.expiry_date)})</span>
                              </span>
                            ) : isExpiringSoon ? (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-amber-400" />
                                <span>Expires in {batch.expiry.days_until_expiry}d ({formatDate(batch.expiry_date)})</span>
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>Exp: {formatDate(batch.expiry_date)}</span>
                              </span>
                            )}

                            {/* Status */}
                            <span className="text-[10px] font-mono text-slate-400 uppercase">
                              Status: {batch.status}
                            </span>
                          </div>

                          <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2">
                            <span className="flex items-center gap-1">
                              <Building2 className="w-3 h-3 text-slate-400" />
                              <span>Branch: {branchName}</span>
                            </span>
                            {batch.source_updated_at && (
                              <>
                                <span>•</span>
                                <span>Server Synced: {new Date(batch.source_updated_at).toLocaleDateString()}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: Projected Stock & Pricing */}
                      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-800 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400 block uppercase tracking-wider">Projected Stock</span>
                          <span className={`font-mono text-xs font-bold ${
                            batch.projected_stock < 0
                              ? 'text-rose-400'
                              : batch.projected_stock === 0
                              ? 'text-slate-400'
                              : batch.projected_stock <= 10
                              ? 'text-amber-400'
                              : 'text-emerald-400'
                          }`}>
                            {batch.projected_stock < 0
                              ? `${batch.projected_stock} (Deficit)`
                              : `${batch.projected_stock} units`}
                          </span>
                        </div>

                        <div className="text-[11px] font-mono text-slate-400 sm:mt-1">
                          <span>Sell: {formatMinorUnits(batch.selling_price || product.selling_price, currency)}</span>
                          {canSeeCostPrice && (
                            <span className="ml-2 text-slate-400">
                              Cost: {formatMinorUnits(batch.cost_price || product.cost_price, currency)}
                            </span>
                          )}
                        </div>

                        {canAdjustStock && onOpenStockAdjustment && (
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => onOpenStockAdjustment(product.id, batch.id)}
                              className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/30 flex items-center gap-1 transition cursor-pointer"
                              title="Adjust batch physical stock"
                            >
                              <Sliders className="w-3 h-3 text-amber-400" />
                              <span>Adjust</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {canManageCatalog && onEditProduct && (
              <button
                type="button"
                onClick={() => onEditProduct(product)}
                className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 flex items-center gap-1.5 transition cursor-pointer"
                title="Edit master product details (Phase 5D-22)"
              >
                <Edit3 className="w-3.5 h-3.5 text-slate-400" />
                <span>Edit Product</span>
              </button>
            )}

            {canManageCatalog && onToggleProductStatus && (
              <button
                type="button"
                onClick={() => onToggleProductStatus(product)}
                disabled={isTogglingStatus}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  isInactive
                    ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                    : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                }`}
                title={isInactive ? 'Reactivate product for sales and operations' : 'Deactivate product safely (preserves history)'}
              >
                {isTogglingStatus ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isInactive ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <PowerOff className="w-3.5 h-3.5 text-rose-400" />
                )}
                <span>{isInactive ? 'Reactivate Product' : 'Deactivate Product'}</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              Catalog master data • Authoritative on PostgreSQL
            </span>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs transition cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
