'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { 
  X, Search, PlusCircle, CheckCircle2, RotateCw, AlertTriangle, 
  Calendar, CreditCard, Building2, User, MapPin, ShieldCheck, Sparkles 
} from 'lucide-react';
import { Pharmacy, SubscriptionPlan, SubscriptionCycle, PLAN_PRICES } from '@/lib/mock-data';
import { format, addMonths, addYears } from 'date-fns';

interface RenewSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  pharmacies: Pharmacy[];
  initialPharmacy?: Pharmacy | null;
  onConfirmRenewal: (updatedPharmacy: Pharmacy, renewalDetails: {
    plan: SubscriptionPlan;
    cycle: SubscriptionCycle;
    amount: number;
    newExpiry: string;
    isNewStore?: boolean;
  }) => void;
}

export default function RenewSubscriptionModal({
  isOpen,
  onClose,
  pharmacies,
  initialPharmacy = null,
  onConfirmRenewal,
}: RenewSubscriptionModalProps) {
  const [tab, setTab] = useState<'search' | 'new_store'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPharmacy, setSelectedPharmacy] = useState<Pharmacy | null>(initialPharmacy);

  // New store form state
  const [newStoreName, setNewStoreName] = useState('');
  const [newOwnerName, setNewOwnerName] = useState('');
  const [newState, setNewState] = useState('Lagos (Ikeja)');
  const [newPhone, setNewPhone] = useState('');
  const [newStoreError, setNewStoreError] = useState('');

  // Renewal configuration
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(
    initialPharmacy?.subscription_plan || 'Standard'
  );
  const [selectedCycle, setSelectedCycle] = useState<SubscriptionCycle>(
    initialPharmacy?.subscription_cycle || 'Monthly'
  );
  const [paymentMethod, setPaymentMethod] = useState<'nibss' | 'card' | 'pos' | 'transfer'>('nibss');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [refTime] = useState(() => Date.now());

  // Search filter
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return pharmacies.slice(0, 8);
    }
    const q = searchQuery.toLowerCase();
    return pharmacies
      .filter(p => 
        p.business_name.toLowerCase().includes(q) ||
        p.owner_name.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        (p.state && p.state.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [pharmacies, searchQuery]);

  // Calculate pricing & new expiry
  const baseMonthly = PLAN_PRICES[selectedPlan];
  const { totalCost, discount, monthsToAdd } = useMemo(() => {
    if (selectedCycle === 'Annual') {
      const regular = baseMonthly * 12;
      const discounted = regular * 0.8; // 20% discount
      return { totalCost: discounted, discount: regular - discounted, monthsToAdd: 12 };
    } else if (selectedCycle === 'Quarterly') {
      const regular = baseMonthly * 3;
      const discounted = regular * 0.95; // 5% discount
      return { totalCost: discounted, discount: regular - discounted, monthsToAdd: 3 };
    } else {
      return { totalCost: baseMonthly, discount: 0, monthsToAdd: 1 };
    }
  }, [baseMonthly, selectedCycle]);

  const newExpiryDate = useMemo(() => {
    const nowDate = new Date(refTime);
    if (!selectedPharmacy) {
      return addMonths(nowDate, monthsToAdd);
    }

    const currentExpiry = new Date(selectedPharmacy.subscription_expiry);
    // If expired, renewal starts from today. If active/expiring soon, extend from current expiry date.
    const baseDate = currentExpiry.getTime() > nowDate.getTime() ? currentExpiry : nowDate;
    return addMonths(baseDate, monthsToAdd);
  }, [selectedPharmacy, monthsToAdd, refTime]);

  const handleCreateNewPharmacy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStoreName.trim()) {
      setNewStoreError('Please enter a pharmacy store name.');
      return;
    }
    if (!newOwnerName.trim()) {
      setNewStoreError('Please enter the owner or superintendent pharmacist name.');
      return;
    }

    const newPharmacy: Pharmacy = {
      id: `ph-${Date.now().toString().slice(-4)}`,
      business_name: newStoreName.trim(),
      owner_name: newOwnerName.trim(),
      status: 'active',
      daily_sales: 150000,
      last_sync_date: new Date().toISOString(),
      subscription_status: 'active',
      subscription_plan: selectedPlan,
      subscription_cycle: selectedCycle,
      subscription_expiry: newExpiryDate.toISOString(),
      subscription_cost: totalCost,
      state: newState,
      phone: newPhone || '+234 800 000 0000',
      email: `contact@${newStoreName.toLowerCase().replace(/[^a-z0-9]/g, '')}.ng`,
    };

    setSelectedPharmacy(newPharmacy);
    setNewStoreError('');
  };

  const handleConfirmSubmit = () => {
    if (!selectedPharmacy) return;

    setIsSubmitting(true);
    setTimeout(() => {
      const isNew = !pharmacies.some(p => p.id === selectedPharmacy.id);
      const updatedPharmacy: Pharmacy = {
        ...selectedPharmacy,
        status: 'active',
        subscription_status: 'active',
        subscription_plan: selectedPlan,
        subscription_cycle: selectedCycle,
        subscription_expiry: newExpiryDate.toISOString(),
        subscription_cost: totalCost,
        last_sync_date: new Date().toISOString(),
      };

      onConfirmRenewal(updatedPharmacy, {
        plan: selectedPlan,
        cycle: selectedCycle,
        amount: totalCost,
        newExpiry: newExpiryDate.toISOString(),
        isNewStore: isNew,
      });

      setSuccessMessage(`Subscription successfully renewed for ${updatedPharmacy.business_name}!`);
      setIsSubmitting(false);

      setTimeout(() => {
        setSuccessMessage(null);
        onClose();
      }, 1200);
    }, 400);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[200] flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-card border border-border w-full max-w-3xl rounded-xl shadow-2xl flex flex-col my-auto max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between bg-card/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center text-accent">
              <RotateCw className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold tracking-tight text-text-primary">
                Renew Pharmacy Subscription
              </h2>
              <p className="text-xs text-text-secondary">
                Search and select an existing store or register a new pharmacy before renewing.
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/10 transition-colors"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {successMessage && (
            <div className="bg-success/10 border border-success/30 rounded-lg p-3 sm:p-4 flex items-center gap-3 text-success">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <p className="text-sm font-medium">{successMessage}</p>
            </div>
          )}

          {/* STEP 1: Pharmacy Selection or Creation */}
          {!selectedPharmacy ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Step 1: Locate or Add Pharmacy
                </span>
                <div className="flex items-center gap-1 bg-bg p-1 rounded-lg border border-border text-xs">
                  <button
                    type="button"
                    onClick={() => setTab('search')}
                    className={`px-3 py-1 rounded font-medium transition-colors ${
                      tab === 'search' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Search Stores
                  </button>
                  <button
                    type="button"
                    onClick={() => setTab('new_store')}
                    className={`px-3 py-1 rounded font-medium transition-colors ${
                      tab === 'new_store' ? 'bg-accent text-white shadow-sm' : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    + Add New Pharmacy
                  </button>
                </div>
              </div>

              {tab === 'search' ? (
                <div className="space-y-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
                    <input
                      type="text"
                      placeholder="Search by store name, owner, state, or ID (e.g. City Care, ph-14)..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-bg border border-border rounded-lg pl-10 pr-4 py-2.5 text-xs sm:text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
                      autoFocus
                    />
                  </div>

                  <p className="text-[11px] text-text-secondary">
                    {searchQuery ? `Found ${searchResults.length} matching pharmacies:` : 'Quick select from recently active or expiring stores:'}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-60 overflow-y-auto pr-1">
                    {searchResults.map((pharmacy) => {
                      const isExpired = pharmacy.subscription_status === 'expired';
                      const isExpiring = pharmacy.subscription_status === 'expiring_soon';
                      return (
                        <div
                          key={pharmacy.id}
                          onClick={() => setSelectedPharmacy(pharmacy)}
                          className="p-3 rounded-lg border border-border bg-bg/50 hover:border-accent/60 hover:bg-accent/5 cursor-pointer transition-all flex flex-col justify-between group"
                        >
                          <div>
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <h4 className="text-xs font-semibold text-text-primary group-hover:text-accent transition-colors truncate">
                                {pharmacy.business_name}
                              </h4>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                                isExpired 
                                  ? 'bg-error/15 text-error border border-error/25'
                                  : isExpiring 
                                  ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25'
                                  : 'bg-success/15 text-success border border-success/25'
                              }`}>
                                {isExpired ? 'Expired' : isExpiring ? 'Expiring' : 'Active'}
                              </span>
                            </div>
                            <p className="text-[11px] text-text-secondary truncate">
                              {pharmacy.owner_name} • {pharmacy.state || 'Nigeria'}
                            </p>
                          </div>
                          
                          <div className="mt-2 pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-text-secondary">
                            <span>Plan: <span className="text-text-primary font-medium">{pharmacy.subscription_plan}</span></span>
                            <span className="text-accent font-semibold group-hover:underline">Select & Renew →</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {searchResults.length === 0 && (
                    <div className="text-center py-6 border border-dashed border-border rounded-lg">
                      <p className="text-xs text-text-secondary mb-2">No pharmacy found matching &ldquo;{searchQuery}&rdquo;</p>
                      <button
                        type="button"
                        onClick={() => {
                          setNewStoreName(searchQuery);
                          setTab('new_store');
                        }}
                        className="text-xs text-accent hover:underline font-semibold"
                      >
                        + Register &ldquo;{searchQuery}&rdquo; as a new pharmacy now
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                /* Add New Pharmacy Form */
                <form onSubmit={handleCreateNewPharmacy} className="space-y-4 bg-bg/40 p-4 rounded-lg border border-border">
                  <div className="flex items-center gap-2 text-xs font-medium text-text-primary mb-1">
                    <Building2 className="w-4 h-4 text-accent" />
                    <span>Enter New Pharmacy Credentials</span>
                  </div>

                  {newStoreError && (
                    <p className="text-xs text-error font-medium">{newStoreError}</p>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">Store / Business Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Apex Care Pharmacy Lekki"
                        value={newStoreName}
                        onChange={(e) => setNewStoreName(e.target.value)}
                        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">Pharmacist in Charge / Owner *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Dr. Olumide Adeleke"
                        value={newOwnerName}
                        onChange={(e) => setNewOwnerName(e.target.value)}
                        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">State / Location</label>
                      <select
                        value={newState}
                        onChange={(e) => setNewState(e.target.value)}
                        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        <option value="Lagos (Ikeja)">Lagos (Ikeja)</option>
                        <option value="Lagos (Lekki)">Lagos (Lekki)</option>
                        <option value="Lagos (Yaba)">Lagos (Yaba)</option>
                        <option value="Abuja (FCT)">Abuja (FCT)</option>
                        <option value="Rivers (Port Harcourt)">Rivers (Port Harcourt)</option>
                        <option value="Oyo (Ibadan)">Oyo (Ibadan)</option>
                        <option value="Kano (Nassarawa)">Kano (Nassarawa)</option>
                        <option value="Enugu (Independence Layout)">Enugu (Independence Layout)</option>
                        <option value="Delta (Asaba)">Delta (Asaba)</option>
                        <option value="Edo (Benin City)">Edo (Benin City)</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-text-secondary mb-1">Phone Contact (Optional)</label>
                      <input
                        type="tel"
                        placeholder="e.g. +234 803 456 7890"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        className="w-full bg-bg border border-border rounded px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      className="bg-accent text-white hover:bg-accent/90 px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
                    >
                      <PlusCircle className="w-4 h-4" />
                      Add Store & Proceed to Renewal
                    </button>
                  </div>
                </form>
              )}
            </div>
          ) : (
            /* Selected Pharmacy Banner */
            <div className="p-3.5 bg-accent/5 border border-accent/20 rounded-lg flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/20 flex items-center justify-center text-accent">
                  <Building2 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-text-primary">{selectedPharmacy.business_name}</h3>
                    <span className="text-[10px] font-mono text-text-secondary uppercase">({selectedPharmacy.id})</span>
                  </div>
                  <p className="text-xs text-text-secondary">
                    Owner: <span className="text-text-primary font-medium">{selectedPharmacy.owner_name}</span> • {selectedPharmacy.state || 'Lagos'}
                  </p>
                  <p className="text-[11px] text-text-secondary mt-0.5">
                    Current Expiry: <span className="font-semibold text-text-primary">{format(new Date(selectedPharmacy.subscription_expiry), 'MMM dd, yyyy')}</span>
                    {selectedPharmacy.subscription_status === 'expired' && (
                      <span className="text-error font-medium ml-1.5">(Currently Expired)</span>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPharmacy(null)}
                className="text-xs text-text-secondary hover:text-text-primary underline px-2 py-1"
              >
                Change Store
              </button>
            </div>
          )}

          {/* STEP 2: Configure Subscription Details */}
          {selectedPharmacy && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="border-b border-border pb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  Step 2: Subscription Plan & Term
                </span>
              </div>

              {/* Plan Options */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Select Subscription Tier</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(['Basic', 'Standard', 'Premium', 'Enterprise'] as SubscriptionPlan[]).map((plan) => {
                    const price = PLAN_PRICES[plan];
                    const isSelected = selectedPlan === plan;
                    return (
                      <button
                        key={plan}
                        type="button"
                        onClick={() => setSelectedPlan(plan)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          isSelected
                            ? 'border-accent bg-accent/10 ring-1 ring-accent'
                            : 'border-border bg-bg/40 hover:border-accent/40'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-bold text-text-primary">{plan}</span>
                          {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-accent" />}
                        </div>
                        <p className="text-xs font-mono font-bold text-accent">
                          ₦{price.toLocaleString()}<span className="text-[10px] text-text-secondary font-normal">/mo</span>
                        </p>
                        <p className="text-[10px] text-text-secondary mt-1">
                          {plan === 'Basic' && '1 Counter POS'}
                          {plan === 'Standard' && '3 Counters + SMS'}
                          {plan === 'Premium' && 'Multi-branch & ERP'}
                          {plan === 'Enterprise' && 'Unlimited + Custom API'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Billing Cycle */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Renewal Duration</label>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { cycle: 'Monthly' as SubscriptionCycle, label: '1 Month', note: 'Standard rate' },
                    { cycle: 'Quarterly' as SubscriptionCycle, label: '3 Months', note: 'Save 5%' },
                    { cycle: 'Annual' as SubscriptionCycle, label: '1 Year (12 Mo)', note: 'Save 20% Popular' },
                  ].map((opt) => (
                    <button
                      key={opt.cycle}
                      type="button"
                      onClick={() => setSelectedCycle(opt.cycle)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        selectedCycle === opt.cycle
                          ? 'border-accent bg-accent/10 ring-1 ring-accent'
                          : 'border-border bg-bg/40 hover:border-accent/40'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-text-primary">{opt.label}</span>
                        {selectedCycle === opt.cycle && <CheckCircle2 className="w-3.5 h-3.5 text-accent" />}
                      </div>
                      <span className="text-[10px] text-text-secondary">{opt.note}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-xs font-medium text-text-secondary mb-2">Payment Method</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'nibss', label: 'NIBSS Instant Transfer' },
                    { id: 'card', label: 'Debit Card (Online)' },
                    { id: 'pos', label: 'POS Terminal' },
                    { id: 'transfer', label: 'Direct Bank Deposit' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setPaymentMethod(m.id as any)}
                      className={`p-2 rounded border text-center text-xs transition-colors ${
                        paymentMethod === m.id
                          ? 'border-accent bg-accent/10 text-accent font-medium'
                          : 'border-border bg-bg/30 text-text-secondary hover:text-text-primary'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary Calculation Card */}
              <div className="bg-bg/80 border border-border rounded-lg p-4 space-y-2 text-xs">
                <div className="flex justify-between text-text-secondary">
                  <span>Selected Plan:</span>
                  <span className="text-text-primary font-medium">{selectedPlan} ({selectedCycle})</span>
                </div>
                <div className="flex justify-between text-text-secondary">
                  <span>New Expiry Date:</span>
                  <span className="text-success font-semibold flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    {format(newExpiryDate, 'EEEE, MMMM do, yyyy')}
                  </span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Discount Applied ({selectedCycle}):</span>
                    <span>-₦{discount.toLocaleString()}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-border flex justify-between items-center text-sm font-bold">
                  <span className="text-text-primary">Total Renewal Fee:</span>
                  <span className="text-accent font-mono text-base">₦{totalCost.toLocaleString()} NGN</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-border flex items-center justify-between bg-card/90">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          
          <button
            type="button"
            disabled={!selectedPharmacy || isSubmitting}
            onClick={handleConfirmSubmit}
            className={`px-5 py-2.5 rounded-lg text-xs font-bold text-white flex items-center gap-2 shadow-sm transition-all ${
              !selectedPharmacy || isSubmitting
                ? 'bg-accent/40 cursor-not-allowed text-white/70'
                : 'bg-accent hover:bg-accent/90 active:scale-[0.99]'
            }`}
          >
            {isSubmitting ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                <span>Processing Renewal...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-4 h-4" />
                <span>Confirm & Activate Renewal</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
