import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export const StaffInvitationForm: React.FC<{ onAccepted?: () => void }> = ({ onAccepted }) => {
  const { acceptStaffInvitation } = useAuth();
  const [invitationId, setInvitationId] = useState('');
  const [rawToken, setRawToken] = useState('');
  const [state, setState] = useState<'idle' | 'submitting' | 'accepted'>('idle');
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setState('submitting');
    const outcome = await acceptStaffInvitation(invitationId, rawToken);
    if (outcome.error) {
      setError(outcome.error.message);
      setState('idle');
      return;
    }
    setRawToken('');
    setState('accepted');
    onAccepted?.();
  };

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left">
      <div className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
        <KeyRound className="h-4 w-4" />
        Accept staff invitation
      </div>
      <p className="text-xs text-slate-400">The server verifies the confirmed email, tenant, role, expiry, revocation and replay state. No role or pharmacy can be selected here.</p>
      <input aria-label="Invitation ID" value={invitationId} onChange={(event) => setInvitationId(event.target.value)} placeholder="Invitation ID" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
      <input aria-label="Invitation token" type="password" value={rawToken} onChange={(event) => setRawToken(event.target.value)} placeholder="Invitation token" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-white" />
      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      {state === 'accepted' && <p role="status" className="text-xs text-emerald-300">Invitation accepted. Your authorized pharmacy memberships were refreshed.</p>}
      <button type="submit" disabled={state === 'submitting'} className="w-full rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-50">
        {state === 'submitting' ? 'Verifying invitation…' : 'Accept invitation'}
      </button>
    </form>
  );
};

