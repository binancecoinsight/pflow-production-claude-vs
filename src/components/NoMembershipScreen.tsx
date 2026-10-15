import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Building2, LogOut, RefreshCw, ShieldAlert } from 'lucide-react';
import { SuiteDownloadLink } from './SuiteDownloadLink';

export const NoMembershipScreen: React.FC = () => {
  const { user, profile, signOut, refreshContext } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 text-center shadow-2xl backdrop-blur-xl">
        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 mx-auto mb-4 flex items-center justify-center">
          <Building2 className="w-6 h-6" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2">No Active Pharmacy Membership</h2>
        <p className="text-xs text-slate-400 mb-6 leading-relaxed">
          Authenticated as <strong className="text-slate-200">{profile?.full_name || user?.email}</strong>. 
          Your account is valid, but you have not yet been assigned to an active pharmacy roster in the database.
        </p>

        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 text-left text-xs space-y-2 mb-6 text-slate-400">
          <div className="flex items-center gap-2 text-slate-300 font-medium">
            <ShieldAlert className="w-4 h-4 text-amber-400" />
            <span>Database Access Restricted</span>
          </div>
          <p>
            Under PharmacyFlow&apos;s Row Level Security architecture, users cannot access operational data without an authoritative record in <code className="text-emerald-400">pharmacy_members</code>.
          </p>
          <p>
            Please ask your pharmacy Owner or Manager to invite your email address.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => refreshContext()}
            className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Check Again
          </button>
          <button
            onClick={() => signOut()}
            className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center justify-center gap-2 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>

        {/* Direct Download Link */}
        <div className="mt-6 pt-5 border-t border-slate-800/80">
          <SuiteDownloadLink variant="banner" />
        </div>
      </div>
    </div>
  );
};
