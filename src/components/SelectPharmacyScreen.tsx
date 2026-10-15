import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Building2, ArrowRight, ShieldCheck, LogOut } from 'lucide-react';

export const SelectPharmacyScreen: React.FC = () => {
  const { user, profile, memberships, selectPharmacy, signOut } = useAuth();

  const getRoleBadgeColor = (r: string) => {
    switch (r) {
      case 'OWNER':
        return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'MANAGER':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'PHARMACIST':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'CASHIER':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      default:
        return 'bg-slate-800 text-slate-400 border-slate-700';
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 selection:bg-emerald-500/20 selection:text-emerald-400">
      <div className="w-full max-w-lg">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 items-center justify-center shadow-xl shadow-emerald-500/20 text-slate-950 font-bold text-2xl mb-4">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Select Pharmacy Workspace</h1>
          <p className="text-sm text-slate-400 mt-1">
            Logged in as <strong className="text-slate-200">{profile?.full_name || user?.email}</strong>
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Your identity is linked to multiple active pharmacy organizations. Choose a workspace:
          </p>
        </div>

        {/* Memberships List */}
        <div className="space-y-3 mb-8">
          {memberships.map((m) => (
            <button
              key={m.id}
              onClick={() => selectPharmacy(m.pharmacy_id)}
              className="w-full text-left p-5 rounded-2xl bg-slate-900/80 hover:bg-slate-800/80 border border-slate-800/90 hover:border-emerald-500/40 transition shadow-lg flex items-center justify-between group"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 group-hover:text-emerald-400 group-hover:border-emerald-500/30 transition">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-white text-base">
                      {m.pharmacy?.name || 'Unnamed Pharmacy'}
                    </span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      {m.pharmacy?.currency || 'NGN'}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 font-mono mt-0.5">
                    Tenant ID: {m.pharmacy_id.slice(0, 8)}...
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className={`px-2.5 py-1 rounded-lg text-xs font-bold border tracking-wider flex items-center gap-1 ${getRoleBadgeColor(m.role)}`}>
                  <ShieldCheck className="w-3 h-3" />
                  <span>{m.role}</span>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 group-hover:translate-x-0.5 transition" />
              </div>
            </button>
          ))}
        </div>


        {/* Footer Actions */}
        <div className="text-center pt-4 border-t border-slate-900">
          <button
            onClick={() => signOut()}
            className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-rose-400 transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign out of this account</span>
          </button>
        </div>
      </div>
    </div>
  );
};
