'use client';

import React, { useState } from 'react';
import { 
  X, 
  Receipt, 
  DollarSign, 
  Calendar, 
  Building2, 
  CreditCard, 
  FileText, 
  AlertCircle, 
  Repeat, 
  Zap, 
  CheckCircle2, 
  ArrowRight,
  Clock,
  Sparkles
} from 'lucide-react';
import { 
  Expense, 
  ExpenseType, 
  ExpenseFrequency, 
  ExpenseCategory 
} from '@/lib/mock-data';

interface RecordExpenseModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveExpense: (expense: Omit<Expense, 'id' | 'timestamp'>) => void;
}

const CATEGORIES: { label: ExpenseCategory; icon: string; desc: string }[] = [
  { label: 'Infrastructure & Cloud', icon: '☁️', desc: 'Servers, AWS, databases, hosting' },
  { label: 'Salaries & Field Support', icon: '👥', desc: 'Pharmacist support team, field reps' },
  { label: 'SMS & Telecom APIs', icon: '📱', desc: 'Termii, Twilio, 2FA OTP gateways' },
  { label: 'Marketing & Outreach', icon: '📣', desc: 'Campaigns, ads, PSN conferences' },
  { label: 'Hardware & POS Terminals', icon: '🖨️', desc: 'Printers, barcode scanners, shipping' },
  { label: 'Compliance & Licensing', icon: '⚖️', desc: 'NAFDAC, PCN, legal, security audits' },
  { label: 'Office & Operations', icon: '🏢', desc: 'Internet, utilities, supplies, rent' },
];

const PAYMENT_METHODS = [
  'Direct Bank Transfer',
  'Corporate USD/NGN Card',
  'Paystack Instant Debit',
  'Remita Central Settlement',
  'Cash Voucher / Petty Cash',
];

