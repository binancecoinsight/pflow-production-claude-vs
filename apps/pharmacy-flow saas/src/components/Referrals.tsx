import React, { useState, useEffect } from 'react';
import { 
  Gift, Users, DollarSign, Award, Share2, Copy, Check, ExternalLink, 
  Send, QrCode, ArrowRight, ShieldCheck, Sparkles, Building2, Phone, 
  Mail, Clock, CheckCircle2, ChevronRight, RefreshCw, AlertCircle, 
  Wallet, CreditCard, ChevronDown, Filter, Search, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';
import { ReferralSummary, Referral, ReferralPayout } from '../types';

export default function Referrals() {
  const { showNotification } = useNotification();
  const { settings } = useSettings();
  const currency = settings.currencySymbol || '₦';

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ReferralSummary | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modals
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isRedeemModalOpen, setIsRedeemModalOpen] = useState(false);
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Invite Form
  const [inviteForm, setInviteForm] = useState({
    referredPharmacyName: '',
    contactPerson: '',
    phone: '',
    email: '',
    plan: 'Professional',
    notes: ''
  });
  const [isSubmittingInvite, setIsSubmittingInvite] = useState(false);

  // Redeem Form
  const [redeemForm, setRedeemForm] = useState({
    amount: '',
    type: 'subscription_credit' as 'subscription_credit' | 'bank_transfer',
    bankName: '',
    accountNumber: '',
    accountName: '',
    notes: ''
  });
  const [isSubmittingRedeem, setIsSubmittingRedeem] = useState(false);

  // Calculator State
  const [calcReferrals, setCalcReferrals] = useState(5);

  const fetchReferralData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/referrals');
      if (res.ok) {
        const json = await res.json();
        setData(json);
        if (json.walletBalance && !redeemForm.amount) {
          setRedeemForm(prev => ({ ...prev, amount: String(json.walletBalance) }));
        }
      }
    } catch (err) {
      console.error('Failed to load referral data', err);
      showNotification('error', 'Failed to load referral program data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReferralData();
  }, []);

  const handleCopyCode = () => {
    if (!data?.referralCode) return;
    navigator.clipboard.writeText(data.referralCode);
    setCopiedCode(true);
    showNotification('success', 'Referral code copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyLink = () => {
    if (!data?.referralLink) return;
    navigator.clipboard.writeText(data.referralLink);
    setCopiedLink(true);
    showNotification('success', 'Referral invite link copied to clipboard!');
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleShareWhatsApp = () => {
    if (!data) return;
    const text = encodeURIComponent(
      `Hello colleague! I'm using Pharmacy Flow to manage our pharmacy dispensing, inventory, barcode scanning, and multi-user accounts. Sign up with my code ${data.referralCode} to get ${data.refereeDiscount} on your subscription:\n\n${data.referralLink}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleShareEmail = () => {
    if (!data) return;
    const subject = encodeURIComponent(`Invitation to modernise your pharmacy with Pharmacy Flow`);
    const body = encodeURIComponent(
      `Hello,\n\nI recommend Pharmacy Flow for managing pharmacy sales, inventory expiry dates, supplier market orders, and staff roles.\n\nUse our referral link to claim your ${data.refereeDiscount} welcome discount:\n${data.referralLink}\n\nReferral Code: ${data.referralCode}\n\nBest regards,\n${settings.storeName || 'Pharmacy Partner'}`
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteForm.referredPharmacyName.trim()) {
      showNotification('error', 'Please enter the referred pharmacy name');
      return;
    }

    try {
      setIsSubmittingInvite(true);
      const res = await apiFetch('/api/referrals/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inviteForm)
      });

      if (res.ok) {
        showNotification('success', 'Pharmacy invitation sent successfully!');
        setIsInviteModalOpen(false);
        setInviteForm({
          referredPharmacyName: '',
          contactPerson: '',
          phone: '',
          email: '',
          plan: 'Professional',
          notes: ''
        });
        fetchReferralData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to send invitation');
      }
    } catch (err) {
      showNotification('error', 'Error creating referral invitation');
    } finally {
      setIsSubmittingInvite(false);
    }
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    const amount = Number(redeemForm.amount);
    if (!amount || amount <= 0) {
      showNotification('error', 'Please enter a valid amount');
      return;
    }
    if (data && amount > data.walletBalance) {
      showNotification('error', `Amount exceeds available balance of ${currency}${data.walletBalance.toLocaleString()}`);
      return;
    }
    if (redeemForm.type === 'bank_transfer' && (!redeemForm.bankName || !redeemForm.accountNumber)) {
      showNotification('error', 'Please fill in bank name and account number');
      return;
    }

    try {
      setIsSubmittingRedeem(true);
      const res = await apiFetch('/api/referrals/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(redeemForm)
      });

      if (res.ok) {
        const resData = await res.json();
        showNotification(
          'success',
          redeemForm.type === 'subscription_credit'
            ? `Successfully credited ${currency}${amount.toLocaleString()} toward your next subscription bill!`
            : `Payout request submitted (${resData.reference || 'Success'}). Funds will be wired within 24h.`
        );
        setIsRedeemModalOpen(false);
        fetchReferralData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Redemption failed');
      }
    } catch (err) {
      showNotification('error', 'Error processing redemption');
    } finally {
      setIsSubmittingRedeem(false);
    }
  };

  const handleSimulateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await apiFetch('/api/referrals/simulate-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus })
      });
      if (res.ok) {
        showNotification('success', `Referral status updated to ${newStatus}! Incentive reward recalculated.`);
        fetchReferralData();
      }
    } catch (err) {
      showNotification('error', 'Failed to update status');
    }
  };

  // Filtered referrals list
  const filteredReferrals = (data?.referrals || []).filter(ref => {
    const matchesFilter = filterStatus === 'all' ? true : ref.status === filterStatus;
    const matchesSearch = 
      ref.referredPharmacyName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (ref.contactPerson && ref.contactPerson.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (ref.phone && ref.phone.includes(searchQuery)) ||
      (ref.email && ref.email.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesFilter && matchesSearch;
  });

  // Calculator math
  const estimatedCash = calcReferrals * 25000;
  const estimatedFreeMonths = Math.floor(calcReferrals / 3);

  if (loading && !data) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="animate-spin text-brand-accent" size={32} />
        <p className="text-sm font-medium text-brand-muted">Loading referral network data...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      {/* Top Banner / Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white p-6 md:p-10 shadow-2xl border border-indigo-800/40">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-16 w-80 h-80 bg-pink-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-pink-300 text-xs font-semibold uppercase tracking-wider border border-white/10">
              <Gift size={14} className="text-pink-400" />
              <span>Pharmacy Partner & Referral Program</span>
            </div>
            <h1 className="text-2xl md:text-4xl font-display font-extrabold tracking-tight">
              Refer Pharmacies, <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-amber-300">Earn Cash & Free Months</span>
            </h1>
            <p className="text-sm md:text-base text-slate-300 leading-relaxed">
              Introduce colleague pharmacists, clinics, or dispensary branches to Pharmacy Flow. 
              They receive <span className="text-white font-semibold">{data?.refereeDiscount || '15% OFF'}</span> on their subscription, and you receive up to <span className="text-white font-semibold">₦40,000</span> cash incentive or subscription credits per pharmacy!
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setIsInviteModalOpen(true)}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white font-bold text-sm shadow-lg shadow-pink-500/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Send size={16} />
              <span>Invite a Pharmacy</span>
            </button>
            <button
              onClick={() => setIsRedeemModalOpen(true)}
              disabled={!data || data.walletBalance <= 0}
              className="flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/20 text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Wallet size={16} className="text-amber-300" />
              <span>Redeem Rewards</span>
            </button>
          </div>
        </div>
      </div>

      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Available Wallet Balance */}
        <div className="card bg-gradient-to-br from-emerald-500/10 via-brand-surface to-brand-surface border-emerald-500/30 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Available Wallet</span>
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-600 flex items-center justify-center">
              <Wallet size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-bold font-display text-brand-text">
              {currency}{(data?.walletBalance || 0).toLocaleString()}
            </div>
            <p className="text-xs text-emerald-600 font-medium mt-1 flex items-center gap-1">
              <CheckCircle2 size={12} /> Ready for withdrawal or subscription credit
            </p>
          </div>
        </div>

        {/* Total Earned to Date */}
        <div className="card relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Total Earned</span>
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 flex items-center justify-center">
              <DollarSign size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-bold font-display text-brand-text">
              {currency}{(data?.totalEarned || 0).toLocaleString()}
            </div>
            <p className="text-xs text-brand-muted mt-1">
              Lifetime incentives & partner commissions
            </p>
          </div>
        </div>

        {/* Subscribed Pharmacies */}
        <div className="card relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Active Referees</span>
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center">
              <Building2 size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-bold font-display text-brand-text">
              {data?.successfulCount || 0} <span className="text-sm font-normal text-brand-muted">/ {data?.totalInvited || 0}</span>
            </div>
            <p className="text-xs text-brand-muted mt-1">
              {data?.pendingRewards ? `${currency}${data.pendingRewards.toLocaleString()} pending in trial` : 'Pharmacies currently subscribed'}
            </p>
          </div>
        </div>

        {/* Current Partner Tier */}
        <div className="card bg-gradient-to-br from-amber-500/10 via-brand-surface to-brand-surface border-amber-500/30 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Partner Status</span>
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-600 flex items-center justify-center">
              <Award size={20} />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl md:text-2xl font-bold font-display text-amber-600">
              {data?.currentTier || 'Bronze'} Partner
            </div>
            <div className="mt-2 w-full bg-brand-bg rounded-full h-2 overflow-hidden border border-brand-border">
              <div 
                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                style={{ 
                  width: `${Math.min(100, ((data?.successfulCount || 0) / (data?.nextTierThreshold || 4)) * 100)}%` 
                }}
              />
            </div>
            <p className="text-[11px] text-brand-muted mt-1.5 flex items-center justify-between">
              <span>{data?.successfulCount || 0} referrals</span>
              <span>Next tier: {data?.nextTier} ({data?.nextTierThreshold})</span>
            </p>
          </div>
        </div>
      </div>

      {/* Referral Link & Share Assets Hub */}
      <div className="card space-y-6">
        <div>
          <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
            <Share2 size={18} className="text-pink-500" />
            <span>Your Personal Referral Assets</span>
          </h2>
          <p className="text-xs text-brand-muted mt-0.5">
            Share your unique code or direct link with pharmacies, hospitals, and medical stores.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Unique Referral Code */}
          <div className="p-4 rounded-2xl bg-brand-bg border border-brand-border space-y-2">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Your Referral Code</span>
            <div className="flex items-center justify-between gap-2 bg-brand-surface p-3 rounded-xl border border-brand-border">
              <span className="font-mono text-lg font-bold tracking-wider text-brand-text">
                {data?.referralCode || 'PF-PHARM'}
              </span>
              <button
                onClick={handleCopyCode}
                className="btn-secondary py-2 px-3 flex items-center gap-1.5 text-xs font-semibold"
              >
                {copiedCode ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          {/* Direct Share Link */}
          <div className="p-4 rounded-2xl bg-brand-bg border border-brand-border space-y-2">
            <span className="text-xs font-semibold text-brand-muted uppercase tracking-wider">Direct Invite Link</span>
            <div className="flex items-center justify-between gap-2 bg-brand-surface p-3 rounded-xl border border-brand-border overflow-hidden">
              <span className="font-mono text-xs text-brand-muted truncate max-w-[200px] sm:max-w-xs">
                {data?.referralLink || 'https://pharmacyflow.app/join?ref=...'}
              </span>
              <button
                onClick={handleCopyLink}
                className="btn-secondary py-2 px-3 flex items-center gap-1.5 text-xs font-semibold shrink-0"
              >
                {copiedLink ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copiedLink ? 'Copied!' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick Instant Share Channels */}
        <div className="pt-2 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-brand-muted mr-1">Instant Share:</span>
          
          <button
            onClick={handleShareWhatsApp}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all hover:scale-105"
          >
            <span>WhatsApp</span>
          </button>

          <button
            onClick={handleShareEmail}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm transition-all hover:scale-105"
          >
            <Mail size={14} />
            <span>Email Invite</span>
          </button>

          <button
            onClick={() => setIsQrModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-brand-bg hover:bg-brand-border text-brand-text text-xs font-semibold border border-brand-border transition-all"
          >
            <QrCode size={14} />
            <span>Show QR Code</span>
          </button>

          <button
            onClick={() => setIsInviteModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-pink-500 hover:bg-pink-600 text-white text-xs font-semibold shadow-sm transition-all ml-auto"
          >
            <Send size={14} />
            <span>Direct Invitation Form</span>
          </button>
        </div>
      </div>

      {/* Incentive Tier Structure & Rewards Breakdown */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
            <Award size={20} className="text-amber-500" />
            <span>Incentive Tiers & Reward Milestones</span>
          </h2>
          <p className="text-xs text-brand-muted mt-0.5">
            The more pharmacies you bring into the network, the higher your recurring bonus and benefits.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Bronze Tier */}
          <div className={`card relative border-2 ${data?.currentTier === 'Bronze' ? 'border-amber-500 bg-amber-500/5' : 'border-brand-border'}`}>
            {data?.currentTier === 'Bronze' && (
              <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold uppercase tracking-wider">
                Current Level
              </span>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-700/10 text-amber-700 flex items-center justify-center font-bold">
                B
              </div>
              <div>
                <h3 className="font-bold text-brand-text">Bronze Partner</h3>
                <p className="text-xs text-brand-muted">1 – 3 Subscribed Pharmacies</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5 text-xs text-brand-text">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span><strong>₦15,000 – ₦25,000</strong> per subscribed pharmacy</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Referee gets <strong>10% OFF</strong> their 1st month</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Redeem as subscription credits or cash payout</span>
              </li>
            </ul>
          </div>

          {/* Silver Tier */}
          <div className={`card relative border-2 ${data?.currentTier === 'Silver' ? 'border-indigo-500 bg-indigo-500/5' : 'border-brand-border'}`}>
            {data?.currentTier === 'Silver' && (
              <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider">
                Current Level
              </span>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-600 flex items-center justify-center font-bold">
                S
              </div>
              <div>
                <h3 className="font-bold text-brand-text">Silver Partner</h3>
                <p className="text-xs text-brand-muted">4 – 9 Subscribed Pharmacies</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5 text-xs text-brand-text">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span><strong>₦25,000 – ₦35,000</strong> per subscribed pharmacy</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Referee gets <strong>15% OFF</strong> their subscription</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span><strong>1 Free Month</strong> on your Professional Plan</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Priority WhatsApp Partner Desk</span>
              </li>
            </ul>
          </div>

          {/* Gold VIP Tier */}
          <div className={`card relative border-2 ${data?.currentTier === 'Gold' ? 'border-amber-400 bg-amber-400/5' : 'border-brand-border'}`}>
            {data?.currentTier === 'Gold' && (
              <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[10px] font-bold uppercase tracking-wider">
                Current Level
              </span>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-400/20 text-amber-500 flex items-center justify-center font-bold">
                G
              </div>
              <div>
                <h3 className="font-bold text-brand-text">Gold VIP Ambassador</h3>
                <p className="text-xs text-brand-muted">10+ Subscribed Pharmacies</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2.5 text-xs text-brand-text">
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span><strong>₦40,000</strong> per pharmacy + 25% recurring split</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>Referee gets <strong>20% OFF</strong> welcome bonus</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span><strong>3 Free Months</strong> or Annual 50% discount</span>
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                <span>VIP 24/7 dedicated support & custom features</span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Interactive Incentive Earnings Calculator */}
      <div className="card bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 md:p-8 rounded-3xl">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-md">
            <span className="text-xs font-bold text-pink-400 uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={14} /> Incentive Projection Calculator
            </span>
            <h3 className="text-xl md:text-2xl font-bold font-display">
              See what you could earn with Pharmacy Flow
            </h3>
            <p className="text-xs text-slate-300">
              Adjust the slider to simulate how much reward credit or bank cash you can generate by referring colleagues.
            </p>
          </div>

          <div className="w-full md:w-80 space-y-4">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span className="text-slate-300">Pharmacies Referred:</span>
              <span className="text-xl font-bold text-pink-400">{calcReferrals}</span>
            </div>
            <input 
              type="range" 
              min="1" 
              max="20" 
              value={calcReferrals}
              onChange={(e) => setCalcReferrals(Number(e.target.value))}
              className="w-full accent-pink-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
                <span className="text-[11px] text-slate-400 block uppercase">Cash / Credit</span>
                <span className="text-lg font-bold text-white font-mono">{currency}{estimatedCash.toLocaleString()}</span>
              </div>
              <div className="p-3 rounded-xl bg-white/10 backdrop-blur-sm border border-white/10 text-center">
                <span className="text-[11px] text-slate-400 block uppercase">Free Sub Months</span>
                <span className="text-lg font-bold text-amber-300 font-mono">+{estimatedFreeMonths} mo</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Referrals Activity & Management Table */}
      <div className="card space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
              <Users size={18} className="text-indigo-600" />
              <span>Referred Pharmacies & Leads</span>
            </h2>
            <p className="text-xs text-brand-muted mt-0.5">
              Track registration status, subscribed plans, and reward disbursement.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-muted" />
              <input
                type="text"
                placeholder="Search pharmacy..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent w-44"
              />
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 bg-brand-bg p-1 rounded-xl border border-brand-border text-xs">
              {(['all', 'subscribed', 'signed_up', 'invited'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setFilterStatus(tab)}
                  className={`px-3 py-1 rounded-lg capitalize font-medium transition-all ${
                    filterStatus === tab 
                      ? 'bg-brand-surface text-brand-text shadow-sm font-semibold' 
                      : 'text-brand-muted hover:text-brand-text'
                  }`}
                >
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-brand-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-brand-bg text-brand-muted uppercase text-[10px] tracking-wider border-b border-brand-border">
              <tr>
                <th className="p-3.5 font-semibold">Pharmacy / Referee</th>
                <th className="p-3.5 font-semibold">Contact Info</th>
                <th className="p-3.5 font-semibold">Plan</th>
                <th className="p-3.5 font-semibold">Status</th>
                <th className="p-3.5 font-semibold">Reward Incentive</th>
                <th className="p-3.5 font-semibold">Reward State</th>
                <th className="p-3.5 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {filteredReferrals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-brand-muted">
                    <p className="text-sm">No referrals found matching your query.</p>
                    <p className="text-xs mt-1 text-brand-muted">Share your invite link or click "Invite a Pharmacy" above!</p>
                  </td>
                </tr>
              ) : (
                filteredReferrals.map((ref) => {
                  const isSubscribed = ref.status === 'subscribed';
                  const isSignedUp = ref.status === 'signed_up';

                  return (
                    <tr key={ref.id} className="hover:bg-brand-bg/50 transition-colors">
                      <td className="p-3.5">
                        <div className="font-semibold text-brand-text">{ref.referredPharmacyName}</div>
                        <div className="text-[11px] text-brand-muted">
                          {ref.contactPerson || 'Pharmacist in Charge'}
                        </div>
                      </td>
                      <td className="p-3.5 text-brand-muted">
                        <div>{ref.phone || 'No phone'}</div>
                        <div className="text-[11px]">{ref.email || '—'}</div>
                      </td>
                      <td className="p-3.5">
                        <span className="px-2 py-0.5 rounded-md bg-brand-bg font-medium text-brand-text border border-brand-border text-[11px]">
                          {ref.plan} Plan
                        </span>
                      </td>
                      <td className="p-3.5">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          isSubscribed 
                            ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                            : isSignedUp 
                            ? 'bg-blue-500/10 text-blue-600 border border-blue-500/20'
                            : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
                        }`}>
                          {isSubscribed ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                          <span className="capitalize">{ref.status.replace('_', ' ')}</span>
                        </span>
                      </td>
                      <td className="p-3.5 font-bold font-mono text-brand-text">
                        {currency}{(ref.rewardAmount || 0).toLocaleString()}
                      </td>
                      <td className="p-3.5">
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          ref.rewardStatus === 'available'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                            : ref.rewardStatus === 'redeemed'
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {ref.rewardStatus}
                        </span>
                      </td>
                      <td className="p-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isSubscribed ? (
                            <button
                              onClick={() => handleSimulateStatus(ref.id, 'subscribed')}
                              title="Simulate subscription to unlock reward immediately"
                              className="px-2 py-1 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 font-semibold text-[11px] transition-all"
                            >
                              Simulate Subscribed
                            </button>
                          ) : (
                            <span className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
                              <CheckCircle2 size={12} /> Rewarded
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payout & Redemption History */}
      {data?.payouts && data.payouts.length > 0 && (
        <div className="card space-y-4">
          <h2 className="text-base font-bold text-brand-text flex items-center gap-2">
            <CreditCard size={18} className="text-purple-600" />
            <span>Reward Redemptions & Payout History</span>
          </h2>
          <div className="overflow-x-auto rounded-xl border border-brand-border">
            <table className="w-full text-left text-xs">
              <thead className="bg-brand-bg text-brand-muted uppercase text-[10px] tracking-wider border-b border-brand-border">
                <tr>
                  <th className="p-3 font-semibold">Reference</th>
                  <th className="p-3 font-semibold">Date</th>
                  <th className="p-3 font-semibold">Method</th>
                  <th className="p-3 font-semibold">Amount</th>
                  <th className="p-3 font-semibold">Destination</th>
                  <th className="p-3 font-semibold text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {data.payouts.map((payout) => (
                  <tr key={payout.id}>
                    <td className="p-3 font-mono font-semibold text-brand-text">{payout.reference}</td>
                    <td className="p-3 text-brand-muted">{new Date(payout.createdAt).toLocaleDateString()}</td>
                    <td className="p-3 capitalize">
                      {payout.type === 'subscription_credit' ? 'Subscription Discount' : 'Bank Transfer'}
                    </td>
                    <td className="p-3 font-bold text-emerald-600 font-mono">
                      {currency}{Number(payout.amount).toLocaleString()}
                    </td>
                    <td className="p-3 text-brand-muted">
                      {payout.type === 'subscription_credit' 
                        ? 'Applied to Next Bill' 
                        : `${payout.bankName || 'Bank'} (${payout.accountNumber || '—'})`}
                    </td>
                    <td className="p-3 text-right">
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-[10px] uppercase">
                        {payout.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Invite Modal */}
      <AnimatePresence>
        {isInviteModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-brand-surface rounded-2xl border border-brand-border shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-5 border-b border-brand-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-pink-500/10 text-pink-500 flex items-center justify-center">
                    <Send size={16} />
                  </div>
                  <h3 className="font-bold text-base text-brand-text">Invite a Pharmacy Lead</h3>
                </div>
                <button 
                  onClick={() => setIsInviteModalOpen(false)}
                  className="p-1 rounded-lg text-brand-muted hover:bg-brand-bg hover:text-brand-text"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSendInvite} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-muted mb-1">
                    Pharmacy Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Royal Crown Chemists"
                    value={inviteForm.referredPharmacyName}
                    onChange={(e) => setInviteForm({ ...inviteForm, referredPharmacyName: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-muted mb-1">
                    Pharmacist / Owner Name
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Dr. Jane Okoro"
                    value={inviteForm.contactPerson}
                    onChange={(e) => setInviteForm({ ...inviteForm, contactPerson: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-brand-muted mb-1">Phone Number</label>
                    <input
                      type="tel"
                      placeholder="+234 800 000 0000"
                      value={inviteForm.phone}
                      onChange={(e) => setInviteForm({ ...inviteForm, phone: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-muted mb-1">Email Address</label>
                    <input
                      type="email"
                      placeholder="info@pharmacy.com"
                      value={inviteForm.email}
                      onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-muted mb-1">Recommended Plan</label>
                  <select
                    value={inviteForm.plan}
                    onChange={(e) => setInviteForm({ ...inviteForm, plan: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                  >
                    <option value="Starter">Starter Plan (₦14,500/mo - ₦15k reward)</option>
                    <option value="Professional">Professional Plan (₦28,000/mo - ₦25k reward)</option>
                    <option value="Enterprise">Enterprise Plan (₦65,000/mo - ₦40k reward)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-muted mb-1">Notes / Relationship</label>
                  <textarea
                    rows={2}
                    placeholder="e.g. Met at PSN state conference, interested in barcode and debt book."
                    value={inviteForm.notes}
                    onChange={(e) => setInviteForm({ ...inviteForm, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                  />
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="btn-secondary py-2 px-4 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingInvite}
                    className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
                  >
                    {isSubmittingInvite && <RefreshCw size={12} className="animate-spin" />}
                    <span>Record Invitation</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Redeem Rewards Modal */}
      <AnimatePresence>
        {isRedeemModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-brand-surface rounded-2xl border border-brand-border shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-5 border-b border-brand-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                    <Wallet size={16} />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-brand-text">Redeem Referral Rewards</h3>
                    <p className="text-[11px] text-brand-muted">
                      Available Balance: <strong>{currency}{(data?.walletBalance || 0).toLocaleString()}</strong>
                    </p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsRedeemModalOpen(false)}
                  className="p-1 rounded-lg text-brand-muted hover:bg-brand-bg hover:text-brand-text"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleRedeem} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-muted mb-1">
                    Redemption Method
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setRedeemForm({ ...redeemForm, type: 'subscription_credit' })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        redeemForm.type === 'subscription_credit'
                          ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/30'
                          : 'border-brand-border bg-brand-bg'
                      }`}
                    >
                      <CreditCard size={18} className="text-indigo-600 mb-1" />
                      <div className="font-bold text-xs text-brand-text">Subscription Credit</div>
                      <div className="text-[10px] text-brand-muted">Applies to next billing invoice</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setRedeemForm({ ...redeemForm, type: 'bank_transfer' })}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        redeemForm.type === 'bank_transfer'
                          ? 'border-emerald-600 bg-emerald-50/50 dark:bg-emerald-950/30'
                          : 'border-brand-border bg-brand-bg'
                      }`}
                    >
                      <Building2 size={18} className="text-emerald-600 mb-1" />
                      <div className="font-bold text-xs text-brand-text">Bank Transfer</div>
                      <div className="text-[10px] text-brand-muted">Direct cash wire to your account</div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-muted mb-1">
                    Amount ({currency}) *
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      required
                      min={1000}
                      max={data?.walletBalance || 0}
                      value={redeemForm.amount}
                      onChange={(e) => setRedeemForm({ ...redeemForm, amount: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-sm font-bold font-mono focus:outline-none focus:ring-1 focus:ring-brand-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setRedeemForm({ ...redeemForm, amount: String(data?.walletBalance || 0) })}
                      className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded bg-brand-surface border border-brand-border text-[10px] font-semibold text-brand-muted hover:text-brand-text"
                    >
                      Max
                    </button>
                  </div>
                </div>

                {redeemForm.type === 'bank_transfer' && (
                  <div className="space-y-3 p-3 rounded-xl bg-brand-bg border border-brand-border">
                    <div>
                      <label className="block text-[11px] font-semibold text-brand-muted mb-1">Bank Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Zenith Bank, GTBank, First Bank"
                        value={redeemForm.bankName}
                        onChange={(e) => setRedeemForm({ ...redeemForm, bankName: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-brand-border bg-brand-surface text-brand-text text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-brand-muted mb-1">Account Number *</label>
                      <input
                        type="text"
                        required
                        maxLength={10}
                        placeholder="10-digit account number"
                        value={redeemForm.accountNumber}
                        onChange={(e) => setRedeemForm({ ...redeemForm, accountNumber: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-brand-border bg-brand-surface text-brand-text text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-brand-muted mb-1">Account Name</label>
                      <input
                        type="text"
                        placeholder="Beneficiary name on account"
                        value={redeemForm.accountName}
                        onChange={(e) => setRedeemForm({ ...redeemForm, accountName: e.target.value })}
                        className="w-full px-3 py-1.5 rounded-lg border border-brand-border bg-brand-surface text-brand-text text-xs"
                      />
                    </div>
                  </div>
                )}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsRedeemModalOpen(false)}
                    className="btn-secondary py-2 px-4 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmittingRedeem}
                    className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
                  >
                    {isSubmittingRedeem && <RefreshCw size={12} className="animate-spin" />}
                    <span>Confirm Redemption</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* QR Code Modal */}
      <AnimatePresence>
        {isQrModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-brand-surface rounded-2xl border border-brand-border shadow-2xl max-w-sm w-full p-6 text-center space-y-4"
            >
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-base text-brand-text">Scan & Join Pharmacy Flow</h3>
                <button 
                  onClick={() => setIsQrModalOpen(false)}
                  className="p-1 rounded-lg text-brand-muted hover:bg-brand-bg"
                >
                  <X size={18} />
                </button>
              </div>

              {/* QR Code Graphic placeholder generated with SVG */}
              <div className="p-4 bg-white rounded-2xl inline-block shadow-inner mx-auto border border-slate-200">
                <svg viewBox="0 0 100 100" className="w-48 h-48 text-slate-900 fill-current">
                  <path d="M0 0h30v30H0zM10 10h10v10H10zM70 0h30v30H70zM80 10h10v10H80zM0 70h30v30H0zM10 80h10v10H10zM40 10h20v10H40zM10 40h10v20H10zM40 40h20v20H40zM70 40h10v10H70zM80 50h20v10H80zM50 70h20v10H50zM70 70h10v20H70zM90 80h10v20H90zM40 90h20v10H40z" />
                </svg>
              </div>

              <div>
                <span className="font-mono text-xs font-bold text-brand-text bg-brand-bg px-3 py-1.5 rounded-lg border border-brand-border">
                  {data?.referralCode || 'PF-PHARM'}
                </span>
                <p className="text-xs text-brand-muted mt-2">
                  Display this QR code at pharmacy union meetings or let fellow pharmacists scan directly from your screen.
                </p>
              </div>

              <button
                onClick={() => setIsQrModalOpen(false)}
                className="btn-secondary w-full py-2 text-xs font-semibold"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
