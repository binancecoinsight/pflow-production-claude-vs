import React from 'react';
import { Building2, LogOut, MapPin, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const BranchSelectionScreen: React.FC<{ unavailable?: boolean }> = ({ unavailable = false }) => {
  const { pharmacy, branches, selectBranch, refreshContext, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            {unavailable ? <ShieldAlert className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
          </div>
          <h1 className="text-xl font-bold text-white">
            {unavailable ? 'No Eligible Branch Available' : 'Select Branch Workspace'}
          </h1>
          <p className="mt-2 text-xs leading-relaxed text-slate-400">
            {unavailable
              ? `The authoritative branch lookup returned no eligible branch for ${pharmacy?.name || 'this pharmacy'}. A default branch identifier alone is not authorization.`
              : `Choose the branch to use for this session in ${pharmacy?.name || 'the selected pharmacy'}. This choice is not stored.`}
          </p>
        </div>

        {!unavailable && (
          <div className="mb-6 space-y-3">
            {branches.map((candidate) => (
              <button
                type="button"
                key={candidate.id}
                onClick={() => selectBranch(candidate.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-left transition hover:border-emerald-500/40 hover:bg-slate-800/80"
              >
                <span className="flex items-center gap-3">
                  <MapPin className="h-4 w-4 text-emerald-400" />
                  <span>
                    <span className="block text-sm font-semibold text-white">{candidate.name}</span>
                    <span className="block text-[11px] font-mono text-slate-500">{candidate.id}</span>
                  </span>
                </span>
                {candidate.is_main && <span className="rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-400">Main</span>}
              </button>
            ))}
          </div>
        )}

        <div className="flex justify-center gap-3 border-t border-slate-800 pt-5">
          <button type="button" onClick={() => refreshContext()} className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-semibold text-slate-200 hover:bg-slate-700">
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh authority
          </button>
          <button type="button" onClick={() => signOut()} className="flex items-center gap-2 rounded-xl border border-rose-500/20 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20">
            <LogOut className="h-3.5 w-3.5" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};
