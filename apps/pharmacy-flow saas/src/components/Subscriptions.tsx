import React, { useState, useEffect } from 'react';
import { 
  CreditCard, ShieldCheck, CheckCircle2, AlertTriangle, ArrowUpRight, 
  RefreshCw, Check, Calendar, Users, Package, Store, Sparkles, Download, 
  Printer, X, Clock, HelpCircle, Gift, ChevronRight, Zap, Building2, 
  ExternalLink, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { apiFetch } from '../lib/api';
import { useNotification } from '../context/NotificationContext';
import { useSettings } from '../context/SettingsContext';
import { Subscription, SubscriptionInvoice, PlanFeature } from '../types';

export default function Subscriptions() {
  const { showNotification } = useNotification();
  const { settings } = useSettings();
  const currency = settings.currencySymbol || '₦';

  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [quotas, setQuotas] = useState<{
    products: { used: number; limit: number | string };
    branches: { used: number; limit: number | string };
    users: { used: number; limit: number | string };
  } | null>(null);
  const [plans, setPlans] = useState<PlanFeature[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [pharmacyName, setPharmacyName] = useState('');

  // Plan Selection & Cycle State
  const [selectedCycle, setSelectedCycle] = useState<'monthly' | 'yearly'>('monthly');

  // Modals
  const [isChangePlanModalOpen, setIsChangePlanModalOpen] = useState(false);
  const [targetPlan, setTargetPlan] = useState<PlanFeature | null>(null);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [viewInvoiceModal, setViewInvoiceModal] = useState<SubscriptionInvoice | null>(null);

  // Payment form state
  const [cardBrand, setCardBrand] = useState('Visa');
  const [cardLast4, setCardLast4] = useState('4242');
  const [paymentMethodType, setPaymentMethodType] = useState<'card' | 'bank_transfer'>('card');
  const [isUpdatingPayment, setIsUpdatingPayment] = useState(false);

  // Action states
  const [isUpdatingPlan, setIsUpdatingPlan] = useState(false);
  const [isRenewing, setIsRenewing] = useState(false);

  const fetchSubscriptionData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/subscriptions');
      if (res.ok) {
        const data = await res.json();
        setSubscription(data.subscription);
        setQuotas(data.quotas);
        setPlans(data.plans || []);
        setInvoices(data.invoices || []);
        setPharmacyName(data.pharmacyName || settings.storeName || 'Your Pharmacy');
        if (data.subscription?.billingCycle) {
          setSelectedCycle(data.subscription.billingCycle);
        }
      }
    } catch (err) {
      console.error('Failed to load subscription info', err);
      showNotification('error', 'Failed to fetch subscription details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubscriptionData();
  }, []);

  const handleToggleAutoRenew = async () => {
    if (!subscription) return;
    try {
      const nextVal = !subscription.autoRenew;
      const res = await apiFetch('/api/subscriptions/auto-renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoRenew: nextVal })
      });
      if (res.ok) {
        showNotification('success', nextVal ? 'Auto-renew enabled' : 'Auto-renew disabled');
        setSubscription({ ...subscription, autoRenew: nextVal });
      }
    } catch (err) {
      showNotification('error', 'Failed to update auto-renew setting');
    }
  };

  const handleOpenPlanConfirm = (plan: PlanFeature) => {
    setTargetPlan(plan);
    setIsChangePlanModalOpen(true);
  };

  const handleConfirmPlanChange = async () => {
    if (!targetPlan) return;
    try {
      setIsUpdatingPlan(true);
      const res = await apiFetch('/api/subscriptions/update-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: targetPlan.id,
          billingCycle: selectedCycle
        })
      });

      if (res.ok) {
        showNotification('success', `Successfully updated plan to ${targetPlan.name}!`);
        setIsChangePlanModalOpen(false);
        fetchSubscriptionData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to update plan');
      }
    } catch (err) {
      showNotification('error', 'Error updating subscription plan');
    } finally {
      setIsUpdatingPlan(false);
    }
  };

  const handleRenewNow = async () => {
    try {
      setIsRenewing(true);
      const res = await apiFetch('/api/subscriptions/renew-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      if (res.ok) {
        showNotification('success', 'Subscription extended successfully! Invoice generated.');
        fetchSubscriptionData();
      } else {
        const err = await res.json();
        showNotification('error', err.error || 'Failed to renew subscription');
      }
    } catch (err) {
      showNotification('error', 'Error renewing subscription');
    } finally {
      setIsRenewing(false);
    }
  };

  const handleUpdatePaymentMethod = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsUpdatingPayment(true);
      const res = await apiFetch('/api/subscriptions/payment-method', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cardBrand,
          cardLast4,
          paymentMethod: paymentMethodType
        })
      });
      if (res.ok) {
        showNotification('success', 'Payment method updated successfully');
        setIsPaymentMethodModalOpen(false);
        fetchSubscriptionData();
      }
    } catch (err) {
      showNotification('error', 'Failed to update payment method');
    } finally {
      setIsUpdatingPayment(false);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      const res = await apiFetch('/api/subscriptions/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelReason })
      });
      if (res.ok) {
        showNotification('info', 'Subscription auto-renew turned off. You retain access until current period end.');
        setIsCancelModalOpen(false);
        fetchSubscriptionData();
      }
    } catch (err) {
      showNotification('error', 'Failed to cancel subscription');
    }
  };

  const calculateDaysLeft = (dateString?: string) => {
    if (!dateString) return 0;
    const end = new Date(dateString).getTime();
    const now = new Date().getTime();
    const diff = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  };

  const daysLeft = calculateDaysLeft(subscription?.currentPeriodEnd);

  if (loading && !subscription) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <RefreshCw className="animate-spin text-brand-accent" size={32} />
        <p className="text-sm font-medium text-brand-muted">Loading pharmacy subscription & billing...</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-8 pb-20">
      {/* Top Banner / Active Status */}
      <div className="card border-2 border-indigo-500/30 bg-gradient-to-br from-indigo-500/10 via-brand-surface to-brand-surface relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm">
                <ShieldCheck size={14} /> Current Subscription
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 ${
                subscription?.status === 'active' 
                  ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' 
                  : 'bg-amber-500/10 text-amber-600 border border-amber-500/20'
              }`}>
                <CheckCircle2 size={12} />
                <span className="capitalize">{subscription?.status || 'Active'}</span>
              </span>
              <span className="text-xs text-brand-muted font-medium">
                • {subscription?.billingCycle === 'yearly' ? 'Annual Billing (20% Off)' : 'Monthly Billing'}
              </span>
            </div>

            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl md:text-3xl font-extrabold font-display text-brand-text">
                {subscription?.planName || 'Professional Plan'}
              </h1>
              <span className="text-xl md:text-2xl font-bold font-mono text-brand-text">
                {currency}{(subscription?.amount || 0).toLocaleString()}
                <span className="text-xs font-normal text-brand-muted">
                  /{subscription?.billingCycle === 'yearly' ? 'year' : 'month'}
                </span>
              </span>
            </div>

            <p className="text-xs md:text-sm text-brand-muted max-w-2xl">
              Active license for <strong>{pharmacyName}</strong>. 
              Renewal scheduled for <strong>{subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'long' }) : '—'}</strong> ({daysLeft} days remaining).
            </p>

            {subscription?.referralCreditApplied && Number(subscription.referralCreditApplied) > 0 ? (
              <div className="inline-flex items-center gap-2 p-2 px-3 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-600 text-xs font-semibold">
                <Gift size={14} />
                <span>{currency}{Number(subscription.referralCreditApplied).toLocaleString()} referral reward credit will offset your next billing!</span>
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={handleRenewNow}
              disabled={isRenewing}
              className="btn-primary py-2.5 px-4 text-xs font-bold flex items-center gap-1.5"
            >
              {isRenewing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              <span>Renew / Extend License</span>
            </button>

            <button
              onClick={() => setIsPaymentMethodModalOpen(true)}
              className="btn-secondary py-2.5 px-4 text-xs font-semibold flex items-center gap-1.5"
            >
              <CreditCard size={14} />
              <span>Payment Details</span>
            </button>

            <button
              onClick={() => setIsCancelModalOpen(true)}
              className="px-3 py-2.5 text-xs text-brand-muted hover:text-rose-600 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-colors"
            >
              Manage / Pause
            </button>
          </div>
        </div>
      </div>

      {/* Quota & Resource Usage Meters */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-brand-text flex items-center gap-2">
          <Layers size={18} className="text-indigo-600" />
          <span>Plan Quota & Utilization</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Branch Outlets */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-brand-muted uppercase">Pharmacy Branches</span>
              <Store size={18} className="text-indigo-600" />
            </div>
            <div className="text-2xl font-bold font-display text-brand-text">
              {quotas?.branches.used || 1} <span className="text-sm font-normal text-brand-muted">/ {quotas?.branches.limit || 3}</span>
            </div>
            <div className="w-full bg-brand-bg rounded-full h-2 overflow-hidden border border-brand-border">
              <div 
                className="bg-indigo-600 h-full rounded-full"
                style={{ 
                  width: `${Math.min(100, ((quotas?.branches.used || 1) / (typeof quotas?.branches.limit === 'number' ? quotas.branches.limit : 3)) * 100)}%` 
                }}
              />
            </div>
            <p className="text-[11px] text-brand-muted">
              {subscription?.planId === 'starter' ? 'Upgrade to Pro for up to 3 branches' : 'Multi-branch sync enabled'}
            </p>
          </div>

          {/* Staff Accounts */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-brand-muted uppercase">Staff Cashiers & Admins</span>
              <Users size={18} className="text-purple-600" />
            </div>
            <div className="text-2xl font-bold font-display text-brand-text">
              {quotas?.users.used || 1} <span className="text-sm font-normal text-brand-muted">/ {quotas?.users.limit || 10}</span>
            </div>
            <div className="w-full bg-brand-bg rounded-full h-2 overflow-hidden border border-brand-border">
              <div 
                className="bg-purple-600 h-full rounded-full"
                style={{ 
                  width: `${Math.min(100, ((quotas?.users.used || 1) / (typeof quotas?.users.limit === 'number' ? quotas.users.limit : 10)) * 100)}%` 
                }}
              />
            </div>
            <p className="text-[11px] text-brand-muted">
              Role permissions & activity audit trail
            </p>
          </div>

          {/* Products Catalog */}
          <div className="card space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-brand-muted uppercase">Inventory Catalog</span>
              <Package size={18} className="text-emerald-600" />
            </div>
            <div className="text-2xl font-bold font-display text-brand-text">
              {quotas?.products.used || 0} <span className="text-sm font-normal text-brand-muted">/ {quotas?.products.limit}</span>
            </div>
            <div className="w-full bg-brand-bg rounded-full h-2 overflow-hidden border border-brand-border">
              <div 
                className="bg-emerald-600 h-full rounded-full"
                style={{ width: `${typeof quotas?.products.limit === 'number' ? Math.min(100, ((quotas.products.used) / quotas.products.limit) * 100) : 100}%` }}
              />
            </div>
            <p className="text-[11px] text-emerald-600 font-medium">
              Unlimited SKU catalog & barcode support
            </p>
          </div>
        </div>
      </div>

      {/* Available Plans & Comparison Grid */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
              <Zap size={20} className="text-amber-500" />
              <span>Available Subscription Plans</span>
            </h2>
            <p className="text-xs text-brand-muted mt-0.5">
              Select the plan tailored to your pharmacy's volume, branches, and staffing.
            </p>
          </div>

          {/* Billing Cycle Switcher */}
          <div className="inline-flex items-center bg-brand-bg p-1 rounded-2xl border border-brand-border self-start sm:self-auto">
            <button
              onClick={() => setSelectedCycle('monthly')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                selectedCycle === 'monthly'
                  ? 'bg-brand-surface text-brand-text shadow-sm'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setSelectedCycle('yearly')}
              className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                selectedCycle === 'yearly'
                  ? 'bg-brand-surface text-brand-text shadow-sm'
                  : 'text-brand-muted hover:text-brand-text'
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-1.5 py-0.5 rounded-md bg-emerald-500 text-white text-[10px] font-bold">
                Save 20%
              </span>
            </button>
          </div>
        </div>

        {/* 3 Plan Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {plans.map((plan) => {
            const isCurrent = subscription?.planId === plan.id;
            const price = selectedCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;

            return (
              <div 
                key={plan.id}
                className={`card relative flex flex-col justify-between transition-all duration-300 ${
                  isCurrent 
                    ? 'border-2 border-indigo-600 shadow-lg' 
                    : plan.badge 
                    ? 'border-2 border-brand-accent/30' 
                    : 'border-brand-border'
                }`}
              >
                {/* Badges */}
                <div className="flex items-center justify-between mb-4">
                  {plan.badge ? (
                    <span className="px-2.5 py-1 rounded-full bg-indigo-600 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
                      {plan.badge}
                    </span>
                  ) : <div />}
                  {isCurrent && (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                      <Check size={12} /> Active Plan
                    </span>
                  )}
                </div>

                {/* Plan Header */}
                <div className="space-y-2">
                  <h3 className="text-xl font-bold text-brand-text">{plan.name}</h3>
                  <p className="text-xs text-brand-muted min-h-[32px]">{plan.description}</p>
                  
                  <div className="pt-2">
                    <span className="text-3xl font-extrabold font-mono text-brand-text">
                      {currency}{price.toLocaleString()}
                    </span>
                    <span className="text-xs text-brand-muted">
                      /{selectedCycle === 'yearly' ? 'year' : 'month'}
                    </span>
                    {selectedCycle === 'yearly' && (
                      <span className="block text-[11px] text-emerald-600 font-semibold mt-0.5">
                        Equivalent to {currency}{Math.round(price / 12).toLocaleString()}/month (2 months free)
                      </span>
                    )}
                  </div>
                </div>

                {/* Features List */}
                <div className="py-6 border-t border-brand-border my-6 space-y-2.5 flex-1">
                  <span className="text-[11px] font-bold text-brand-muted uppercase tracking-wider block mb-1">
                    Features Included:
                  </span>
                  {plan.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2.5 text-xs text-brand-text">
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* CTA Button */}
                <div>
                  {isCurrent ? (
                    <button
                      disabled
                      className="w-full py-3 rounded-xl bg-brand-bg text-brand-muted font-bold text-xs border border-brand-border cursor-default flex items-center justify-center gap-1.5"
                    >
                      <Check size={14} className="text-emerald-500" />
                      <span>Current Active Plan</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleOpenPlanConfirm(plan)}
                      className="w-full py-3 rounded-xl btn-primary text-xs font-bold shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-1.5"
                    >
                      <span>Switch to {plan.name}</span>
                      <ArrowUpRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payment Method & Auto-Renew Card */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Payment Method */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-brand-text flex items-center gap-2">
              <CreditCard size={18} className="text-indigo-600" />
              <span>Primary Payment Method</span>
            </h3>
            <button
              onClick={() => setIsPaymentMethodModalOpen(true)}
              className="text-xs text-indigo-600 font-semibold hover:underline"
            >
              Update
            </button>
          </div>

          <div className="p-4 rounded-2xl bg-brand-bg border border-brand-border flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs uppercase shadow-sm">
                {subscription?.cardBrand || 'VISA'}
              </div>
              <div>
                <div className="font-mono text-sm font-bold text-brand-text">
                  •••• •••• •••• {subscription?.cardLast4 || '4242'}
                </div>
                <div className="text-[11px] text-brand-muted">
                  Auto-debit on renewal date
                </div>
              </div>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold uppercase">
              Verified
            </span>
          </div>

          <div className="flex items-center justify-between pt-2">
            <div>
              <span className="text-xs font-bold text-brand-text block">Automatic Renewal</span>
              <span className="text-[11px] text-brand-muted">Renew license seamlessly to avoid downtime</span>
            </div>
            <button
              onClick={handleToggleAutoRenew}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                subscription?.autoRenew ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  subscription?.autoRenew ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Invoice & Accounting Summary */}
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-base text-brand-text flex items-center gap-2">
              <ShieldCheck size={18} className="text-emerald-600" />
              <span>Billing Guarantee & Support</span>
            </h3>
            <span className="text-xs text-emerald-600 font-semibold">100% Secure</span>
          </div>

          <div className="p-4 rounded-2xl bg-brand-bg border border-brand-border space-y-2 text-xs text-brand-muted">
            <p>
              • All plans include automatic secure cloud database backups and local offline-first fallback.
            </p>
            <p>
              • Invoices are tax-deductible commercial pharmacy software receipts compliant with regulatory auditing.
            </p>
            <p>
              • Cancel anytime without penalty. If cancelled, your pharmacy keeps full access until the end of your billing cycle.
            </p>
          </div>

          <div className="flex items-center justify-between pt-1 text-xs">
            <span className="text-brand-muted">Need custom multi-hospital licensing?</span>
            <a 
              href="mailto:support@pharmacyflow.com" 
              className="text-indigo-600 font-semibold hover:underline flex items-center gap-1"
            >
              Contact Enterprise Desk <ExternalLink size={12} />
            </a>
          </div>
        </div>
      </div>

      {/* Subscription Billing History Table */}
      <div className="card space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-brand-text flex items-center gap-2">
              <Calendar size={18} className="text-indigo-600" />
              <span>Subscription Invoices & Payment Receipts</span>
            </h2>
            <p className="text-xs text-brand-muted mt-0.5">
              Review and print official tax receipts for your business records.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-brand-border">
          <table className="w-full text-left text-xs">
            <thead className="bg-brand-bg text-brand-muted uppercase text-[10px] tracking-wider border-b border-brand-border">
              <tr>
                <th className="p-3.5 font-semibold">Invoice #</th>
                <th className="p-3.5 font-semibold">Date</th>
                <th className="p-3.5 font-semibold">Plan & Period</th>
                <th className="p-3.5 font-semibold">Cycle</th>
                <th className="p-3.5 font-semibold">Amount Paid</th>
                <th className="p-3.5 font-semibold">Status</th>
                <th className="p-3.5 font-semibold text-right">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-brand-border">
              {invoices.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-brand-muted">
                    No past subscription invoices found.
                  </td>
                </tr>
              ) : (
                invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-brand-bg/50 transition-colors">
                    <td className="p-3.5 font-mono font-bold text-brand-text">
                      {inv.invoiceNumber}
                    </td>
                    <td className="p-3.5 text-brand-muted">
                      {new Date(inv.date).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </td>
                    <td className="p-3.5 font-medium text-brand-text">
                      {inv.planName}
                    </td>
                    <td className="p-3.5 capitalize text-brand-muted">
                      {inv.billingCycle}
                    </td>
                    <td className="p-3.5 font-mono font-bold text-brand-text">
                      {currency}{Number(inv.amount).toLocaleString()}
                      {inv.discountApplied && Number(inv.discountApplied) > 0 ? (
                        <span className="block text-[10px] text-pink-600 font-normal">
                          (-{currency}{Number(inv.discountApplied).toLocaleString()} referral credit)
                        </span>
                      ) : null}
                    </td>
                    <td className="p-3.5">
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold text-[10px] uppercase">
                        {inv.status}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <button
                        onClick={() => setViewInvoiceModal(inv)}
                        className="px-2.5 py-1 rounded-lg bg-brand-bg hover:bg-brand-border text-brand-text font-semibold text-xs border border-brand-border inline-flex items-center gap-1 transition-all"
                      >
                        <Printer size={12} />
                        <span>Print</span>
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plan Switch Confirmation Modal */}
      <AnimatePresence>
        {isChangePlanModalOpen && targetPlan && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-brand-surface rounded-2xl border border-brand-border shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-5 border-b border-brand-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
                    <Zap size={16} />
                  </div>
                  <h3 className="font-bold text-base text-brand-text">Confirm Plan Switch</h3>
                </div>
                <button 
                  onClick={() => setIsChangePlanModalOpen(false)}
                  className="p-1 rounded-lg text-brand-muted hover:bg-brand-bg hover:text-brand-text"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <div className="p-4 rounded-xl bg-brand-bg border border-brand-border space-y-1">
                  <span className="text-[11px] font-semibold text-brand-muted uppercase">Target Plan</span>
                  <div className="text-lg font-bold text-brand-text">{targetPlan.name}</div>
                  <div className="text-xs text-brand-muted">
                    Billing Cycle: <strong className="capitalize text-brand-text">{selectedCycle}</strong>
                  </div>
                  <div className="font-mono text-xl font-extrabold text-indigo-600 mt-2">
                    {currency}{(selectedCycle === 'yearly' ? targetPlan.yearlyPrice : targetPlan.monthlyPrice).toLocaleString()}
                    <span className="text-xs font-normal text-brand-muted">/{selectedCycle === 'yearly' ? 'year' : 'month'}</span>
                  </div>
                </div>

                <div className="space-y-1 text-xs text-brand-muted">
                  <p>• Your subscription will update immediately.</p>
                  <p>• Any remaining referral reward wallet balance will automatically discount this payment.</p>
                  <p>• A commercial tax receipt invoice will be generated and saved to your history.</p>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsChangePlanModalOpen(false)}
                    className="btn-secondary py-2 px-4 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmPlanChange}
                    disabled={isUpdatingPlan}
                    className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
                  >
                    {isUpdatingPlan && <RefreshCw size={12} className="animate-spin" />}
                    <span>Confirm & Activate Plan</span>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Method Modal */}
      <AnimatePresence>
        {isPaymentMethodModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-brand-surface rounded-2xl border border-brand-border shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-5 border-b border-brand-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-indigo-600/10 text-indigo-600 flex items-center justify-center">
                    <CreditCard size={16} />
                  </div>
                  <h3 className="font-bold text-base text-brand-text">Update Billing Method</h3>
                </div>
                <button 
                  onClick={() => setIsPaymentMethodModalOpen(false)}
                  className="p-1 rounded-lg text-brand-muted hover:bg-brand-bg hover:text-brand-text"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleUpdatePaymentMethod} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-brand-muted mb-1">Card Brand</label>
                  <select
                    value={cardBrand}
                    onChange={(e) => setCardBrand(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs focus:outline-none focus:ring-1 focus:ring-brand-accent"
                  >
                    <option value="Visa">Visa</option>
                    <option value="Mastercard">Mastercard</option>
                    <option value="Verve">Verve</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-brand-muted mb-1">Last 4 Digits</label>
                  <input
                    type="text"
                    required
                    maxLength={4}
                    pattern="[0-9]{4}"
                    placeholder="e.g. 4242"
                    value={cardLast4}
                    onChange={(e) => setCardLast4(e.target.value.replace(/[^0-9]/g, ''))}
                    className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs font-mono focus:outline-none focus:ring-1 focus:ring-brand-accent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-brand-muted mb-1">Expiry MM/YY</label>
                    <input
                      type="text"
                      placeholder="12/28"
                      className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-brand-muted mb-1">Security CVV</label>
                    <input
                      type="password"
                      maxLength={4}
                      placeholder="•••"
                      className="w-full px-3 py-2 rounded-xl border border-brand-border bg-brand-bg text-brand-text text-xs font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPaymentMethodModalOpen(false)}
                    className="btn-secondary py-2 px-4 text-xs font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isUpdatingPayment}
                    className="btn-primary py-2 px-4 text-xs font-semibold flex items-center gap-1.5"
                  >
                    {isUpdatingPayment && <RefreshCw size={12} className="animate-spin" />}
                    <span>Save Payment Method</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Cancel / Retention Modal */}
      <AnimatePresence>
        {isCancelModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-brand-surface rounded-2xl border border-brand-border shadow-2xl max-w-md w-full overflow-hidden"
            >
              <div className="p-5 border-b border-brand-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-600 flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                  <h3 className="font-bold text-base text-brand-text">Pause or Cancel Auto-Renew</h3>
                </div>
                <button 
                  onClick={() => setIsCancelModalOpen(false)}
                  className="p-1 rounded-lg text-brand-muted hover:bg-brand-bg hover:text-brand-text"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 space-y-4">
                <p className="text-xs text-brand-muted">
                  We'd love to know how we can improve Pharmacy Flow for your business before you cancel auto-renewal:
                </p>

                <div className="space-y-2">
                  {[
                    'Switching to another pharmacy system',
                    'Closing or pausing pharmacy operations',
                    'Need features not yet present',
                    'Price / budget considerations'
                  ].map((reason, i) => (
                    <label key={i} className="flex items-center gap-2 text-xs text-brand-text cursor-pointer">
                      <input 
                        type="radio" 
                        name="cancel_reason" 
                        value={reason} 
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="accent-indigo-600" 
                      />
                      <span>{reason}</span>
                    </label>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300">
                  <strong>Note:</strong> Your pharmacy data, sales history, and inventory will remain completely intact. You will retain full access until <strong>{subscription?.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : 'period end'}</strong>.
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsCancelModalOpen(false)}
                    className="btn-primary py-2 px-4 text-xs font-semibold"
                  >
                    Keep Subscription
                  </button>
                  <button
                    type="button"
                    onClick={handleCancelSubscription}
                    className="btn-secondary py-2 px-4 text-xs font-semibold text-rose-600 hover:text-rose-700"
                  >
                    Turn Off Auto-Renew
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* View Printable Invoice Modal */}
      <AnimatePresence>
        {viewInvoiceModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white text-slate-900 rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden p-6 md:p-8 space-y-6"
            >
              <div className="flex justify-between items-start border-b pb-4">
                <div>
                  <h3 className="font-extrabold text-xl tracking-tight text-slate-900">
                    PHARMACY FLOW
                  </h3>
                  <p className="text-xs text-slate-500">Official Software License Receipt</p>
                </div>
                <button
                  onClick={() => setViewInvoiceModal(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Billed To:</span>
                  <p className="font-bold text-slate-800 text-sm">{pharmacyName}</p>
                  <p className="text-slate-500">{settings.storeAddress || 'Health Facility'}</p>
                </div>
                <div className="text-right">
                  <span className="text-slate-400 block font-semibold uppercase text-[10px]">Invoice Number:</span>
                  <p className="font-mono font-bold text-slate-800">{viewInvoiceModal.invoiceNumber}</p>
                  <p className="text-slate-500">
                    Date: {new Date(viewInvoiceModal.date).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className="border rounded-2xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] border-b">
                    <tr>
                      <th className="p-3">Description</th>
                      <th className="p-3 text-right">Cycle</th>
                      <th className="p-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-slate-700">
                    <tr>
                      <td className="p-3">
                        <div className="font-bold">{viewInvoiceModal.planName}</div>
                        <div className="text-[11px] text-slate-400">Complete pharmacy inventory & POS license</div>
                      </td>
                      <td className="p-3 text-right capitalize">{viewInvoiceModal.billingCycle}</td>
                      <td className="p-3 text-right font-mono font-bold">
                        {currency}{Number(viewInvoiceModal.amount).toLocaleString()}
                      </td>
                    </tr>
                    {viewInvoiceModal.discountApplied && Number(viewInvoiceModal.discountApplied) > 0 ? (
                      <tr className="text-pink-600">
                        <td className="p-3">Referral Reward Credit Discount</td>
                        <td className="p-3 text-right">—</td>
                        <td className="p-3 text-right font-mono font-bold">
                          -{currency}{Number(viewInvoiceModal.discountApplied).toLocaleString()}
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t font-bold">
                    <tr>
                      <td colSpan={2} className="p-3 text-right">Total Paid:</td>
                      <td className="p-3 text-right font-mono text-base text-slate-900">
                        {currency}{Number(viewInvoiceModal.amount).toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t">
                <span>Payment Method: {viewInvoiceModal.paymentMethod.toUpperCase()}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold uppercase">
                  Paid & Confirmed
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <Printer size={14} />
                  <span>Print Receipt</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
