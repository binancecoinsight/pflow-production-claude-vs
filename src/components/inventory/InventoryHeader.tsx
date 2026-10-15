import React from 'react';
import { 
  Database, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Package, 
  Layers, 
  ArrowDownToLine, 
  Sliders, 
  ArrowLeftRight,
  Plus
} from 'lucide-react';
import { CatalogFreshnessStatus } from '../../lib/pos/types';

interface InventoryHeaderProps {
  pharmacyName: string;
  currency: string;
  isOnline: boolean;
  catalogFreshness: CatalogFreshnessStatus;
  isSyncing: boolean;
  onSync: () => void;
  totalProductsCount: number;
  canReceiveStock?: boolean;
  onOpenStockIntake?: () => void;
  canAdjustStock?: boolean;
  onOpenStockAdjustment?: () => void;
  canTransferStock?: boolean;
  onOpenStockTransfer?: () => void;
  canManageCatalog?: boolean;
  onOpenCreateProduct?: () => void;
}

export const InventoryHeader: React.FC<InventoryHeaderProps> = ({
  pharmacyName,
  currency,
  isOnline,
  catalogFreshness,
  isSyncing,
  onSync,
  totalProductsCount,
  canReceiveStock = false,
  onOpenStockIntake,
  canAdjustStock = false,
  onOpenStockAdjustment,
  canTransferStock = false,
  onOpenStockTransfer,
  canManageCatalog = false,
  onOpenCreateProduct
}) => {
  return (
    <header className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur-md mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Title and Architectural Context */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Package className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold text-white tracking-tight">
                Inventory & Batch Explorer
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                {pharmacyName} ({currency})
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                IndexedDB Read Model
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>{totalProductsCount} {totalProductsCount === 1 ? 'product' : 'products'} cached locally</span>
              <span>•</span>
              <span className="text-slate-400">Authoritative stock managed on PostgreSQL</span>
            </p>
          </div>
        </div>

        {/* Status Indicators & Server Sync Action */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Online / Offline Status */}
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
            title={isOnline ? 'Online - Live connection to Supabase' : 'Offline - Operating from local IndexedDB read model'}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 animate-pulse" />
                <span>Offline (Local Cache)</span>
              </>
            )}
          </div>

          {/* Catalog Freshness Badge */}
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              catalogFreshness.productCount === 0
                ? 'bg-slate-800 text-slate-400 border-slate-700'
                : catalogFreshness.isStale
                ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20'
            }`}
            title={
              catalogFreshness.syncedAt
                ? `Last snapshot: ${new Date(catalogFreshness.syncedAt).toLocaleTimeString()}`
                : 'No local snapshot'
            }
          >
            <Database className="w-3.5 h-3.5" />
            {catalogFreshness.productCount === 0 ? (
              <span>Catalog Empty</span>
            ) : catalogFreshness.isStale ? (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Catalog Stale</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Catalog Fresh</span>
              </span>
            )}
          </div>

          {/* Sync Catalog Button */}
          {isOnline && (
            <button
              type="button"
              onClick={onSync}
              disabled={isSyncing}
              className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center gap-2 shadow-lg shadow-emerald-600/20 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              title="Refresh inventory snapshot from authoritative Supabase database"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Catalog'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Authoritative Boundaries Banner & Disabled Operations Indicators */}
      <div className="mt-4 pt-3 border-t border-slate-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
        <div className="flex items-center gap-2 text-slate-400">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>
            <strong className="text-slate-300 font-medium">Read-Model Semantics:</strong> Quantities displayed below are local projections. Authoritative inventory movements and deficit journals occur strictly on PostgreSQL.
          </span>
        </div>

        {/* Authoritative Server Mutation Operations */}
        <div className="flex items-center gap-2 shrink-0">
          {canReceiveStock && isOnline ? (
            <button
              type="button"
              onClick={onOpenStockIntake}
              className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Receive new stock into authoritative PostgreSQL inventory (Phase 5D-15)"
            >
              <ArrowDownToLine className="w-3 h-3 text-emerald-400" />
              <span>Receive Stock</span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-400 text-[11px] font-medium border border-slate-700/60 flex items-center gap-1.5 cursor-not-allowed opacity-75"
              title={
                !isOnline
                  ? "Stock receiving requires an active server connection to PostgreSQL"
                  : "Stock receiving requires Pharmacist or Management role authorization (inventory.write)"
              }
            >
              <ArrowDownToLine className="w-3 h-3" />
              <span>Receive Stock</span>
            </button>
          )}
          {canAdjustStock && isOnline ? (
            <button
              type="button"
              onClick={onOpenStockAdjustment}
              className="px-2.5 py-1 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 text-[11px] font-semibold border border-amber-500/30 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              title="Adjust physical batch inventory authoritatively (Phase 5D-16)"
            >
              <Sliders className="w-3 h-3 text-amber-400" />
              <span>Adjust Stock</span>
            </button>
          ) : (
            <button
              type="button"
              disabled
              className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-400 text-[11px] font-medium border border-slate-700/60 flex items-center gap-1.5 cursor-not-allowed opacity-75"
              title={
                !isOnline
                  ? "Stock adjustment requires an active server connection to PostgreSQL"
                  : "Stock adjustment requires Owner, Manager, or Pharmacist authorization (inventory.adjust)"
              }
            >
              <Sliders className="w-3 h-3" />
              <span>Adjust Stock</span>
            </button>
          )}
          {canTransferStock ? (
            isOnline ? (
              <button
                type="button"
                onClick={onOpenStockTransfer}
                className="px-2.5 py-1 rounded-lg bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 text-[11px] font-semibold border border-teal-500/30 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                title="Dispatch stock transfer to another branch (Phase 5D-18)"
              >
                <ArrowLeftRight className="w-3 h-3 text-teal-400" />
                <span>Transfer Stock</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-400 text-[11px] font-medium border border-slate-700/60 flex items-center gap-1.5 cursor-not-allowed opacity-75"
                title="Stock transfers require an active server connection to PostgreSQL"
              >
                <ArrowLeftRight className="w-3 h-3" />
                <span>Transfer Stock</span>
              </button>
            )
          ) : null}
          {canManageCatalog ? (
            isOnline ? (
              <button
                type="button"
                onClick={onOpenCreateProduct}
                className="px-2.5 py-1 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 text-[11px] font-semibold border border-emerald-500/30 flex items-center gap-1.5 transition cursor-pointer shadow-sm"
                title="Create a new catalog product (Phase 5D-22)"
              >
                <Plus className="w-3 h-3 text-emerald-400" />
                <span>New Product</span>
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="px-2.5 py-1 rounded-lg bg-slate-800/80 text-slate-400 text-[11px] font-medium border border-slate-700/60 flex items-center gap-1.5 cursor-not-allowed opacity-75"
                title="Product creation requires an active server connection to PostgreSQL"
              >
                <Plus className="w-3 h-3" />
                <span>New Product</span>
              </button>
            )
          ) : null}
        </div>
      </div>
    </header>
  );
};