export default function RecordExpenseModal({
  isOpen,
  onClose,
  onSaveExpense,
}: RecordExpenseModalProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('Infrastructure & Cloud');
  const [amount, setAmount] = useState<string>('');
  const [type, setType] = useState<ExpenseType>('recurring');
  const [frequency, setFrequency] = useState<ExpenseFrequency>('monthly');
  const [vendor, setVendor] = useState('');
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]);
  const [receiptRef, setReceiptRef] = useState('');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const parsedAmount = parseFloat(amount.replace(/,/g, '')) || 0;

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = 'Expense title or description is required';
    if (!amount || parsedAmount <= 0) errs.amount = 'Please enter a valid expense amount in ₦';
    if (!vendor.trim()) errs.vendor = 'Vendor or payee name is required';
    if (!date) errs.date = 'Effective date is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    setTimeout(() => {
      onSaveExpense({
        title: title.trim(),
        category,
        amount: parsedAmount,
        type,
        frequency: type === 'recurring' ? frequency : undefined,
        date: new Date(date).toISOString(),
        vendor: vendor.trim(),
        payment_method: paymentMethod,
        receipt_ref: receiptRef.trim() || undefined,
        notes: notes.trim() || undefined,
        recorded_by: 'Super Admin (Finance)',
        status: type === 'recurring' ? 'active' : 'paid',
      });
      setSubmitting(false);
      onClose();
    }, 250);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between sticky top-0 bg-card/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center shadow-sm">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-text-primary flex items-center gap-2">
                <span>Record Operating Expense</span>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/20">
                  Analytics P&amp;L
                </span>
              </h2>
              <p className="text-xs text-text-secondary mt-0.5">
                Mark as one-time or recurring to factor into net earnings calculations.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/5 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5 flex-1">
          
          {/* STEP 1: EXPENSE TYPE SELECTION (One-Time vs Recurring) */}
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
              <span>Expense Classification</span>
              <span className="text-rose-400">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Recurring Option */}
              <div
                onClick={() => setType('recurring')}
                className={`cursor-pointer rounded-xl p-3.5 border transition-all relative ${
                  type === 'recurring'
                    ? 'bg-accent/10 border-accent text-text-primary ring-1 ring-accent'
                    : 'bg-bg/60 border-border text-text-secondary hover:border-border/80 hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      type === 'recurring' ? 'bg-accent text-white' : 'bg-card text-text-secondary'
                    }`}>
                      <Repeat className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary">Recurring Expense</h4>
                      <span className="text-[11px] text-text-secondary">Continuous subscription or operational commitment</span>
                    </div>
                  </div>
                  {type === 'recurring' && (
                    <CheckCircle2 className="w-4 h-4 text-accent shrink-0" />
                  )}
                </div>
              </div>

              {/* One-Time Option */}
              <div
                onClick={() => setType('onetime')}
                className={`cursor-pointer rounded-xl p-3.5 border transition-all relative ${
                  type === 'onetime'
                    ? 'bg-blue-500/10 border-blue-500 text-text-primary ring-1 ring-blue-500'
                    : 'bg-bg/60 border-border text-text-secondary hover:border-border/80 hover:bg-white/[0.02]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                      type === 'onetime' ? 'bg-blue-500 text-white' : 'bg-card text-text-secondary'
                    }`}>
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-text-primary">One-Time Expense</h4>
                      <span className="text-[11px] text-text-secondary">Single invoice, hardware purchase, audit, or campaign</span>
                    </div>
                  </div>
                  {type === 'onetime' && (
                    <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* If Recurring: Frequency Selector */}
          {type === 'recurring' && (
            <div className="bg-accent/5 border border-accent/20 rounded-xl p-3.5 space-y-2 animate-in fade-in duration-150">
              <label className="text-xs font-bold text-text-primary flex items-center gap-1.5">
                <Repeat className="w-3.5 h-3.5 text-accent" />
                <span>Recurring Billing Cadence</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { id: 'monthly', label: 'Monthly', sub: 'Every 30 days' },
                  { id: 'quarterly', label: 'Quarterly', sub: 'Every 90 days' },
                  { id: 'annual', label: 'Annual', sub: 'Every 365 days' },
                  { id: 'weekly', label: 'Weekly', sub: 'Every 7 days' },
                ].map((freq) => (
                  <button
                    key={freq.id}
                    type="button"
                    onClick={() => setFrequency(freq.id as ExpenseFrequency)}
                    className={`py-2 px-2.5 rounded-lg text-xs font-semibold text-center border transition-all ${
                      frequency === freq.id
                        ? 'bg-accent text-white border-accent shadow-sm'
                        : 'bg-card border-border text-text-secondary hover:text-text-primary hover:bg-white/5'
                    }`}
                  >
                    <span className="block font-bold">{freq.label}</span>
                    <span className="text-[9px] opacity-80 block">{freq.sub}</span>
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-text-secondary mt-1">
                Calculated proportionally against whatever active timeframe (7D, 14D, 1M, 3M, 6M, 1Y) is viewed in analytics.
              </p>
            </div>
          )}

          {/* Amount & Title Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Amount */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center justify-between">
                <span>Amount (₦ NGN) <span className="text-rose-400">*</span></span>
                {parsedAmount > 0 && (
                  <span className="font-mono text-emerald-400 font-bold text-xs">
                    ₦{parsedAmount.toLocaleString()}
                  </span>
                )}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono font-bold text-text-secondary">
                  ₦
                </span>
                <input
                  type="text"
                  placeholder="e.g. 350000"
                  value={amount}
                  onChange={(e) => {
                    const val = e.target.value.replace(/[^0-9]/g, '');
                    setAmount(val ? Number(val).toLocaleString() : '');
                    if (errors.amount) setErrors(prev => ({ ...prev, amount: '' }));
                  }}
                  className={`w-full bg-bg border rounded-xl pl-8 pr-3 py-2 text-sm font-mono font-bold text-text-primary focus:outline-none focus:ring-1 focus:ring-accent ${
                    errors.amount ? 'border-rose-500' : 'border-border'
                  }`}
                />
              </div>
              {errors.amount && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.amount}</span>
                </p>
              )}
            </div>

            {/* Incurred / Billing Date */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                {type === 'recurring' ? 'Billing Start / Incurred Date' : 'Expense Date'} <span className="text-rose-400">*</span>
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary pointer-events-none" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    if (errors.date) setErrors(prev => ({ ...prev, date: '' }));
                  }}
                  className={`w-full bg-bg border rounded-xl pl-9 pr-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent ${
                    errors.date ? 'border-rose-500' : 'border-border'
                  }`}
                />
              </div>
              {errors.date && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.date}</span>
                </p>
              )}
            </div>
          </div>

          {/* Title / Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Expense Title / Description <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              placeholder="e.g. AWS Multi-AZ Database Hosting or Bulk Receipt Printers Procurement"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) setErrors(prev => ({ ...prev, title: '' }));
              }}
              className={`w-full bg-bg border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent ${
                errors.title ? 'border-rose-500' : 'border-border'
              }`}
            />
            {errors.title && (
              <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" />
                <span>{errors.title}</span>
              </p>
            )}
          </div>

          {/* Category & Vendor Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Category */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Operating Cost Category <span className="text-rose-400">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {CATEGORIES.map((cat) => (
                  <option key={cat.label} value={cat.label}>
                    {cat.icon} {cat.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Vendor / Payee */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Vendor / Payee Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                placeholder="e.g. Amazon Web Services, Termii, Hardware Vendor"
                value={vendor}
                onChange={(e) => {
                  setVendor(e.target.value);
                  if (errors.vendor) setErrors(prev => ({ ...prev, vendor: '' }));
                }}
                className={`w-full bg-bg border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent ${
                  errors.vendor ? 'border-rose-500' : 'border-border'
                }`}
              />
              {errors.vendor && (
                <p className="text-[11px] text-rose-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3" />
                  <span>{errors.vendor}</span>
                </p>
              )}
            </div>
          </div>

          {/* Payment Method & Receipt Reference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Disbursement / Payment Method
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                {PAYMENT_METHODS.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
                Receipt / Invoice Ref No. <span className="text-text-secondary font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                placeholder="e.g. INV-2026-904 or TRM-NG-4482"
                value={receiptRef}
                onChange={(e) => setReceiptRef(e.target.value)}
                className="w-full bg-bg border border-border rounded-xl px-3 py-2 text-xs font-mono text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>
          </div>

          {/* Notes / Context */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Operational Notes &amp; Justification <span className="text-text-secondary font-normal">(Optional)</span>
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Approved by board for Q3 pharmacy POS terminal onboarding rollout..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full bg-bg border border-border rounded-xl p-2.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            />
          </div>

          {/* Impact preview card */}
          {parsedAmount > 0 && (
            <div className="bg-card border border-border/80 rounded-xl p-3 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="text-text-secondary">
                  Will immediately deduct <strong className="text-text-primary font-mono">₦{parsedAmount.toLocaleString()}</strong> from gross revenue calculations.
                </span>
              </div>
              <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-white/5 text-text-secondary">
                Live Factor
              </span>
            </div>
          )}

          {/* Footer buttons */}
          <div className="pt-3 border-t border-border flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-accent hover:bg-accent/90 text-white font-bold text-xs px-5 py-2.5 rounded-xl flex items-center gap-2 shadow-md transition-all disabled:opacity-50"
            >
              <Receipt className="w-4 h-4" />
              <span>{submitting ? 'Recording...' : 'Record & Factor into Earnings'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
