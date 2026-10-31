import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Clock3, RefreshCw, UserRoundCheck } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import {
  deriveStaffInvitationWorkspace,
  isTimeDerivedExpired,
  StaffInvitationExecutor,
  StaffInvitationOversightCoordinator,
  StaffInvitationViewState,
} from '../lib/auth/staffInvitationOversight';

const executeStaffInvitationList: StaffInvitationExecutor = async (arguments_) => {
  const response = await supabase.rpc('rpc_list_staff_invitations', arguments_);
  return { data: response.data, error: response.error };
};

interface StaffInvitationOversightPanelProps {
  readonly executor?: StaffInvitationExecutor;
  readonly now?: () => number;
}

export const StaffInvitationOversightPanel: React.FC<StaffInvitationOversightPanelProps> = ({
  executor = executeStaffInvitationList,
  now = Date.now,
}) => {
  const { user, membership, pharmacy, branch, role } = useAuth();
  const binding = deriveStaffInvitationWorkspace({
    userId: user?.id ?? null,
    membership,
    pharmacy,
    branch,
    role,
  });
  const bindingKey = binding
    ? `${binding.userId}:${binding.membershipId}:${binding.membershipUpdatedAt}:${binding.pharmacyId}:${binding.branchId}:${binding.role}`
    : 'unavailable';
  const currentBindingRef = useRef(binding);
  currentBindingRef.current = binding;
  const coordinatorRef = useRef(new StaffInvitationOversightCoordinator());
  const [reload, setReload] = useState(0);
  const [publication, setPublication] = useState<{
    readonly bindingKey: string;
    readonly view: StaffInvitationViewState;
  }>({ bindingKey, view: { kind: 'loading' } });
  const view: StaffInvitationViewState = publication.bindingKey === bindingKey
    ? publication.view
    : { kind: 'loading' };

  useEffect(() => {
    const coordinator = coordinatorRef.current;
    if (!binding) {
      coordinator.invalidate();
      return;
    }
    void coordinator.load(
      binding,
      () => currentBindingRef.current,
      executor,
      (nextView) => setPublication({ bindingKey, view: nextView }),
    );
    return () => coordinator.invalidate();
  }, [bindingKey, reload, executor]);

  const renderedAt = useMemo(() => now(), [now, view]);
  if (!binding) return null;

  return (
    <section className="mb-8 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-6" aria-labelledby="staff-invitation-oversight-title">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <UserRoundCheck className="h-4 w-4 text-sky-400" />
            <h2 id="staff-invitation-oversight-title" className="text-sm font-semibold text-white">Staff invitation oversight</h2>
          </div>
          <p className="mt-1 text-xs text-slate-500">Read-only invitations for the current pharmacy. Server authorization remains authoritative.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            coordinatorRef.current.invalidate();
            setPublication({ bindingKey, view: { kind: 'loading' } });
            setReload((value) => value + 1);
          }}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-300 hover:border-sky-500/40"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </div>

      {view.kind === 'loading' && (
        <div role="status" className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">Loading staff invitations…</div>
      )}
      {view.kind === 'empty' && (
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-xs text-slate-400">No staff invitations were returned for this pharmacy.</div>
      )}
      {view.kind === 'error' && (
        <div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {view.message}
        </div>
      )}
      {view.kind === 'success' && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-2 py-2">Recipient</th>
                <th className="px-2 py-2">Role</th>
                <th className="px-2 py-2">Server status</th>
                <th className="px-2 py-2">Expiry</th>
                <th className="px-2 py-2">Accepted</th>
                <th className="px-2 py-2">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {view.invitations.map((invitation) => {
                const timeExpired = invitation.status === 'PENDING'
                  && Date.parse(invitation.expires_at) <= renderedAt;
                return (
                  <tr key={invitation.id} className="text-slate-300">
                    <td className="px-2 py-3 font-mono">{invitation.email}</td>
                    <td className="px-2 py-3">{invitation.role}</td>
                    <td className="px-2 py-3">
                      <span>{invitation.status}</span>
                      {timeExpired && (
                        <span className="ml-2 rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-300">Time-derived: past expiry</span>
                      )}
                    </td>
                    <td className="px-2 py-3">{new Date(invitation.expires_at).toLocaleString()}</td>
                    <td className="px-2 py-3">{invitation.accepted_at ? new Date(invitation.accepted_at).toLocaleString() : '—'}</td>
                    <td className="px-2 py-3">{new Date(invitation.created_at).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {view.invitations.some((invitation) => isTimeDerivedExpired(invitation, now)) && (
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-300">
              <Clock3 className="h-3.5 w-3.5" />
              Time-derived indicators do not change or claim to confirm the server-reported status.
            </p>
          )}
        </div>
      )}
    </section>
  );
};
