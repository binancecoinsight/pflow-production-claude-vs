'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Building2, Database, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { createClient } from '@/lib/supabase';
import {
  createAdminLoadingState,
  getAdminControlReadiness,
  loadAdminPharmacyData,
  type AdminDataState,
} from '@/lib/admin-data-readiness';

export interface DashboardProps {
  adminUser?: { email?: string | null } | null;
  adminProfile?: {
    user_id?: string;
    platform_role?: string;
    is_active?: boolean;
    granted_at?: string;
    notes?: string | null;
  } | null;
}

const Unavailable = ({ children = 'Unavailable' }: { children?: React.ReactNode }) => (
  <span className="text-text-secondary italic">{children}</span>
);

export default function Dashboard({ adminUser, adminProfile }: DashboardProps = {}) {
  const [dataState, setDataState] = useState<AdminDataState>(createAdminLoadingState);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;

    loadAdminPharmacyData(() => {
      const supabase = createClient();
      return supabase
        ? supabase.from('pharmacies').select('id,name,subscription_plan,subscription_expires_at,created_at')
        : null;
    }).then((nextState) => {
      if (active) setDataState(nextState);
    });

    return () => {
      active = false;
    };
  }, [loadAttempt]);

  const retry = useCallback(() => {
    setDataState(createAdminLoadingState());
    setLoadAttempt((attempt) => attempt + 1);
  }, []);
  const controls = useMemo(() => getAdminControlReadiness(dataState), [dataState]);
  const identity = adminUser?.email || 'Authenticated platform administrator';
  const role = adminProfile?.platform_role || 'Role unavailable';

  return (
    <main className="min-h-screen bg-bg text-text-primary">
      <header className="border-b border-border bg-card/70 px-5 py-4">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-bold">PharmacyFlow Admin Support</h1>
              <p className="text-xs text-text-secondary">Authoritative account-readiness view</p>
            </div>
          </div>
          <div className="text-left text-xs sm:text-right">
            <p className="font-semibold">{identity}</p>
            <p className="text-text-secondary">{role}</p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl space-y-6 p-5 sm:p-8">
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4" role="status">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
            <div>
              <h2 className="text-sm font-bold">Operational actions disabled</h2>
              <p className="mt-1 text-xs leading-relaxed text-text-secondary">
                {controls.mutationReason}
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="flex items-center gap-2 font-bold">
                <Database className="h-4 w-4 text-accent" />
                Pharmacy accounts
              </h2>
              <p className="mt-1 text-xs text-text-secondary">
                Only fields returned by the current authoritative pharmacy read are displayed. Missing fields remain unavailable.
              </p>
            </div>
            <button
              type="button"
              disabled={!controls.refreshEnabled}
              onClick={retry}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${dataState.status === 'loading' ? 'animate-spin' : ''}`} />
              Refresh authoritative data
            </button>
          </div>

          {dataState.status === 'loading' && (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3" aria-busy="true">
              <Loader2 className="h-7 w-7 animate-spin text-accent" />
              <p className="text-sm text-text-secondary">Loading authoritative pharmacy accounts…</p>
            </div>
          )}

          {dataState.status === 'error' && (
            <div className="mt-6 rounded-xl border border-error/30 bg-error/10 p-6 text-center" role="alert">
              <AlertTriangle className="mx-auto h-7 w-7 text-error" />
              <h3 className="mt-3 font-bold">Authoritative data unavailable</h3>
              <p className="mx-auto mt-2 max-w-xl text-sm text-text-secondary">{dataState.message}</p>
            </div>
          )}

          {dataState.status === 'empty' && (
            <div className="mt-6 rounded-xl border border-border p-8 text-center">
              <Building2 className="mx-auto h-7 w-7 text-text-secondary" />
              <h3 className="mt-3 font-bold">No pharmacy accounts returned</h3>
              <p className="mt-2 text-sm text-text-secondary">
                The authoritative query completed successfully and returned an empty result. No demo accounts were substituted.
              </p>
            </div>
          )}

          {dataState.status === 'ready' && (
            <div className="mt-6 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-bg/70 text-xs uppercase tracking-wide text-text-secondary">
                  <tr>
                    <th className="p-3">Pharmacy name</th>
                    <th className="p-3">Account ID</th>
                    <th className="p-3">Plan</th>
                    <th className="p-3">Created</th>
                    <th className="p-3">Financial activity</th>
                    <th className="p-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {dataState.records.map((pharmacy) => (
                    <tr key={pharmacy.key}>
                      <td className="p-3 font-semibold">{pharmacy.name || <Unavailable />}</td>
                      <td className="p-3 font-mono text-xs">{pharmacy.id || <Unavailable />}</td>
                      <td className="p-3">{pharmacy.subscriptionPlan || <Unavailable />}</td>
                      <td className="p-3">{pharmacy.createdAt || <Unavailable />}</td>
                      <td className="p-3"><Unavailable>Unavailable — not queried</Unavailable></td>
                      <td className="p-3"><Unavailable>Disabled</Unavailable></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
