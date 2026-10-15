'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, Key, Building2, Search, CheckCircle2, Copy, Check, 
  ShieldAlert, RefreshCw, Send, Smartphone, Mail, Lock 
} from 'lucide-react';
import { Pharmacy } from '@/lib/mock-data';

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacies: Pharmacy[];
  initialPharmacy?: Pharmacy | null;
  onConfirmResetPassword: (
    pharmacy: Pharmacy, 
    method: 'generate_temp' | 'send_link' | 'custom', 
    details: { tempPassword?: string; forceReset: boolean }
  ) => void;
}

export default function ResetPasswordModal({
  isOpen,
  onClose,
  pharmacies,
  initialPharmacy = null,
  onConfirmResetPassword,
}: ResetPasswordModalProps) {
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(initialPharmacy);
  const [searchQuery, setSearchQuery] = useState('');
  const [resetMethod, setResetMethod] = useState<'generate_temp' | 'send_link' | 'custom'>('generate_temp');
  const [customPassword, setCustomPassword] = useState('');
  const [forceChangeNextLogin, setForceChangeNextLogin] = useState(true);

  // Generated state
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultSuccess, setResultSuccess] = useState(false);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return pharmacies.slice(0, 10);
    const q = searchQuery.toLowerCase();
    return pharmacies.filter(p => 
      p.business_name.toLowerCase().includes(q) ||
      p.owner_name.toLowerCase().includes(q) ||
      p.id.toLowerCase().includes(q) ||
      (p.state && p.state.toLowerCase().includes(q))
    ).slice(0, 10);
  }, [pharmacies, searchQuery]);

  const handleSelect = (p: Pharmacy) => {
    setSelectedPharmacy(p);
    setGeneratedPassword(null);
    setResultSuccess(false);
  };

  const handleGenerateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `PF-${code}!`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPharmacy) return;

    setIsSubmitting(true);

    const tempPass = resetMethod === 'custom' 
      ? customPassword 
      : resetMethod === 'generate_temp' 
      ? handleGenerateRandomPassword() 
      : undefined;

    setTimeout(() => {
      onConfirmResetPassword(selectedPharmacy, resetMethod, {
        tempPassword: tempPass,
        forceReset: forceChangeNextLogin,
      });

      setIsSubmitting(false);
      if (tempPass) {
        setGeneratedPassword(tempPass);
      }
      setResultSuccess(true);
    }, 400);
  };

  const handleCopy = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-[220] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-card border border-border w-full max-w-lg rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between bg-card/90">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-500">
              <Key className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-text-primary">Reset Pharmacy Password</h3>
              <p className="text-xs text-text-secondary">
                Generate temporary terminal credentials or dispatch reset links to owners.
              </p>
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

        {/* Content */}
        <div className="p-5 space-y-4">
          {resultSuccess ? (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-success/10 border border-success/30 text-center space-y-2">
                <div className="w-10 h-10 rounded-full bg-success/20 text-success flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-text-primary">
                  Password Reset Executed!
                </h4>
                <p className="text-xs text-text-secondary">
                  Credentials updated for <span className="font-semibold text-text-primary">{selectedPharmacy?.business_name}</span>.
                </p>
              </div>

              {generatedPassword && (
                <div className="p-4 bg-bg border border-border rounded-xl space-y-2">
                  <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider block">
                    Temporary Login Password:
                  </span>
                  <div className="flex items-center justify-between bg-card p-2.5 rounded-lg border border-border/80">
                    <span className="font-mono text-sm font-bold text-accent tracking-wider">
                      {generatedPassword}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="px-2.5 py-1 bg-accent text-white rounded text-xs font-semibold flex items-center gap-1.5 hover:bg-accent/90 transition-colors shadow-sm"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-text-secondary">
                    Send this one-time token to {selectedPharmacy?.owner_name} ({selectedPharmacy?.phone}).
                  </p>
                </div>
              )}

              {resetMethod === 'send_link' && (
                <div className="p-3 bg-bg border border-border rounded-lg text-xs text-text-secondary flex items-center gap-2.5">
                  <Send className="w-4 h-4 text-accent shrink-0" />
                  <span>
                    A secure password reset link has been dispatched via SMS to <strong>{selectedPharmacy?.phone}</strong> and email to <strong>{selectedPharmacy?.email}</strong>.
                  </span>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="bg-accent text-white hover:bg-accent/90 px-4 py-2 rounded-lg text-xs font-semibold"
                >
                  Done &amp; Close
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Step 1: Search and select store if not provided */}
              {!selectedPharmacy ? (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-text-secondary">
                    Select Pharmacy Store to Reset Credentials
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                    <input
                      type="text"
                      placeholder="Search pharmacy name, owner, or ID..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-bg border border-border rounded-lg pl-10 pr-4 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      autoFocus
                    />
                  </div>

                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1 border border-border/60 rounded-lg p-1">
                    {searchResults.map((p) => (
                      <div
                        key={p.id}
                        onClick={() => handleSelect(p)}
                        className="p-2.5 rounded hover:bg-accent/10 hover:border-accent/30 border border-transparent cursor-pointer flex items-center justify-between text-xs transition-colors"
                      >
                        <div>
                          <p className="font-semibold text-text-primary">{p.business_name}</p>
                          <p className="text-[11px] text-text-secondary">{p.owner_name} • {p.phone || '+234 800...'}</p>
                        </div>
                        <span className="text-[10px] font-mono text-accent font-semibold">Select →</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {/* Selected Store Banner */}
                  <div className="p-3 bg-bg/50 border border-border rounded-lg flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2.5">
                      <Building2 className="w-4 h-4 text-accent" />
                      <div>
                        <p className="font-bold text-text-primary">{selectedPharmacy.business_name}</p>
                        <p className="text-[11px] text-text-secondary">
                          Terminal Login ID: <code className="text-text-primary font-mono">{selectedPharmacy.id}</code>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedPharmacy(null)}
                      className="text-xs text-accent underline"
                    >
                      Change
                    </button>
                  </div>

                  {/* Reset Strategy */}
                  <div>
                    <label className="block text-xs font-semibold text-text-secondary mb-1.5">
                      Reset Strategy
                    </label>
                    <div className="space-y-2">
                      {[
                        { 
                          id: 'generate_temp' as const, 
                          label: 'Generate Temporary Password (Recommended)', 
                          note: 'Instantly creates a random secure alphanumeric token you can copy & send.' 
                        },
                        { 
                          id: 'send_link' as const, 
                          label: 'Dispatch Reset Link via SMS & Email', 
                          note: 'Sends an automated verification URL directly to the registered phone number.' 
                        },
                        { 
                          id: 'custom' as const, 
                          label: 'Set Custom Password Manually', 
                          note: 'Specify an explicit administrative password for this cashier.' 
                        },
                      ].map((opt) => (
                        <div
                          key={opt.id}
                          onClick={() => setResetMethod(opt.id)}
                          className={`p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                            resetMethod === opt.id
                              ? 'border-accent bg-accent/10 ring-1 ring-accent'
                              : 'border-border bg-bg/40 text-text-secondary hover:text-text-primary'
                          }`}
                        >
                          <div className="flex items-center justify-between font-bold text-text-primary mb-0.5">
                            <span>{opt.label}</span>
                            <input 
                              type="radio" 
                              checked={resetMethod === opt.id} 
                              onChange={() => setResetMethod(opt.id)} 
                              className="accent-accent"
                            />
                          </div>
                          <p className="text-[11px] text-text-secondary">{opt.note}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Custom password field */}
                  {resetMethod === 'custom' && (
                    <div className="animate-in fade-in duration-150">
                      <label className="block text-xs font-semibold text-text-secondary mb-1">
                        New Custom Password *
                      </label>
                      <input
                        type="text"
                        required
                        value={customPassword}
                        onChange={(e) => setCustomPassword(e.target.value)}
                        placeholder="e.g. LagosCare#2026!"
                        className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  )}

                  {/* Force Reset Checkbox */}
                  <div className="p-3 bg-bg/50 border border-border rounded-lg flex items-center justify-between text-xs">
                    <div>
                      <p className="font-semibold text-text-primary">Force Password Change</p>
                      <p className="text-[11px] text-text-secondary">Cashier will be prompted to create their own secret PIN on next login.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={forceChangeNextLogin}
                      onChange={(e) => setForceChangeNextLogin(e.target.checked)}
                      className="w-4 h-4 accent-accent cursor-pointer"
                    />
                  </div>

                  {/* Footer */}
                  <div className="pt-2 flex items-center justify-between border-t border-border">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-3 py-2 text-xs text-text-secondary hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting || (resetMethod === 'custom' && !customPassword.trim())}
                      className="bg-amber-600 text-white hover:bg-amber-600/90 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-all disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <span>Updating Credentials...</span>
                      ) : (
                        <>
                          <Key className="w-3.5 h-3.5" />
                          <span>Reset Password Now</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
