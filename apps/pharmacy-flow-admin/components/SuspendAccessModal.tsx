'use client';

import React, { useState } from 'react';
import { X, ShieldAlert, CheckCircle2, AlertTriangle, Building2, Ban, Lock, Unlock } from 'lucide-react';
import { Pharmacy } from '@/lib/mock-data';

interface SuspendAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacy: Pharmacy | null;
  onConfirmToggleSuspension: (pharmacy: Pharmacy, suspend: boolean, reason: string) => void;
}

const SUSPENSION_REASONS = [
  'Subscription Expired & Overdue (>14 Days)',
  'Non-payment of Annual Renewal Licensing',
  'NAFDAC Regulatory Hold / Compliance Review',
  'Fraudulent Transaction / Security Audit',
  'Requested by Superintendent Pharmacist',
  'Administrative Operational Audit',
];

export default function SuspendAccessModal({
  isOpen,
  onClose,
  pharmacy,
  onConfirmToggleSuspension,
}: SuspendAccessModalProps) {
  const [reason, setReason] = useState(SUSPENSION_REASONS[0]);
  const [customNotes, setCustomNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !pharmacy) return null;

  const isCurrentlySuspended = !!pharmacy.is_suspended;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      const finalReason = customNotes.trim() ? `${reason} - ${customNotes.trim()}` : reason;
      onConfirmToggleSuspension(pharmacy, !isCurrentlySuspended, finalReason);
      setIsSubmitting(false);
      onClose();
    }, 350);
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[210] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-card border border-border w-full max-w-md rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className={`px-5 py-4 border-b border-border flex items-center justify-between ${
          isCurrentlySuspended ? 'bg-success/10' : 'bg-error/10'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              isCurrentlySuspended ? 'bg-success/20 text-success' : 'bg-error/20 text-error'
            }`}>
              {isCurrentlySuspended ? <Unlock className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">
                {isCurrentlySuspended ? 'Restore Pharmacy Access' : 'Suspend Pharmacy Access'}
              </h3>
              <p className="text-xs text-text-secondary truncate max-w-xs">{pharmacy.business_name}</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/10"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Target Store Banner */}
          <div className="p-3 bg-bg/50 border border-border rounded-lg flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-accent" />
              <div>
                <p className="font-semibold text-text-primary">{pharmacy.business_name}</p>
                <p className="text-[11px] text-text-secondary">
                  Owner: {pharmacy.owner_name} • {pharmacy.state || 'Lagos'}
                </p>
              </div>
            </div>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
              isCurrentlySuspended 
                ? 'bg-error/20 text-error border-error/30' 
                : 'bg-success/20 text-success border-success/30'
            }`}>
              {isCurrentlySuspended ? 'Currently Suspended' : 'Currently Active'}
            </span>
          </div>

          {!isCurrentlySuspended ? (
            <>
              {/* Warning Callout */}
              <div className="p-3 rounded-lg bg-error/10 border border-error/25 text-xs text-error space-y-1">
                <div className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Impact of Access Suspension</span>
                </div>
                <p className="text-[11px] text-text-secondary leading-relaxed">
                  Suspending this pharmacy will immediately revoke store login credentials, halt POS inventory synchronization, and alert the registered superintendent pharmacist.
                </p>
              </div>

              {/* Suspension Reason */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                  Reason for Suspension *
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {SUSPENSION_REASONS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              {/* Optional Administrative Note */}
              <div>
                <label className="block text-xs font-semibold text-text-secondary mb-1">
                  Administrative Reference Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Called pharmacist twice; no response to invoice sent via NIBSS."
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg p-2.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent placeholder:text-text-secondary/50"
                />
              </div>
            </>
          ) : (
            <div className="p-4 rounded-lg bg-success/10 border border-success/25 text-xs space-y-2">
              <div className="flex items-center gap-2 text-success font-semibold">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Re-enable Full Store Operations</span>
              </div>
              <p className="text-text-secondary text-[11px] leading-relaxed">
                Re-activating access will instantly unlock terminal logins, allow medication dispensing, and restore cloud backup sync for this branch.
              </p>
              {pharmacy.suspension_reason && (
                <div className="p-2 bg-bg rounded border border-border text-[11px] text-text-secondary">
                  <span className="font-semibold text-text-primary">Original suspension reason: </span>
                  {pharmacy.suspension_reason}
                </div>
              )}
            </div>
          )}

          {/* Action Footer */}
          <div className="pt-3 border-t border-border flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs text-text-secondary hover:text-text-primary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-4 py-2 rounded-lg text-xs font-bold text-white flex items-center gap-2 shadow-sm transition-all ${
                isCurrentlySuspended
                  ? 'bg-success hover:bg-success/90'
                  : 'bg-error hover:bg-error/90'
              }`}
            >
              {isSubmitting ? (
                <span>Updating Access...</span>
              ) : isCurrentlySuspended ? (
                <>
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Restore Access Now</span>
                </>
              ) : (
                <>
                  <Lock className="w-3.5 h-3.5" />
                  <span>Confirm Access Suspension</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
