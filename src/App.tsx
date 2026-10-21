import React from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { AuthScreen } from './components/AuthScreen';
import { NoMembershipScreen } from './components/NoMembershipScreen';
import { SelectPharmacyScreen } from './components/SelectPharmacyScreen';
import { AuthenticatedShell } from './components/AuthenticatedShell';
import { OfflineSyncRuntime } from './components/OfflineSyncRuntime';
import { RefreshCw, AlertCircle, LogOut } from 'lucide-react';

function AppContent() {
  const { state, error, refreshContext, signOut } = useAuth();

  // 1. Initializing or Loading Context
  if (state === 'initializing' || state === 'authenticated_loading') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4">
        <div className="w-10 h-10 border-3 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin mb-4" />
        <h2 className="text-sm font-semibold text-white tracking-wide">
          {state === 'initializing' ? 'Initializing Supabase Client...' : 'Resolving Authoritative Tenant Context...'}
        </h2>
        <p className="text-xs text-slate-500 mt-1 font-mono">
          Verifying active memberships in PostgreSQL pharmacy_members
        </p>
      </div>
    );
  }

  // 2. Unauthenticated State
  if (state === 'unauthenticated') {
    return <AuthScreen />;
  }

  // 3. Authenticated without Active Pharmacy Membership
  if (state === 'authenticated_no_membership') {
    return <NoMembershipScreen />;
  }

  // 4. Authenticated with Multiple Memberships Requiring Selection
  if (state === 'authenticated_select_pharmacy') {
    return <SelectPharmacyScreen />;
  }

  // 5. Authenticated & Context Ready
  if (state === 'authenticated_ready') {
    return (
      <>
        <OfflineSyncRuntime />
        <AuthenticatedShell />
      </>
    );
  }

  // 6. Authenticated Error State
  if (state === 'authenticated_error') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4">
        <div className="w-full max-w-md bg-slate-900/90 border border-rose-500/30 rounded-2xl p-6 sm:p-8 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 mx-auto mb-4 flex items-center justify-center">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Context Resolution Error</h2>
          <p className="text-xs text-slate-400 mb-6 leading-relaxed">
            {error || 'Unable to retrieve your pharmacy authorization records from the database.'}
          </p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => refreshContext()}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Connection
            </button>
            <button
              onClick={() => signOut()}
              className="px-4 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 text-xs font-semibold flex items-center gap-2 transition"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
