'use client';

import React, { useState, useMemo } from 'react';
import { 
  X, Gift, Award, CheckCircle2, Search, Building2, User, Phone, 
  CreditCard, Sparkles, Send, ShieldCheck, AlertCircle, Copy, Check,
  QrCode, RefreshCw, ChevronRight, Package, Smartphone, DollarSign,
  FileText
} from 'lucide-react';
import { 
  Referral, 
  CustomerReferrer, 
  EntitlementPreset, 
  ReferralRewardType 
} from '@/lib/mock-data';

interface GiveRewardModalProps {
  isOpen: boolean;
  onClose: () => void;
  referrals: Referral[];
  referrers: CustomerReferrer[];
  presets: EntitlementPreset[];
  initialReferral?: Referral | null;
  initialReferrer?: CustomerReferrer | null;
  onConfirmGrantReward: (rewardData: {
    referralId?: string;
    referrerId: string;
    referrerName: string;
    rewardType: ReferralRewardType;
    entitlementTitle: string;
    amountNgn: number;
    voucherCode?: string;
    bankName?: string;
    accountNumber?: string;
    sendNotification: boolean;
    notes: string;
  }) => void;
}

export default function GiveRewardModal({
  isOpen,
  onClose,
  referrals,
  referrers,
  presets,
  initialReferral,
  initialReferrer,
  onConfirmGrantReward,
}: GiveRewardModalProps) {
  // Determine initial selection
  const defaultReferrer = useMemo(() => {
    if (initialReferrer) return initialReferrer;
    if (initialReferral) {
      const match = referrers.find(r => r.name.toLowerCase() === initialReferral.referrer_name.toLowerCase());
      if (match) return match;
    }
    return referrers[0] || null;
  }, [initialReferrer, initialReferral, referrers]);

  const [selectedReferrerId, setSelectedReferrerId] = useState<string>(
    defaultReferrer?.id || ''
  );
  const [selectedReferralId, setSelectedReferralId] = useState<string>(
    initialReferral?.id || ''
  );

  const [referrerSearch, setReferrerSearch] = useState('');
  const [selectedRewardType, setSelectedRewardType] = useState<ReferralRewardType>(
    initialReferral?.eligible_reward_type || 'cash_transfer'
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    presets[0]?.id || ''
  );
  
  const [entitlementTitle, setEntitlementTitle] = useState(
    initialReferral?.eligible_reward_title || '₦10,000 Direct Cash Payout'
  );
  const [amountNgn, setAmountNgn] = useState<number>(
    initialReferral?.eligible_reward_value || 10000
  );
  const [voucherCode, setVoucherCode] = useState(() => 
    `REF-REWARD-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [sendNotification, setSendNotification] = useState(true);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Current selected referrer
  const currentReferrer = useMemo(() => {
    return referrers.find(r => r.id === selectedReferrerId) || null;
  }, [referrers, selectedReferrerId]);

  // Bank fields initialized from selected referrer
  const [bankName, setBankName] = useState(currentReferrer?.bank_details.bank_name || 'Guaranty Trust Bank (GTB)');
  const [accountNumber, setAccountNumber] = useState(currentReferrer?.bank_details.account_number || '0123456789');

  // Associated referral (if any)
  const currentReferral = useMemo(() => {
    return referrals.find(r => r.id === selectedReferralId) || null;
  }, [referrals, selectedReferralId]);

  // Filter referrers list for search
  const filteredReferrers = useMemo(() => {
    if (!referrerSearch.trim()) return referrers;
    const q = referrerSearch.toLowerCase();
    return referrers.filter(r => 
      r.name.toLowerCase().includes(q) ||
      r.referral_code.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      r.email.toLowerCase().includes(q)
    );
  }, [referrers, referrerSearch]);

  // Handle preset change
  const handleSelectPreset = (preset: EntitlementPreset) => {
    setSelectedPresetId(preset.id);
    setSelectedRewardType(preset.category);
    setEntitlementTitle(preset.title);
    setAmountNgn(preset.value_ngn);
  };

  const generateNewVoucherCode = () => {
    const prefix = selectedRewardType === 'cash_transfer' ? 'PAY' 
      : selectedRewardType === 'subscription_credit' ? 'SUB' 
      : selectedRewardType === 'drug_voucher' ? 'MED' 
      : 'PERK';
    const rand = Math.floor(100000 + Math.random() * 900000);
    setVoucherCode(`${prefix}-${rand}`);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(voucherCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentReferrer) return;

    setIsSubmitting(true);
    setTimeout(() => {
      onConfirmGrantReward({
        referralId: selectedReferralId || undefined,
        referrerId: currentReferrer.id,
        referrerName: currentReferrer.name,
        rewardType: selectedRewardType,
        entitlementTitle: entitlementTitle.trim() || 'Referral Incentive',
        amountNgn: Number(amountNgn) || 0,
        voucherCode: voucherCode || undefined,
        bankName: selectedRewardType === 'cash_transfer' ? bankName : undefined,
        accountNumber: selectedRewardType === 'cash_transfer' ? accountNumber : undefined,
        sendNotification,
        notes: notes.trim(),
      });
      setIsSubmitting(false);
      onClose();
    }, 500);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div 
        className="bg-card border border-border rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl my-auto animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-bg/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-sm">
              <Gift className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2">
                Disburse Referral Incentive &amp; Entitlement
              </h2>
              <p className="text-xs text-text-secondary">
                Reward customer advocates and partner pharmacies with cash payouts, free subscription months, or supply vouchers.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto custom-scrollbar">
          
          {/* STEP 1: Select Recipient */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-primary tracking-wide uppercase flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-accent" />
                <span>1. Select Beneficiary / Advocate</span>
              </label>
              <span className="text-[11px] text-text-secondary">
                {referrers.length} Registered Advocates
              </span>
            </div>

            {/* Quick dropdown or search */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <select
                  value={selectedReferrerId}
                  onChange={(e) => {
                    const rId = e.target.value;
                    setSelectedReferrerId(rId);
                    const found = referrers.find(r => r.id === rId);
                    if (found) {
                      setBankName(found.bank_details.bank_name);
                      setAccountNumber(found.bank_details.account_number);
                    }
                  }}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {filteredReferrers.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.tier} · {r.referral_code})
                    </option>
                  ))}
                </select>
              </div>

              {/* If attached to a specific referral */}
              <div>
                <select
                  value={selectedReferralId}
                  onChange={(e) => {
                    const refId = e.target.value;
                    setSelectedReferralId(refId);
                    const foundRef = referrals.find(r => r.id === refId);
                    if (foundRef) {
                      if (foundRef.eligible_reward_title) setEntitlementTitle(foundRef.eligible_reward_title);
                      if (foundRef.eligible_reward_value) setAmountNgn(foundRef.eligible_reward_value);
                      if (foundRef.eligible_reward_type) setSelectedRewardType(foundRef.eligible_reward_type);
                    }
                  }}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  <option value="">General Entitlement (Not tied to single referral)</option>
                  {referrals.map((ref) => (
                    <option key={ref.id} value={ref.id}>
                      For {ref.referred_name} ({ref.status === 'converted' ? 'Converted' : ref.status})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Beneficiary Card Summary */}
            {currentReferrer && (
              <div className="bg-bg/60 border border-border/80 rounded-xl p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/15 border border-accent/30 text-accent font-bold flex items-center justify-center text-sm">
                    {currentReferrer.name.split(' ').map(n => n[0]).slice(0, 2).join('')}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-text-primary">{currentReferrer.name}</span>
                      <span className="text-[10px] px-2 py-0.2 rounded-full font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        {currentReferrer.tier} Tier
                      </span>
                      <span className="text-[10px] font-mono text-text-secondary">
                        Code: {currentReferrer.referral_code}
                      </span>
                    </div>
                    <div className="text-text-secondary text-[11px] flex items-center gap-3 mt-0.5">
                      <span>{currentReferrer.phone}</span>
                      <span>·</span>
                      <span>{currentReferrer.email}</span>
                      <span>·</span>
                      <span className="text-emerald-400 font-semibold">{currentReferrer.converted_referrals} stores onboarded</span>
                    </div>
                  </div>
                </div>

                <div className="text-left sm:text-right border-t sm:border-t-0 pt-2 sm:pt-0 border-border/50">
                  <span className="text-[10px] text-text-secondary block">Bank Payout Account</span>
                  <span className="font-mono text-text-primary font-semibold text-[11px]">
                    {currentReferrer.bank_details.bank_name}
                  </span>
                  <span className="font-mono text-accent text-xs block font-bold">
                    {currentReferrer.bank_details.account_number}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: Incentive Type & Catalog Presets */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-text-primary tracking-wide uppercase flex items-center gap-1.5">
              <Award className="w-3.5 h-3.5 text-accent" />
              <span>2. Choose Entitlement Package or Preset</span>
            </label>

            {/* Presets Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {presets.map((preset) => {
                const isSelected = selectedPresetId === preset.id;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset)}
                    className={`text-left p-3 rounded-xl border transition-all text-xs flex flex-col justify-between ${
                      isSelected 
                        ? 'bg-accent/10 border-accent ring-1 ring-accent text-text-primary' 
                        : 'bg-bg/40 border-border hover:border-accent/40 text-text-secondary'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1 mb-1">
                        <span className="font-bold text-text-primary">{preset.title}</span>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-accent shrink-0" />}
                      </div>
                      <p className="text-[11px] text-text-secondary line-clamp-2 leading-relaxed">
                        {preset.description}
                      </p>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-border/50 flex items-center justify-between text-[11px]">
                      <span className="font-mono font-bold text-emerald-400">₦{preset.value_ngn.toLocaleString()}</span>
                      <span className="text-[10px] text-text-secondary">{preset.tier_eligibility}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 3: Customize Reward Details */}
          <div className="bg-bg/40 border border-border rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-text-primary tracking-wide uppercase flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-accent" />
                <span>3. Disbursement Configuration</span>
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSelectedRewardType('cash_transfer')}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    selectedRewardType === 'cash_transfer'
                      ? 'bg-accent text-white'
                      : 'border border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Cash (NIBSS)
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRewardType('subscription_credit')}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    selectedRewardType === 'subscription_credit'
                      ? 'bg-accent text-white'
                      : 'border border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Free Subscription
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRewardType('drug_voucher')}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    selectedRewardType === 'drug_voucher'
                      ? 'bg-accent text-white'
                      : 'border border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Drug Voucher
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedRewardType('hardware_perk')}
                  className={`text-[11px] px-2.5 py-1 rounded-md font-semibold transition-colors ${
                    selectedRewardType === 'hardware_perk'
                      ? 'bg-accent text-white'
                      : 'border border-border text-text-secondary hover:text-text-primary'
                  }`}
                >
                  Hardware Perk
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Entitlement Title / Description
                </label>
                <input
                  type="text"
                  value={entitlementTitle}
                  onChange={(e) => setEntitlementTitle(e.target.value)}
                  className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                  placeholder="e.g. ₦10,000 Direct Cash Payout"
                  required
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                  Equivalent Value in Naira (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono">
                    ₦
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    value={amountNgn}
                    onChange={(e) => setAmountNgn(Number(e.target.value))}
                    className="w-full bg-bg border border-border rounded-lg pl-8 pr-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Cash Payout Bank Verification */}
            {selectedRewardType === 'cash_transfer' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/50">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                    Beneficiary Bank
                  </label>
                  <input
                    type="text"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent font-semibold"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                    NUBAN Account Number
                  </label>
                  <input
                    type="text"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent font-mono font-bold"
                  />
                </div>
              </div>
            )}

            {/* Voucher code for non-cash or reference */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-semibold text-text-secondary">
                  Unique Entitlement Voucher / Reference Code
                </label>
                <button
                  type="button"
                  onClick={generateNewVoucherCode}
                  className="text-[10px] text-accent hover:underline flex items-center gap-1"
                >
                  <RefreshCw className="w-2.5 h-2.5" />
                  <span>Generate New</span>
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={voucherCode}
                  onChange={(e) => setVoucherCode(e.target.value)}
                  className="flex-1 bg-bg border border-border rounded-lg px-3 py-2 text-xs font-mono font-bold text-accent tracking-wider focus:outline-none focus:ring-1 focus:ring-accent uppercase"
                />
                <button
                  type="button"
                  onClick={handleCopyCode}
                  className="border border-border bg-bg hover:bg-white/5 text-text-secondary hover:text-text-primary px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  {copiedCode ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedCode ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                Administrative Notes / Milestone Justification
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="e.g. Paid out for milestone onboarding of 3 verified stores in Lagos mainland..."
                className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary placeholder:text-text-secondary/50 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Notification Checkbox */}
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="sendNotification"
                checked={sendNotification}
                onChange={(e) => setSendNotification(e.target.checked)}
                className="rounded border-border text-accent focus:ring-accent w-4 h-4 bg-bg cursor-pointer"
              />
              <label htmlFor="sendNotification" className="text-xs text-text-primary cursor-pointer">
                Dispatch automated SMS &amp; WhatsApp notice to advocate with redemption claim code
              </label>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:items-center justify-between gap-3 border-t border-border">
            <div className="text-xs text-text-secondary">
              Disbursing <span className="font-bold text-emerald-400 font-mono">₦{amountNgn.toLocaleString()}</span> to <span className="font-semibold text-text-primary">{currentReferrer?.name}</span>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 rounded-lg border border-border text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !currentReferrer || amountNgn <= 0}
                className="bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Processing Disbursement...</span>
                  </>
                ) : (
                  <>
                    <Gift className="w-3.5 h-3.5" />
                    <span>Confirm &amp; Disburse Entitlement</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
