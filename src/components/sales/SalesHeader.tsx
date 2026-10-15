import React from 'react';
import { 
  Receipt, 
  Wifi, 
  WifiOff, 
  RefreshCw, 
  ShieldCheck, 
  Clock, 
  AlertCircle, 
  Lock, 
  Layers 
} from 'lucide-react';

interface SalesHeaderProps {
  pharmacyName: string;
  currency: string;
  isOnline: boolean;
  role: string | null;
  pendingCount: number;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export const SalesHeader: React.FC<SalesHeaderProps> = ({
  pharmacyName,
  currency,
  isOnline,
  role,
  pendingCount,
  isRefreshing,
  onRefresh
}) => {
  const isCashier = role === 'CASHIER';

  return (
    <header className="bg-slate-900/90 border border-slate-800/80 rounded-2xl p-4 sm:p-5 shadow-lg backdrop-blur-md mb-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Title and Architectural Context */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <Receipt className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-lg font-bold text-white tracking-tight">
                Sales & Transaction History
              </h1>
              <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                {pharmacyName} ({currency})
              </span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold border tracking-wider uppercase flex items-center gap-1 ${
                isCashier
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
              }`}>
                <ShieldCheck className="w-3 h-3" />
                <span>{isCashier ? 'Cashier Self-Only' : 'Pharmacy-Wide Access'}</span>
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1.5">
              <span>Authoritative records on PostgreSQL</span>
              <span>•</span>
              <span className="text-slate-400">
                {isCashier ? 'Filtered strictly to your authenticated cashier sessions' : 'Viewing store-wide transactions across all cashiers'}
              </span>
            </p>
          </div>
        </div>

        {/* Status Indicators & Server Sync Action */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Pending Sync Badge (If any offline sales queued) */}
          {pendingCount > 0 && (
            <div className="px-3 py-1.5 rounded-xl border border-amber-500/30 bg-amber-500/15 text-amber-300 text-xs font-semibold flex items-center gap-2 animate-pulse">
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>{pendingCount} Pending Local Sync</span>
            </div>
          )}

          {/* Online / Offline Status */}
          <div
            className={`px-3 py-1.5 rounded-xl border text-xs font-medium flex items-center gap-2 ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
            }`}
            title={isOnline ? 'Online - Connected to PostgreSQL via PostgREST' : 'Offline - Displaying cached local transactions'}
          >
            {isOnline ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Online</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 animate-pulse" />
                <span>Offline Mode</span>
              </>
            )}
          </div>

          {/* Refresh Action */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-2 border border-slate-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            title="Reload transactions"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? 'Loading...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      {/* Immutability Banner */}
      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-2 text-xs text-slate-400">
        <Lock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span>
          <strong className="text-slate-300 font-medium">Immutability Invariant:</strong> Completed sales cannot be modified or deleted. Authoritative financial integrity is protected by PostgreSQL audit triggers.
        </span>
      </div>
    </header>
  );
};
