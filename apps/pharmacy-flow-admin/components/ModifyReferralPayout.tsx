'use client';

import React, { useState, useMemo } from 'react';
import { 
  ShieldCheck, DollarSign, Award, SlidersHorizontal, CheckCircle2, 
  RefreshCw, Save, Eye, Smartphone, Store, Gift, Package, 
  CreditCard, Sparkles, Building2, User, ChevronRight, HelpCircle,
  Copy, Check, AlertCircle, ArrowUpRight, Zap, Bell, CheckSquare
} from 'lucide-react';
import { 
  ReferralPayoutConfig, 
  EntitlementPreset, 
  ReferralRewardType,
  PLAN_PRICES 
} from '@/lib/mock-data';

interface ModifyReferralPayoutProps {
  config: ReferralPayoutConfig;
  presets: EntitlementPreset[];
  onSaveConfig: (newConfig: ReferralPayoutConfig, newPresets: EntitlementPreset[]) => void;
  onResetDefaults?: () => void;
}

export default function ModifyReferralPayout({
  config,
  presets,
  onSaveConfig,
  onResetDefaults,
}: ModifyReferralPayoutProps) {
  // Local editable form state
  const [formData, setFormData] = useState<ReferralPayoutConfig>(config);
  const [localPresets, setLocalPresets] = useState<EntitlementPreset[]>(presets);

  // Active sub-tab inside this section: 'rates' | 'tiers' | 'presets' | 'client_preview'
  const [activeSubSection, setActiveSubSection] = useState<'rates' | 'tiers' | 'presets' | 'client_preview'>('rates');

  // Preview interactive calculator store count
  const [previewStoresCount, setPreviewStoresCount] = useState(5);
  const [previewStorePlan, setPreviewStorePlan] = useState<'Standard' | 'Premium' | 'Enterprise'>('Standard');

  // New preset modal or inline form state
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null);
  const [newPresetForm, setNewPresetForm] = useState({
    title: '',
    category: 'cash_transfer' as ReferralRewardType,
    value_ngn: 15000,
    description: '',
    tier_eligibility: 'All Tiers',
  });
  const [showAddPreset, setShowAddPreset] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Field change handler
  const handleNumericChange = (field: keyof ReferralPayoutConfig, val: number) => {
    setFormData(prev => ({
      ...prev,
      [field]: Math.max(0, val)
    }));
  };

  const handleTierChange = (tier: keyof ReferralPayoutConfig['tier_payouts'], val: number) => {
    setFormData(prev => ({
      ...prev,
      tier_payouts: {
        ...prev.tier_payouts,
        [tier]: Math.max(0, val)
      }
    }));
  };

  const handlePresetValueChange = (id: string, val: number) => {
    setLocalPresets(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, value_ngn: Math.max(0, val) };
      }
      return p;
    }));
  };

  const handleSaveAll = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setTimeout(() => {
      const updatedConfig: ReferralPayoutConfig = {
        ...formData,
        last_updated: new Date().toISOString(),
        last_updated_by: {
          name: 'Admin User',
          role: 'Super Admin',
          email: 'medihub.infotech@gmail.com',
        },
      };

      onSaveConfig(updatedConfig, localPresets);
      setIsSaving(false);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 4000);
    }, 450);
  };

  const handleAddPreset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPresetForm.title.trim()) return;

    const newP: EntitlementPreset = {
      id: `ent-${Date.now()}`,
      title: newPresetForm.title.trim(),
      category: newPresetForm.category,
      value_ngn: Number(newPresetForm.value_ngn) || 10000,
      description: newPresetForm.description.trim() || 'Custom entitlement package configured by super admin.',
      tier_eligibility: newPresetForm.tier_eligibility,
      instant_eligible: true,
    };

    setLocalPresets(prev => [...prev, newP]);
    setShowAddPreset(false);
    setNewPresetForm({
      title: '',
      category: 'cash_transfer',
      value_ngn: 15000,
      description: '',
      tier_eligibility: 'All Tiers',
    });
  };

  const handleDeletePreset = (id: string) => {
    if (localPresets.length <= 1) return;
    setLocalPresets(prev => prev.filter(p => p.id !== id));
  };

  // Client preview earnings calculation
  const calculatedClientEarnings = useMemo(() => {
    let tierPayout = formData.tier_payouts.bronze_ngn;
    let tierName = 'Bronze';
    if (previewStoresCount >= 20) {
      tierPayout = formData.tier_payouts.platinum_ngn;
      tierName = 'Platinum';
    } else if (previewStoresCount >= 10) {
      tierPayout = formData.tier_payouts.gold_ngn;
      tierName = 'Gold';
    } else if (previewStoresCount >= 5) {
      tierPayout = formData.tier_payouts.silver_ngn;
      tierName = 'Silver';
    }

    const baseDirectEarnings = previewStoresCount * formData.base_store_payout_ngn;
    const planCost = PLAN_PRICES[previewStorePlan];
    const commissionBonus = Math.round(previewStoresCount * planCost * (formData.commission_percentage / 100));
    const totalPotentialEarnings = baseDirectEarnings + commissionBonus;

    return {
      tierName,
      tierPayout,
      baseDirectEarnings,
      commissionBonus,
      totalPotentialEarnings,
    };
  }, [previewStoresCount, previewStorePlan, formData]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Super Admin Tag Header Banner */}
      <div className="bg-card border-2 border-purple-500/30 rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40 uppercase tracking-wider font-mono">
                <ShieldCheck className="w-3.5 h-3.5 text-purple-400" />
                Super Admin Privilege
              </span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Client-Side Sync Active
              </span>
            </div>

            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary flex items-center gap-2">
              Modify Referral Amount &amp; Payout Rules
            </h2>
            <p className="text-xs sm:text-sm text-text-secondary max-w-3xl">
              Super admins can adjust base cash payouts, milestone bonuses, and commission rates. All updates saved here immediately calibrate the client-facing referral menu, advocate reward catalog, and instant NIBSS disbursement thresholds.
            </p>
          </div>

          {/* Save & Reset Header Actions */}
          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            {onResetDefaults && (
              <button
                type="button"
                onClick={onResetDefaults}
                className="border border-border bg-bg/80 hover:bg-white/5 text-text-secondary hover:text-text-primary px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
                title="Reset to system factory defaults"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Reset Defaults</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSaveAll()}
              disabled={isSaving}
              className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Publishing Changes...</span>
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  <span>Save &amp; Publish to Client Menu</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Audit Meta Bar */}
        <div className="mt-4 pt-3.5 border-t border-border/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[11px] text-text-secondary">
          <div className="flex items-center gap-3">
            <span>Last reviewed: <strong className="text-text-primary font-mono">{new Date(formData.last_updated).toLocaleString('en-NG')}</strong></span>
            <span>·</span>
            <span>Author: <strong className="text-text-primary">{formData.last_updated_by.name} ({formData.last_updated_by.role})</strong></span>
          </div>
          {savedSuccess && (
            <span className="text-emerald-400 font-bold flex items-center gap-1 animate-in fade-in">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Published! Client-facing referral menu updated in real time.
            </span>
          )}
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-1.5 border-b border-border text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveSubSection('rates')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubSection === 'rates'
              ? 'border-purple-500 text-purple-400 font-bold bg-purple-500/10'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          <span>1. Base Payouts &amp; Commission</span>
        </button>

        <button
          onClick={() => setActiveSubSection('tiers')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubSection === 'tiers'
              ? 'border-purple-500 text-purple-400 font-bold bg-purple-500/10'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>2. Tier Multipliers &amp; Milestones</span>
        </button>

        <button
          onClick={() => setActiveSubSection('presets')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubSection === 'presets'
              ? 'border-purple-500 text-purple-400 font-bold bg-purple-500/10'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>3. Entitlement Packages Catalog ({localPresets.length})</span>
        </button>

        <button
          onClick={() => setActiveSubSection('client_preview')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeSubSection === 'client_preview'
              ? 'border-emerald-500 text-emerald-400 font-bold bg-emerald-500/10'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>4. Live Client Menu Preview (&quot;What Client Sees&quot;)</span>
        </button>
      </div>

      {/* SUB-SECTION 1: BASE PAYOUTS & COMMISSION */}
      {activeSubSection === 'rates' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            
            {/* Card: Base Cash Rates */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <Store className="w-4 h-4 text-purple-400" />
                    <span>Direct Onboarding Payout Rates (Nigerian Naira)</span>
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Fixed cash bounty disbursed per referee upon successful onboarding and payment verification.
                  </p>
                </div>
                <span className="text-[10px] font-mono text-text-secondary uppercase bg-white/5 px-2 py-0.5 rounded">
                  Instant NIBSS
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Store Referral Payout */}
                <div className="bg-bg/60 border border-border/80 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                      <Store className="w-3.5 h-3.5 text-accent" />
                      <span>Pharmacy Store Payout</span>
                    </label>
                    <span className="text-[10px] text-emerald-400 font-mono font-bold">Standard Store</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono">
                      ₦
                    </span>
                    <input
                      type="number"
                      step="1000"
                      min="1000"
                      value={formData.base_store_payout_ngn}
                      onChange={(e) => handleNumericChange('base_store_payout_ngn', Number(e.target.value))}
                      className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    Credited to advocate when a referred chemist or drug store activates a cloud POS plan.
                  </p>
                </div>

                {/* Customer / Patient Payout */}
                <div className="bg-bg/60 border border-border/80 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-accent" />
                      <span>Individual Customer / Patient Payout</span>
                    </label>
                    <span className="text-[10px] text-accent font-mono font-bold">Patient App</span>
                  </div>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono">
                      ₦
                    </span>
                    <input
                      type="number"
                      step="500"
                      min="500"
                      value={formData.base_customer_payout_ngn}
                      onChange={(e) => handleNumericChange('base_customer_payout_ngn', Number(e.target.value))}
                      className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-accent focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                  </div>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    Credited to advocate when an individual downloads and places their first prescription refill.
                  </p>
                </div>
              </div>
            </div>

            {/* Card: First Year Subscription Commission & Withdrawal Threshold */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-border">
                <div>
                  <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-purple-400" />
                    <span>Recurring Subscription Commission &amp; Thresholds</span>
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Percentage bonus granted to partners based on the referee&apos;s annual or monthly subscription fee.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Commission % */}
                <div className="bg-bg/60 border border-border/80 rounded-xl p-3.5 space-y-2">
                  <label className="text-xs font-bold text-text-primary block">
                    First-Year Plan Commission (%)
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="0"
                      max="50"
                      step="1"
                      value={formData.commission_percentage}
                      onChange={(e) => handleNumericChange('commission_percentage', Number(e.target.value))}
                      className="w-full bg-card border border-border rounded-lg pl-3 pr-8 py-2 text-sm font-mono font-bold text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono font-bold">
                      %
                    </span>
                  </div>
                  <p className="text-[11px] text-text-secondary">
                    Advocate receives this % of the referee&apos;s 1st year cloud subscription fee.
                  </p>
                </div>

                {/* Min Withdrawal Threshold */}
                <div className="bg-bg/60 border border-border/80 rounded-xl p-3.5 space-y-2">
                  <label className="text-xs font-bold text-text-primary block">
                    Minimum Cash Withdrawal Threshold (₦)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono">
                      ₦
                    </span>
                    <input
                      type="number"
                      min="1000"
                      step="1000"
                      value={formData.min_withdrawal_threshold_ngn}
                      onChange={(e) => handleNumericChange('min_withdrawal_threshold_ngn', Number(e.target.value))}
                      className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                    />
                  </div>
                  <p className="text-[11px] text-text-secondary">
                    Advocates must accumulate at least this balance before requesting automated bank cash-out.
                  </p>
                </div>
              </div>

              {/* Commission Live Matrix Preview */}
              <div className="pt-2">
                <span className="text-[11px] font-bold text-text-secondary uppercase block mb-2">
                  Live Commission Yield Per Subscription Tier ({formData.commission_percentage}%)
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                  {[
                    { tier: 'Basic', fee: PLAN_PRICES.Basic },
                    { tier: 'Standard', fee: PLAN_PRICES.Standard },
                    { tier: 'Premium', fee: PLAN_PRICES.Premium },
                    { tier: 'Enterprise', fee: PLAN_PRICES.Enterprise },
                  ].map((p) => {
                    const commissionYield = Math.round(p.fee * (formData.commission_percentage / 100));
                    return (
                      <div key={p.tier} className="bg-bg/40 p-2.5 rounded-lg border border-border/60">
                        <span className="text-[10px] text-text-secondary font-semibold block">{p.tier} (₦{p.fee.toLocaleString()})</span>
                        <span className="font-mono font-bold text-emerald-400 text-xs mt-0.5 block">
                          +₦{commissionYield.toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Card: Payout Schedule & Notification Automation */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Bell className="w-4 h-4 text-purple-400" />
                <span>Payout Automation &amp; Notification Rules</span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                    Settlement Frequency &amp; Channel
                  </label>
                  <select
                    value={formData.payout_schedule}
                    onChange={(e) => setFormData(prev => ({ ...prev, payout_schedule: e.target.value as any }))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs font-semibold text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                  >
                    <option value="Instant NIBSS Settlement">Instant NIBSS Settlement (Real-time)</option>
                    <option value="Weekly Batch (Every Friday)">Weekly Batch (Every Friday 4:00 PM)</option>
                    <option value="Bi-Weekly">Bi-Weekly Settlement</option>
                    <option value="Monthly End">Monthly End Clearance</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end">
                  <label className="flex items-center gap-2.5 cursor-pointer bg-bg/50 p-2.5 rounded-lg border border-border/60">
                    <input
                      type="checkbox"
                      checked={formData.auto_sms_notification}
                      onChange={(e) => setFormData(prev => ({ ...prev, auto_sms_notification: e.target.checked }))}
                      className="rounded border-border text-purple-500 focus:ring-purple-400 w-4 h-4"
                    />
                    <span className="text-xs text-text-primary font-medium">
                      Automated SMS &amp; WhatsApp notice on payout issuance
                    </span>
                  </label>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Program Terms & Client Headline Editor */}
          <div className="space-y-4">
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-accent" />
                <span>Client Menu Marketing Copy</span>
              </h3>
              <p className="text-xs text-text-secondary">
                This exact text and badge copy appears at the top of client-facing referral pages across all pharmacy stores.
              </p>

              <div className="space-y-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                    Client Banner Headline
                  </label>
                  <input
                    type="text"
                    value={formData.terms_headline}
                    onChange={(e) => setFormData(prev => ({ ...prev, terms_headline: e.target.value }))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs font-bold text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-text-secondary mb-1">
                    Client Banner Subtitle
                  </label>
                  <textarea
                    rows={3}
                    value={formData.terms_subtitle}
                    onChange={(e) => setFormData(prev => ({ ...prev, terms_subtitle: e.target.value }))}
                    className="w-full bg-bg border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400 leading-relaxed"
                  />
                </div>

                <div className="pt-2 border-t border-border/60">
                  <label className="flex items-center justify-between cursor-pointer">
                    <span className="text-xs font-semibold text-text-primary">
                      Referral Program Active on Client App
                    </span>
                    <input
                      type="checkbox"
                      checked={formData.client_referral_active}
                      onChange={(e) => setFormData(prev => ({ ...prev, client_referral_active: e.target.checked }))}
                      className="rounded border-border text-emerald-500 focus:ring-emerald-400 w-4 h-4"
                    />
                  </label>
                  <p className="text-[10px] text-text-secondary mt-0.5">
                    When toggled off, client menus will hide the &quot;Refer a Pharmacy&quot; section.
                  </p>
                </div>
              </div>
            </div>

            {/* Quick Summary Card */}
            <div className="bg-purple-950/20 border border-purple-500/30 rounded-xl p-5 space-y-3">
              <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-purple-400" />
                <span>Current Payout Summary</span>
              </span>

              <div className="space-y-2 text-xs font-mono">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Base Store Bounty:</span>
                  <span className="text-emerald-400 font-bold">₦{formData.base_store_payout_ngn.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Base Patient Bounty:</span>
                  <span className="text-accent font-bold">₦{formData.base_customer_payout_ngn.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Plan Commission:</span>
                  <span className="text-text-primary font-bold">{formData.commission_percentage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Min Withdrawal:</span>
                  <span className="text-text-primary font-bold">₦{formData.min_withdrawal_threshold_ngn.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-text-secondary">Settlement Mode:</span>
                  <span className="text-purple-300 font-bold">{formData.payout_schedule.split(' ')[0]}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-purple-500/30">
                <button
                  type="button"
                  onClick={() => setActiveSubSection('client_preview')}
                  className="w-full bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Preview What Clients See</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-SECTION 2: TIER MULTIPLIERS & MILESTONES */}
      {activeSubSection === 'tiers' && (
        <div className="space-y-5">
          <div className="bg-card border border-border rounded-xl p-5 space-y-2">
            <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Award className="w-4 h-4 text-purple-400" />
              <span>Advocate Tier Milestone Progression</span>
            </h3>
            <p className="text-xs text-text-secondary leading-relaxed">
              Super admins can configure the escalated bonus payout paid to advocates as their cumulative verified store referrals grow.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Bronze Tier */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/30 font-mono">
                  Bronze (1–4 Stores)
                </span>
                <span className="text-[10px] text-text-secondary">Level 1</span>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">
                  Payout Per Store (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono">₦</span>
                  <input
                    type="number"
                    step="1000"
                    min="1000"
                    value={formData.tier_payouts.bronze_ngn}
                    onChange={(e) => handleTierChange('bronze_ngn', Number(e.target.value))}
                    className="w-full bg-bg border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Standard starting rate for all new pharmacy owners and customers.
              </p>
            </div>

            {/* Silver Tier */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 font-mono">
                  Silver (5–9 Stores)
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">+50% Bonus</span>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">
                  Payout Per Store (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono">₦</span>
                  <input
                    type="number"
                    step="1000"
                    min="1000"
                    value={formData.tier_payouts.silver_ngn}
                    onChange={(e) => handleTierChange('silver_ngn', Number(e.target.value))}
                    className="w-full bg-bg border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-emerald-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Unlocks after 5 converted pharmacies with wholesale supply voucher perks.
              </p>
            </div>

            {/* Gold Tier */}
            <div className="bg-card border border-border rounded-xl p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
                  Gold (10–19 Stores)
                </span>
                <span className="text-[10px] text-emerald-400 font-bold">+150% Bonus</span>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">
                  Payout Per Store (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono">₦</span>
                  <input
                    type="number"
                    step="1000"
                    min="1000"
                    value={formData.tier_payouts.gold_ngn}
                    onChange={(e) => handleTierChange('gold_ngn', Number(e.target.value))}
                    className="w-full bg-bg border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-amber-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Includes free 2D wireless barcode scanner entitlement shipment.
              </p>
            </div>

            {/* Platinum Tier */}
            <div className="bg-card border border-purple-500/40 rounded-xl p-4 space-y-3 relative overflow-hidden">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold px-2 py-0.5 rounded bg-purple-500/25 text-purple-300 border border-purple-500/50 font-mono">
                  Platinum (20+ Stores)
                </span>
                <span className="text-[10px] text-purple-300 font-bold">Top Ambassador</span>
              </div>
              <div>
                <label className="text-[11px] font-semibold text-text-secondary block mb-1">
                  Payout Per Store (₦)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-secondary font-mono">₦</span>
                  <input
                    type="number"
                    step="5000"
                    min="5000"
                    value={formData.tier_payouts.platinum_ngn}
                    onChange={(e) => handleTierChange('platinum_ngn', Number(e.target.value))}
                    className="w-full bg-bg border border-border rounded-lg pl-8 pr-3 py-2 text-sm font-mono font-bold text-purple-300 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
              </div>
              <p className="text-[11px] text-text-secondary leading-relaxed">
                Eligible for quarterly ₦50,000 super advocate cash milestone bonuses.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUB-SECTION 3: ENTITLEMENT PACKAGES CATALOG MANAGER */}
      {activeSubSection === 'presets' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
                <Package className="w-4 h-4 text-purple-400" />
                <span>Configure Entitlement Packages &amp; Vouchers</span>
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Review or alter the standard reward options available when administrators disburse incentives or clients redeem rewards.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddPreset(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto transition-colors"
            >
              <span>+ Add Entitlement Package</span>
            </button>
          </div>

          {/* Add Preset Modal / Inline Form */}
          {showAddPreset && (
            <form onSubmit={handleAddPreset} className="bg-bg/80 border border-purple-500/40 rounded-xl p-4 space-y-3 animate-in zoom-in-95">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <span className="text-xs font-bold text-purple-300">Create New Entitlement Package</span>
                <button
                  type="button"
                  onClick={() => setShowAddPreset(false)}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">Package Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. ₦30,000 Wholesaler Drug Credit"
                    value={newPresetForm.title}
                    onChange={(e) => setNewPresetForm(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">Category</label>
                  <select
                    value={newPresetForm.category}
                    onChange={(e) => setNewPresetForm(prev => ({ ...prev, category: e.target.value as any }))}
                    className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                  >
                    <option value="cash_transfer">Cash Transfer (NIBSS)</option>
                    <option value="subscription_credit">Subscription Credit</option>
                    <option value="drug_voucher">Drug Wholesaler Voucher</option>
                    <option value="hardware_perk">Hardware Device Perk</option>
                    <option value="sms_bundle">SMS Broadcast Bundle</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">Value in Naira (₦)</label>
                  <input
                    type="number"
                    min="1000"
                    step="1000"
                    required
                    value={newPresetForm.value_ngn}
                    onChange={(e) => setNewPresetForm(prev => ({ ...prev, value_ngn: Number(e.target.value) }))}
                    className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">Description</label>
                  <input
                    type="text"
                    placeholder="Brief description of what the referee/advocate receives..."
                    value={newPresetForm.description}
                    onChange={(e) => setNewPresetForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-text-secondary mb-1">Tier Eligibility</label>
                  <input
                    type="text"
                    placeholder="e.g. All Tiers (Bronze+) or Gold & Platinum"
                    value={newPresetForm.tier_eligibility}
                    onChange={(e) => setNewPresetForm(prev => ({ ...prev, tier_eligibility: e.target.value }))}
                    className="w-full bg-card border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-purple-400"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-purple-500"
                >
                  Save Package to Catalog
                </button>
              </div>
            </form>
          )}

          {/* Presets List */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {localPresets.map((preset) => (
              <div 
                key={preset.id}
                className="bg-card border border-border rounded-xl p-4 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-text-primary text-xs sm:text-sm">{preset.title}</span>
                    <span className="text-[10px] text-text-secondary uppercase px-1.5 py-0.5 rounded bg-white/5 font-mono">
                      {preset.category.replace('_', ' ')}
                    </span>
                  </div>

                  <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                    {preset.description}
                  </p>

                  <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-text-secondary block">Naira Value (₦)</span>
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-text-secondary font-mono">₦</span>
                        <input
                          type="number"
                          step="1000"
                          min="0"
                          value={preset.value_ngn}
                          onChange={(e) => handlePresetValueChange(preset.id, Number(e.target.value))}
                          className="w-28 bg-bg border border-border rounded px-2 py-0.5 text-xs font-mono font-bold text-emerald-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
                        />
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-text-secondary block">Eligibility</span>
                      <span className="text-[11px] font-semibold text-text-primary">{preset.tier_eligibility}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between border-t border-border/40">
                  <span className="text-[10px] text-emerald-400 font-semibold flex items-center gap-1">
                    <CheckSquare className="w-3 h-3" />
                    Available on Client Menu
                  </span>
                  <button
                    type="button"
                    onClick={() => handleDeletePreset(preset.id)}
                    className="text-[10px] text-red-400 hover:underline"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-SECTION 4: LIVE CLIENT MENU PREVIEW ("WHAT CLIENT SEES") */}
      {activeSubSection === 'client_preview' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between">
            <div>
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                <Eye className="w-4 h-4" />
                <span>Client-Facing Referral Interface Live Preview</span>
              </span>
              <p className="text-xs text-text-secondary mt-0.5">
                This shows the exact live screen that pharmacy owners and customers see when they open their &quot;Referrals &amp; Earn&quot; menu on the web or mobile POS.
              </p>
            </div>
            <span className="text-[11px] font-mono font-bold px-2 py-1 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              Synchronized Real-Time
            </span>
          </div>

          {/* Mock Client Screen Frame */}
          <div className="bg-bg border-2 border-border/80 rounded-2xl p-4 sm:p-6 space-y-6 max-w-4xl mx-auto shadow-2xl">
            {/* Client Top Header */}
            <div className="bg-gradient-to-r from-accent/20 via-purple-500/15 to-transparent border border-accent/30 rounded-2xl p-6 text-left relative overflow-hidden">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/20 text-accent border border-accent/40 font-mono uppercase">
                  PharmacyFlow Advocate Program
                </span>
                <span className="text-[10px] font-mono text-emerald-400 font-bold">
                  {formData.payout_schedule}
                </span>
              </div>

              <h3 className="text-xl sm:text-2xl font-extrabold text-text-primary tracking-tight">
                {formData.terms_headline}
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary mt-1.5 max-w-2xl leading-relaxed">
                {formData.terms_subtitle}
              </p>

              <div className="mt-4 pt-4 border-t border-white/10 flex flex-wrap items-center gap-4 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-text-secondary block">Single Store Bounty</span>
                  <span className="text-emerald-400 font-bold text-sm">₦{formData.base_store_payout_ngn.toLocaleString()}</span>
                </div>
                <div className="border-l border-white/10 pl-4">
                  <span className="text-[10px] text-text-secondary block">Annual License Share</span>
                  <span className="text-purple-300 font-bold text-sm">{formData.commission_percentage}% Gross</span>
                </div>
                <div className="border-l border-white/10 pl-4">
                  <span className="text-[10px] text-text-secondary block">Min Cashout</span>
                  <span className="text-text-primary font-bold text-sm">₦{formData.min_withdrawal_threshold_ngn.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {/* Client Interactive Calculator */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
                <div>
                  <h4 className="text-sm font-bold text-text-primary">
                    Client Referral Earnings Calculator
                  </h4>
                  <p className="text-[11px] text-text-secondary">
                    Clients drag the slider to estimate their instant earnings based on your published rates.
                  </p>
                </div>
                <span className="text-xs font-bold text-accent font-mono">
                  {previewStoresCount} Pharmacy Stores
                </span>
              </div>

              <div className="space-y-3">
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={previewStoresCount}
                  onChange={(e) => setPreviewStoresCount(Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />

                <div className="flex items-center justify-between text-[11px] text-text-secondary font-mono">
                  <span>1 Store</span>
                  <span>10 Stores (Gold)</span>
                  <span>20+ Stores (Platinum)</span>
                </div>
              </div>

              {/* Calculated Results */}
              <div className="bg-bg/80 border border-border/80 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                <div>
                  <span className="text-[10px] text-text-secondary uppercase font-semibold block">Advocate Tier Unlocked</span>
                  <span className="text-sm font-bold text-amber-400 block mt-0.5">{calculatedClientEarnings.tierName} Tier</span>
                  <span className="text-[10px] text-text-secondary">₦{calculatedClientEarnings.tierPayout.toLocaleString()} per store</span>
                </div>

                <div>
                  <span className="text-[10px] text-text-secondary uppercase font-semibold block">Instant Cash Bounty</span>
                  <span className="text-sm font-mono font-bold text-emerald-400 block mt-0.5">
                    ₦{calculatedClientEarnings.baseDirectEarnings.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-text-secondary">Direct bank deposit</span>
                </div>

                <div>
                  <span className="text-[10px] text-text-secondary uppercase font-semibold block">Total Estimated Earnings</span>
                  <span className="text-base font-mono font-extrabold text-purple-400 block mt-0.5">
                    ₦{calculatedClientEarnings.totalPotentialEarnings.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-text-secondary">Bounty + {formData.commission_percentage}% Plan Share</span>
                </div>
              </div>
            </div>

            {/* Client Tier Roadmap Preview */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Published Advocate Progression Road (Visible to Pharmacists)
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs text-center">
                <div className="bg-bg/40 p-3 rounded-lg border border-border/60">
                  <span className="text-[10px] text-amber-400 font-bold uppercase block">Bronze</span>
                  <span className="text-[10px] text-text-secondary">1–4 Stores</span>
                  <span className="font-mono font-bold text-text-primary text-xs mt-1 block">
                    ₦{formData.tier_payouts.bronze_ngn.toLocaleString()}
                  </span>
                </div>
                <div className="bg-bg/40 p-3 rounded-lg border border-border/60">
                  <span className="text-[10px] text-blue-400 font-bold uppercase block">Silver</span>
                  <span className="text-[10px] text-text-secondary">5–9 Stores</span>
                  <span className="font-mono font-bold text-emerald-400 text-xs mt-1 block">
                    ₦{formData.tier_payouts.silver_ngn.toLocaleString()}
                  </span>
                </div>
                <div className="bg-bg/40 p-3 rounded-lg border border-border/60">
                  <span className="text-[10px] text-amber-300 font-bold uppercase block">Gold</span>
                  <span className="text-[10px] text-text-secondary">10–19 Stores</span>
                  <span className="font-mono font-bold text-amber-300 text-xs mt-1 block">
                    ₦{formData.tier_payouts.gold_ngn.toLocaleString()}
                  </span>
                </div>
                <div className="bg-bg/40 p-3 rounded-lg border border-purple-500/40">
                  <span className="text-[10px] text-purple-300 font-bold uppercase block">Platinum</span>
                  <span className="text-[10px] text-text-secondary">20+ Stores</span>
                  <span className="font-mono font-bold text-purple-300 text-xs mt-1 block">
                    ₦{formData.tier_payouts.platinum_ngn.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
