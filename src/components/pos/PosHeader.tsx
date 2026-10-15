import React from 'react';
import { Wifi, WifiOff, Database, ShoppingBag, Clock, CheckCircle2, User, Store, RefreshCw } from 'lucide-react';

interface PosHeaderProps {
  pharmacyName: string;
  branchName: string;
  cashierName: string;
  cashierEmail?: string;
  isOnline: boolean;
  catalogFreshness: {
    isStale: boolean;
    syncedAt: number | null;
    productCount: number;
  };
  cartItemsCount: number;
  cartTotalFormatted: string;
  onSyncCatalog?: () => void;
  isSyncingCatalog?: boolean;
}

export const PosHeader: React.FC<PosHeaderProps> = ({
  pharmacyName,
  branchName,
  cashierName,
  cashierEmail,
  isOnline,
  catalogFreshness,
  cartItemsCount,
  cartTotalFormatted,
  onSyncCatalog,
  isSyncingCatalog
}) => {
  return (
    <header className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur-md mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Left: Pharmacy & Branch Details */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-slate-950 font-bold shadow-md shadow-emerald-500/20">
            <Store className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white tracking-tight">
                {pharmacyName}
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                {branchName}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span className="flex items-center gap-1">
                <User className="w-3 h-3 text-slate-500" />
                <span className="text-slate-300 font-medium">{cashierName}</span>
                {cashierEmail && <span className="text-slate-500 hidden sm:inline">({cashierEmail})</span>}
              </span>
            </div>
          </div>
        </div>

        {/* Right: Operational Status Badges */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
          {/* Online / Offline Status */}
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-2 transition ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
            title={isOnline ? 'Internet connection active' : 'Offline mode active - sales will be stored locally and queued'}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 animate-pulse" />
                <span>Offline (Local Mode)</span>
              </>
            )}
          </div>

          {/* Catalog Freshness Status */}
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
                ? `Last local snapshot: ${new Date(catalogFreshness.syncedAt).toLocaleTimeString()}`
                : 'No local catalog snapshot'
            }
          >
            <Database className="w-3.5 h-3.5" />
            {catalogFreshness.productCount === 0 ? (
              <span>Catalog Empty</span>
            ) : catalogFreshness.isStale ? (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3 text-amber-400" />
                <span>Catalog Stale ({catalogFreshness.productCount} items)</span>
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>Catalog Fresh ({catalogFreshness.productCount} items)</span>
              </span>
            )}
            {onSyncCatalog && isOnline && (
              <button
                type="button"
                onClick={onSyncCatalog}
                disabled={isSyncingCatalog}
                className="ml-1 p-0.5 rounded hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                title="Refresh authoritative catalog snapshot"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingCatalog ? 'animate-spin text-emerald-400' : ''}`} />
              </button>
            )}
          </div>

          {/* Quick Cart Pill */}
          <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 flex items-center gap-2 font-mono">
            <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" />
            <span>
              {cartItemsCount} {cartItemsCount === 1 ? 'item' : 'items'}
            </span>
            <span className="text-slate-600">•</span>
            <span className="text-emerald-400 font-semibold">{cartTotalFormatted}</span>
          </div>
        </div>
      </div>
    </header>
  );
};
