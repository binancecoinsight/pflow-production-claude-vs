'use client';

import React, { useState, useMemo } from 'react';
import { 
  Gift, Award, Search, Filter, CheckCircle2, Clock, AlertTriangle, 
  ArrowUpDown, Download, Plus, ChevronLeft, ChevronRight, User, 
  Store, Copy, Check, ExternalLink, CreditCard, Sparkles, Building2,
  DollarSign, Package, Smartphone, RefreshCw, X, ShieldCheck, Share2,
  SlidersHorizontal, Eye, ChevronDown, LifeBuoy, Headphones, MessageSquare, Send
} from 'lucide-react';
import { 
  Referral, 
  CustomerReferrer, 
  EntitlementPreset, 
  ReferralRewardType,
  ReferralStatus,
  ReferralPayoutConfig,
  generateInitialReferralPayoutConfig,
  generateInitialEntitlementPresets,
  PLAN_PRICES,
  SupportTicket,
  TicketCategory,
  TicketPriority
} from '@/lib/mock-data';
import { format } from 'date-fns';
import ModifyReferralPayout from './ModifyReferralPayout';

interface ReferralManagerProps {
  referrals: Referral[];
  referrers: CustomerReferrer[];
  presets: EntitlementPreset[];
  payoutConfig?: ReferralPayoutConfig;
  onOpenGiveRewardModal: (referral?: Referral, referrer?: CustomerReferrer) => void;
  onVerifyReferral?: (referralId: string) => void;
  onUpdatePayoutConfig?: (newConfig: ReferralPayoutConfig, newPresets: EntitlementPreset[]) => void;
  onAddSupportTicket?: (ticket: Omit<SupportTicket, 'id' | 'created_at' | 'updated_at' | 'messages'> & { initialMessage: string }) => void;
  onNavigateToSupport?: () => void;
}

export default function ReferralManager({
  referrals,
  referrers,
  presets,
  payoutConfig = generateInitialReferralPayoutConfig(),
  onOpenGiveRewardModal,
  onVerifyReferral,
  onUpdatePayoutConfig,
  onAddSupportTicket,
  onNavigateToSupport,
}: ReferralManagerProps) {
  const [activeTab, setActiveTab] = useState<'records' | 'advocates' | 'catalog' | 'disbursements' | 'modify_payout'>('records');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ReferralStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'customer' | 'pharmacy_partner' | 'field_agent'>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');

  // Sorting
  const [sortField, setSortField] = useState<keyof Referral>('date_referred');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 8;

  // Detail Modal state
  const [selectedReferralDetail, setSelectedReferralDetail] = useState<Referral | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Client-Side Referral Menu Preview Modal state
  const [clientMenuModalOpen, setClientMenuModalOpen] = useState(false);
  const [clientMenuPerspective, setClientMenuPerspective] = useState<'pharmacy' | 'customer'>('pharmacy');
  const [simulatedStoreCount, setSimulatedStoreCount] = useState(4);
  const [claimedPresetId, setClaimedPresetId] = useState<string | null>(null);

  // Client-Side Support Ticket states
  const [clientSupportModalOpen, setClientSupportModalOpen] = useState(false);
  const [clientTicketSubject, setClientTicketSubject] = useState('');
  const [clientTicketCategory, setClientTicketCategory] = useState<TicketCategory>('Referral & Rewards');
  const [clientTicketPriority, setClientTicketPriority] = useState<TicketPriority>('high');
  const [clientTicketMessage, setClientTicketMessage] = useState('');
  const [clientTicketSubmittedId, setClientTicketSubmittedId] = useState<string | null>(null);

  const handleClientSupportSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientTicketSubject.trim() || !clientTicketMessage.trim()) return;

    const tickNum = `TICK-${Math.floor(1000 + Math.random() * 9000)}`;
    if (onAddSupportTicket) {
      onAddSupportTicket({
        ticket_number: tickNum,
        pharmacy_id: 'pharm-1',
        pharmacy_name: 'City Care Pharmacy',
        client_name: 'Pharm. Chinedu Okafor',
        client_email: 'citycare.ikeja@gmail.com',
        client_phone: '+234 803 219 4481',
        state: 'Lagos',
        subject: clientTicketSubject.trim(),
        category: clientTicketCategory,
        priority: clientTicketPriority,
        status: 'open',
        channel: 'Client Portal',
        assigned_to: 'Unassigned',
        initialMessage: clientTicketMessage.trim(),
      });
    }

    setClientTicketSubmittedId(tickNum);
    setClientTicketSubject('');
    setClientTicketMessage('');
    setTimeout(() => {
      setClientTicketSubmittedId(null);
      setClientSupportModalOpen(false);
    }, 2800);
  };

  // Copy code helper
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  // Metrics
  const totalReferrals = referrals.length;
  const convertedReferrals = useMemo(() => referrals.filter(r => r.status === 'converted' || r.status === 'rewarded').length, [referrals]);
  const conversionRate = totalReferrals > 0 ? ((convertedReferrals / totalReferrals) * 100).toFixed(1) : '0';
  
  const totalValueDriven = useMemo(() => {
    return referrals.reduce((acc, r) => acc + (r.order_value_ngn || 0), 0);
  }, [referrals]);

  const totalRewardsDisbursed = useMemo(() => {
    return referrals.reduce((acc, r) => {
      if (r.reward_details?.value_ngn) return acc + r.reward_details.value_ngn;
      return acc;
    }, 0);
  }, [referrals]);

  const pendingRewardsCount = useMemo(() => {
    return referrals.filter(r => r.status === 'converted' && r.reward_status === 'unclaimed').length;
  }, [referrals]);

  // Unique Nigerian states from referrals
  const uniqueStates = useMemo(() => {
    const states = new Set(referrals.map(r => r.state));
    return Array.from(states);
  }, [referrals]);

  // Filtered referrals
  const filteredReferrals = useMemo(() => {
    return referrals
      .filter(r => {
        // Status filter
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        // Referrer type filter
        if (typeFilter !== 'all' && r.referrer_type !== typeFilter) return false;
        // State filter
        if (stateFilter !== 'all' && r.state !== stateFilter) return false;

        // Search
        if (search.trim()) {
          const q = search.toLowerCase();
          const inReferrer = r.referrer_name.toLowerCase().includes(q);
          const inReferred = r.referred_name.toLowerCase().includes(q);
          const inCode = r.referral_code.toLowerCase().includes(q);
          const inPhone = r.referrer_phone.includes(q) || r.referred_phone.includes(q);
          const inState = r.state.toLowerCase().includes(q);
          if (!inReferrer && !inReferred && !inCode && !inPhone && !inState) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => {
        const aVal = a[sortField] ?? '';
        const bVal = b[sortField] ?? '';
        if (aVal < bVal) return sortOrder === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortOrder === 'asc' ? 1 : -1;
        return 0;
      });
  }, [referrals, statusFilter, typeFilter, stateFilter, search, sortField, sortOrder]);

  // Paginated records
  const totalPages = Math.ceil(filteredReferrals.length / itemsPerPage) || 1;
  const paginatedReferrals = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredReferrals.slice(start, start + itemsPerPage);
  }, [filteredReferrals, currentPage]);

  // All rewarded referrals for the disbursement log
  const rewardedReferrals = useMemo(() => {
    return referrals.filter(r => r.reward_details !== undefined);
  }, [referrals]);

  // Handle Sort
  const toggleSort = (field: keyof Referral) => {
    if (sortField === field) {
      setSortOrder(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      'Referral ID',
      'Referrer Name',
      'Referrer Code',
      'Referrer Phone',
      'Referrer Type',
      'Referred Store/Customer',
      'State',
      'Referred Date',
      'Status',
      'Converted Plan',
      'Order Value (NGN)',
      'Reward Status',
      'Reward Entitlement',
      'Reward Value (NGN)'
    ];

    const rows = filteredReferrals.map(r => [
      r.id,
      `"${r.referrer_name}"`,
      r.referral_code,
      r.referrer_phone,
      r.referrer_type,
      `"${r.referred_name}"`,
      `"${r.state}"`,
      r.date_referred,
      r.status,
      r.subscription_plan || 'N/A',
      r.order_value_ngn || 0,
      r.reward_status,
      `"${r.reward_details?.entitlement_title || r.eligible_reward_title || 'N/A'}"`,
      r.reward_details?.value_ngn || r.eligible_reward_value || 0
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pharmacyflow_referrals_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getStatusBadge = (status: ReferralStatus) => {
    switch (status) {
      case 'converted':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 rounded-md">
            <CheckCircle2 className="w-3 h-3" />
            Converted
          </span>
        );
      case 'rewarded':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-400 bg-teal-500/15 border border-teal-500/30 px-2 py-0.5 rounded-md">
            <Gift className="w-3 h-3" />
            Rewarded
          </span>
        );
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-400 bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 rounded-md">
            <Clock className="w-3 h-3" />
            Pending Verification
          </span>
        );
      case 'expired':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-text-secondary bg-white/5 border border-border px-2 py-0.5 rounded-md">
            <AlertTriangle className="w-3 h-3" />
            Expired
          </span>
        );
    }
  };

  const getRewardTypeIcon = (type?: ReferralRewardType) => {
    switch (type) {
      case 'cash_transfer':
        return <DollarSign className="w-3.5 h-3.5 text-emerald-400" />;
      case 'subscription_credit':
        return <CreditCard className="w-3.5 h-3.5 text-accent" />;
      case 'drug_voucher':
        return <Package className="w-3.5 h-3.5 text-amber-400" />;
      case 'hardware_perk':
        return <Smartphone className="w-3.5 h-3.5 text-purple-400" />;
      case 'sms_bundle':
        return <Sparkles className="w-3.5 h-3.5 text-cyan-400" />;
      default:
        return <Gift className="w-3.5 h-3.5 text-accent" />;
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      
      {/* Header and Action Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shadow-sm">
              <Gift className="w-5 h-5" />
            </div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
              Customer Referrals &amp; Entitlements
            </h1>
            {pendingRewardsCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {pendingRewardsCount} REWARDS DUE
              </span>
            )}
          </div>
          <p className="text-xs sm:text-sm text-text-secondary max-w-2xl">
            Monitor verified word-of-mouth store signups, track top customer advocates, and dispense cash incentives, free license months, or wholesale supply vouchers.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveTab('modify_payout')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border shadow-sm ${
              activeTab === 'modify_payout'
                ? 'bg-purple-600 text-white border-purple-500 font-bold'
                : 'border-purple-500/40 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
            <span>Modify Referral Amount or Payout</span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-200 font-bold uppercase tracking-wider font-mono">
              Super Admin
            </span>
          </button>

          <button
            onClick={() => setClientMenuModalOpen(true)}
            className="border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-sm"
            title="Preview how updated referral rewards reflect on the client-side referral menu"
          >
            <Eye className="w-3.5 h-3.5" />
            <span>View Client-Side Referral Menu</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          </button>

          <button
            onClick={handleExportCSV}
            className="border border-border bg-card hover:bg-white/5 text-text-primary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => onOpenGiveRewardModal()}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Give Out Reward / Entitlement</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">Total Referrals</span>
            <Share2 className="w-4 h-4 text-accent" />
          </div>
          <p className="text-2xl font-bold font-mono text-text-primary mt-1">{totalReferrals}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">Across {uniqueStates.length} Nigerian states</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">Converted Stores</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-400 mt-1">{convertedReferrals}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">{conversionRate}% conversion rate</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">Orders &amp; Licenses Driven</span>
            <Store className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-text-primary mt-1">₦{(totalValueDriven / 1000).toLocaleString()}k</p>
          <p className="text-[11px] text-text-secondary mt-0.5">New pharmacy subscription GMV</p>
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text-secondary">Disbursed Incentives</span>
            <Gift className="w-4 h-4 text-teal-400" />
          </div>
          <p className="text-2xl font-bold font-mono text-teal-400 mt-1">₦{totalRewardsDisbursed.toLocaleString()}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {pendingRewardsCount > 0 ? (
              <span className="text-amber-400 font-semibold">{pendingRewardsCount} payouts pending</span>
            ) : (
              'All eligible rewards settled'
            )}
          </p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex items-center gap-1 border-b border-border text-xs font-semibold overflow-x-auto">
        <button
          onClick={() => setActiveTab('records')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'records'
              ? 'border-accent text-accent font-bold bg-accent/5'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          <span>Referral Records ({referrals.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('advocates')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'advocates'
              ? 'border-accent text-accent font-bold bg-accent/5'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          <span>Top Advocates &amp; Partners ({referrers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('catalog')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'catalog'
              ? 'border-accent text-accent font-bold bg-accent/5'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Incentives &amp; Entitlements Catalog ({presets.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('disbursements')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'disbursements'
              ? 'border-accent text-accent font-bold bg-accent/5'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Gift className="w-3.5 h-3.5" />
          <span>Disbursement Audit Trail ({rewardedReferrals.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('modify_payout')}
          className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'modify_payout'
              ? 'border-purple-500 text-purple-400 font-bold bg-purple-500/10'
              : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5 text-purple-400" />
          <span>Modify Referral Amount or Payout</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 uppercase tracking-wider font-mono">
            Super Admin
          </span>
        </button>
      </div>

      {/* TAB 1: ALL REFERRAL RECORDS */}
      {activeTab === 'records' && (
        <div className="space-y-4">
          {/* Filters & Search */}
          <div className="bg-card border border-border rounded-xl p-3.5 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
              <input
                type="text"
                placeholder="Search by referrer, referee pharmacy, referral code, or phone..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full bg-bg border border-border rounded-lg pl-9 pr-3 py-1.5 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
              />
            </div>

            {/* Quick Status Filters */}
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All Statuses</option>
                <option value="converted">Converted Only</option>
                <option value="rewarded">Rewarded / Settled</option>
                <option value="pending">Pending Verification</option>
                <option value="expired">Expired</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => {
                  setTypeFilter(e.target.value as any);
                  setCurrentPage(1);
                }}
                className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All Referrer Types</option>
                <option value="pharmacy_partner">Pharmacy Partners</option>
                <option value="customer">Customer Advocates</option>
                <option value="field_agent">Field Agents</option>
              </select>

              <select
                value={stateFilter}
                onChange={(e) => {
                  setStateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="bg-bg border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
              >
                <option value="all">All States</option>
                {uniqueStates.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Referrals Data Table */}
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg/60 border-b border-border text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('referrer_name')}>
                      <div className="flex items-center gap-1.5">
                        <span>Referrer</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('referred_name')}>
                      <div className="flex items-center gap-1.5">
                        <span>Referred Store / Customer</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('status')}>
                      <div className="flex items-center gap-1.5">
                        <span>Status</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </div>
                    </th>
                    <th className="py-3 px-4 cursor-pointer select-none" onClick={() => toggleSort('order_value_ngn')}>
                      <div className="flex items-center gap-1.5">
                        <span>Plan &amp; Value</span>
                        <ArrowUpDown className="w-3 h-3 opacity-60" />
                      </div>
                    </th>
                    <th className="py-3 px-4">Entitlement &amp; Incentive</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {paginatedReferrals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-text-secondary">
                        <div className="flex flex-col items-center justify-center gap-2">
                          <Gift className="w-8 h-8 text-text-secondary/40" />
                          <p className="font-semibold text-sm">No referrals match the selected criteria.</p>
                          <p className="text-xs text-text-secondary/70">Try modifying your search or clearing the status filters.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    paginatedReferrals.map((ref) => {
                      const isRewarded = ref.status === 'rewarded';
                      const isEligibleForReward = ref.status === 'converted' && ref.reward_status === 'unclaimed';

                      return (
                        <tr key={ref.id} className="hover:bg-white/[0.02] transition-colors group">
                          {/* Referrer Info */}
                          <td className="py-3.5 px-4">
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-text-primary">{ref.referrer_name}</span>
                                <span className="text-[9px] px-1.5 py-0.2 rounded uppercase font-bold bg-white/5 border border-border text-text-secondary">
                                  {ref.referrer_type === 'pharmacy_partner' ? 'Pharmacy' : ref.referrer_type === 'field_agent' ? 'Agent' : 'Customer'}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 mt-0.5 text-[11px] text-text-secondary">
                                <button
                                  onClick={() => handleCopy(ref.referral_code)}
                                  className="font-mono text-accent hover:underline flex items-center gap-1 text-[10px]"
                                  title="Click to copy referral code"
                                >
                                  {copiedCode === ref.referral_code ? <Check className="w-2.5 h-2.5 text-success" /> : <Copy className="w-2.5 h-2.5" />}
                                  <span>{ref.referral_code}</span>
                                </button>
                                <span>·</span>
                                <span>{ref.referrer_phone}</span>
                              </div>
                            </div>
                          </td>

                          {/* Referred Customer / Store */}
                          <td className="py-3.5 px-4">
                            <div>
                              <span className="font-semibold text-text-primary block">{ref.referred_name}</span>
                              <div className="text-[11px] text-text-secondary flex items-center gap-2 mt-0.5">
                                <span className="text-text-secondary">{ref.state}</span>
                                <span>·</span>
                                <span>{format(new Date(ref.date_referred), 'MMM dd, yyyy')}</span>
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-4">
                            {getStatusBadge(ref.status)}
                          </td>

                          {/* Plan & Value */}
                          <td className="py-3.5 px-4">
                            {ref.subscription_plan ? (
                              <div>
                                <span className="font-semibold text-text-primary block">{ref.subscription_plan} Tier</span>
                                <span className="font-mono text-[11px] text-emerald-400 font-bold">
                                  ₦{(ref.order_value_ngn || 0).toLocaleString()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-text-secondary text-[11px]">Free Trial / Awaiting</span>
                            )}
                          </td>

                          {/* Entitlement & Incentive */}
                          <td className="py-3.5 px-4">
                            {ref.reward_details ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 font-semibold text-text-primary">
                                  {getRewardTypeIcon(ref.reward_details.reward_type)}
                                  <span className="truncate max-w-[180px]">{ref.reward_details.entitlement_title}</span>
                                </div>
                                <div className="text-[10px] text-text-secondary flex items-center gap-2 font-mono">
                                  <span className="text-teal-400 font-bold">₦{ref.reward_details.value_ngn.toLocaleString()}</span>
                                  {ref.reward_details.voucher_code && (
                                    <span className="text-accent">{ref.reward_details.voucher_code}</span>
                                  )}
                                </div>
                              </div>
                            ) : ref.eligible_reward_title ? (
                              <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 text-text-secondary font-medium">
                                  {getRewardTypeIcon(ref.eligible_reward_type)}
                                  <span className="truncate max-w-[180px]">{ref.eligible_reward_title}</span>
                                </div>
                                <div className="text-[10px] font-mono text-amber-400">
                                  Eligible: ₦{(ref.eligible_reward_value || 0).toLocaleString()}
                                </div>
                              </div>
                            ) : (
                              <span className="text-text-secondary text-[11px]">Standard Tier Perk</span>
                            )}
                          </td>

                          {/* Action Buttons */}
                          <td className="py-3.5 px-4 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Reward button if eligible */}
                              {isEligibleForReward ? (
                                <button
                                  onClick={() => onOpenGiveRewardModal(ref)}
                                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-2.5 py-1 rounded-md text-[11px] font-bold flex items-center gap-1 shadow-sm transition-colors"
                                >
                                  <Gift className="w-3 h-3" />
                                  <span>Give Reward</span>
                                </button>
                              ) : (
                                <button
                                  onClick={() => onOpenGiveRewardModal(ref)}
                                  className="border border-border hover:bg-white/5 text-text-secondary hover:text-text-primary px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors"
                                  title="Add or upgrade incentive"
                                >
                                  <Gift className="w-3 h-3 text-text-secondary" />
                                  <span className="hidden sm:inline">Incentive</span>
                                </button>
                              )}

                              <button
                                onClick={() => setSelectedReferralDetail(ref)}
                                className="p-1 hover:bg-white/10 rounded text-text-secondary hover:text-text-primary transition-colors"
                                title="View full referral details"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination footer */}
            <div className="p-3 border-t border-border flex items-center justify-between text-xs text-text-secondary bg-bg/40">
              <span>
                Showing {Math.min(filteredReferrals.length, (currentPage - 1) * itemsPerPage + 1)} to {Math.min(filteredReferrals.length, currentPage * itemsPerPage)} of {filteredReferrals.length} entries
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-1.5 rounded border border-border disabled:opacity-30 hover:bg-white/5 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 font-mono text-[11px] font-bold text-text-primary">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className="p-1.5 rounded border border-border disabled:opacity-30 hover:bg-white/5 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TOP ADVOCATES & PARTNERS */}
      {activeTab === 'advocates' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Referral Advocates Leaderboard</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Pharmacists and healthcare ambassadors driving the largest pharmacy footprint in Nigeria.
              </p>
            </div>
            <button
              onClick={() => onOpenGiveRewardModal()}
              className="bg-accent hover:bg-accent/90 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Gift className="w-3.5 h-3.5" />
              <span>Disburse Advocate Bonus</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {referrers.map((advocate, idx) => (
              <div 
                key={advocate.id}
                className="bg-card border border-border rounded-xl p-4 space-y-3.5 relative overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-accent/15 border border-accent/30 text-accent font-bold flex items-center justify-center text-sm shadow-sm">
                        #{idx + 1}
                      </div>
                      <div>
                        <h4 className="font-bold text-text-primary text-xs sm:text-sm">{advocate.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                            advocate.tier === 'Platinum' ? 'bg-purple-500/15 text-purple-400 border border-purple-500/30' :
                            advocate.tier === 'Gold' ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30' :
                            'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                          }`}>
                            {advocate.tier} Tier
                          </span>
                          <span className="text-[10px] text-text-secondary capitalize">
                            {advocate.type.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Referral Code Box */}
                  <div className="mt-3 bg-bg/60 border border-border/80 rounded-lg p-2.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[10px] text-text-secondary block">Advocate Referral Code</span>
                      <span className="font-mono font-bold text-accent tracking-wider">{advocate.referral_code}</span>
                    </div>
                    <button
                      onClick={() => handleCopy(advocate.referral_code)}
                      className="p-1 hover:bg-white/10 rounded text-text-secondary hover:text-text-primary transition-colors"
                      title="Copy code"
                    >
                      {copiedCode === advocate.referral_code ? <Check className="w-3.5 h-3.5 text-success" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Performance Grid */}
                  <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border/60 text-center">
                    <div>
                      <span className="text-[10px] text-text-secondary block">Total Referred</span>
                      <span className="font-mono font-bold text-text-primary text-xs">{advocate.total_referrals}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-secondary block">Converted</span>
                      <span className="font-mono font-bold text-emerald-400 text-xs">{advocate.converted_referrals}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-text-secondary block">Rewards Earned</span>
                      <span className="font-mono font-bold text-accent text-xs">₦{(advocate.total_earned_ngn / 1000).toLocaleString()}k</span>
                    </div>
                  </div>

                  {/* Bank info */}
                  <div className="mt-3 text-[11px] text-text-secondary">
                    <span className="block text-[10px] uppercase font-semibold text-text-secondary/70">NUBAN Payout</span>
                    <span className="font-mono font-semibold text-text-primary">{advocate.bank_details.bank_name}</span> · <span className="font-mono text-accent">{advocate.bank_details.account_number}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => onOpenGiveRewardModal(undefined, advocate)}
                    className="w-full bg-accent/15 hover:bg-accent/25 text-accent border border-accent/30 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>Disburse Incentive to {advocate.name.split(' ')[0]}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: INCENTIVES & ENTITLEMENTS CATALOG */}
      {activeTab === 'catalog' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Standard Incentive Packages</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Pre-configured rewards and entitlements that administrators can issue to referring pharmacies and customers.
              </p>
            </div>
            <button
              onClick={() => onOpenGiveRewardModal()}
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Custom Disbursement</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {presets.map((preset) => (
              <div 
                key={preset.id}
                className="bg-card border border-border rounded-xl p-4 space-y-3 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center">
                        {getRewardTypeIcon(preset.category)}
                      </div>
                      <div>
                        <h4 className="font-bold text-text-primary text-xs sm:text-sm">{preset.title}</h4>
                        <span className="text-[10px] text-text-secondary capitalize">
                          {preset.category.replace('_', ' ')}
                        </span>
                      </div>
                    </div>
                    <span className="font-mono font-bold text-emerald-400 text-sm">
                      ₦{preset.value_ngn.toLocaleString()}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary mt-3 leading-relaxed">
                    {preset.description}
                  </p>

                  <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between text-[11px]">
                    <span className="text-text-secondary">Eligibility:</span>
                    <span className="font-semibold text-text-primary">{preset.tier_eligibility}</span>
                  </div>
                </div>

                <div className="pt-2">
                  <button
                    onClick={() => {
                      onOpenGiveRewardModal();
                    }}
                    className="w-full bg-emerald-600/15 hover:bg-emerald-600/25 text-emerald-400 border border-emerald-600/30 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Gift className="w-3.5 h-3.5" />
                    <span>Disburse This Entitlement</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 4: DISBURSEMENT AUDIT LOG */}
      {activeTab === 'disbursements' && (
        <div className="space-y-4">
          <div className="bg-card border border-border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-text-primary">Referral Entitlement Ledger</h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Immutable audit record of all cash payouts, software license credits, and equipment perks issued.
              </p>
            </div>
            <button
              onClick={handleExportCSV}
              className="border border-border bg-bg hover:bg-white/5 text-text-primary px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Ledger CSV</span>
            </button>
          </div>

          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-bg/60 border-b border-border text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                    <th className="py-3 px-4">Date &amp; Time</th>
                    <th className="py-3 px-4">Beneficiary</th>
                    <th className="py-3 px-4">Entitlement Granted</th>
                    <th className="py-3 px-4">Value (NGN)</th>
                    <th className="py-3 px-4">Reference / Voucher</th>
                    <th className="py-3 px-4">Disbursed By</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rewardedReferrals.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-text-secondary">
                        No disbursements recorded yet.
                      </td>
                    </tr>
                  ) : (
                    rewardedReferrals.map((ref) => {
                      const details = ref.reward_details!;
                      return (
                        <tr key={ref.id} className="hover:bg-white/[0.02]">
                          <td className="py-3 px-4 font-mono text-[11px] text-text-secondary">
                            {format(new Date(details.disbursed_at), 'yyyy-MM-dd HH:mm')}
                          </td>
                          <td className="py-3 px-4">
                            <div>
                              <span className="font-bold text-text-primary">{ref.referrer_name}</span>
                              <span className="text-[10px] text-text-secondary block font-mono">
                                For: {ref.referred_name}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-1.5 font-semibold text-text-primary">
                              {getRewardTypeIcon(details.reward_type)}
                              <span>{details.entitlement_title}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 font-mono font-bold text-emerald-400">
                            ₦{details.value_ngn.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-mono text-accent text-[11px]">
                            {details.voucher_code || details.account_number ? (
                              <span>{details.voucher_code || `NUBAN: ${details.account_number}`}</span>
                            ) : (
                              'N/A'
                            )}
                          </td>
                          <td className="py-3 px-4 text-text-secondary text-[11px]">
                            {details.disbursed_by}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MODIFY REFERRAL AMOUNT OR PAYOUT (SUPER ADMIN) */}
      {activeTab === 'modify_payout' && (
        <ModifyReferralPayout 
          config={payoutConfig}
          presets={presets}
          onSaveConfig={(newConfig, newPresets) => {
            if (onUpdatePayoutConfig) {
              onUpdatePayoutConfig(newConfig, newPresets);
            }
          }}
          onResetDefaults={() => {
            if (onUpdatePayoutConfig) {
              onUpdatePayoutConfig(generateInitialReferralPayoutConfig(), generateInitialEntitlementPresets());
            }
          }}
        />
      )}

      {/* POPUP: Full Referral Detail Modal */}
      {selectedReferralDetail && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-border flex items-center justify-between bg-bg/50">
              <div className="flex items-center gap-2">
                <Gift className="w-4 h-4 text-accent" />
                <h3 className="font-bold text-sm text-text-primary">Referral Detail &amp; Verification Card</h3>
              </div>
              <button
                onClick={() => setSelectedReferralDetail(null)}
                className="p-1 text-text-secondary hover:text-text-primary rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 bg-bg/60 p-3 rounded-xl border border-border/60">
                <div>
                  <span className="text-[10px] text-text-secondary uppercase font-semibold">Advocate Referrer</span>
                  <p className="font-bold text-text-primary mt-0.5">{selectedReferralDetail.referrer_name}</p>
                  <p className="text-text-secondary text-[11px]">{selectedReferralDetail.referrer_phone}</p>
                  <p className="font-mono text-accent text-[11px] mt-1">Code: {selectedReferralDetail.referral_code}</p>
                </div>
                <div>
                  <span className="text-[10px] text-text-secondary uppercase font-semibold">Referred Beneficiary</span>
                  <p className="font-bold text-text-primary mt-0.5">{selectedReferralDetail.referred_name}</p>
                  <p className="text-text-secondary text-[11px]">{selectedReferralDetail.referred_phone}</p>
                  <p className="text-text-secondary text-[11px]">{selectedReferralDetail.state}</p>
                </div>
              </div>

              {/* Status and Milestones */}
              <div className="space-y-2 border-t border-border pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Referral Timestamp:</span>
                  <span className="font-mono text-text-primary">{format(new Date(selectedReferralDetail.date_referred), 'PPpp')}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-text-secondary">Conversion Status:</span>
                  <div>{getStatusBadge(selectedReferralDetail.status)}</div>
                </div>
                {selectedReferralDetail.subscription_plan && (
                  <div className="flex items-center justify-between">
                    <span className="text-text-secondary">Onboarded Plan:</span>
                    <span className="font-bold text-text-primary">{selectedReferralDetail.subscription_plan} (₦{(selectedReferralDetail.order_value_ngn || 0).toLocaleString()})</span>
                  </div>
                )}
              </div>

              {/* Entitlement Info */}
              {selectedReferralDetail.reward_details ? (
                <div className="bg-emerald-500/10 border border-emerald-500/30 p-3 rounded-xl space-y-1.5">
                  <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Disbursed Incentive Information</span>
                  </div>
                  <p className="font-semibold text-text-primary text-xs">
                    {selectedReferralDetail.reward_details.entitlement_title}
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-[11px] text-text-secondary font-mono mt-1">
                    <div>Value: <span className="text-emerald-400 font-bold">₦{selectedReferralDetail.reward_details.value_ngn.toLocaleString()}</span></div>
                    <div>Ref / Voucher: <span className="text-accent">{selectedReferralDetail.reward_details.voucher_code || selectedReferralDetail.reward_details.account_number || 'Direct Credit'}</span></div>
                  </div>
                  {selectedReferralDetail.reward_details.notes && (
                    <p className="text-[11px] text-text-secondary italic mt-1">
                      Note: {selectedReferralDetail.reward_details.notes}
                    </p>
                  )}
                </div>
              ) : (
                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-xl flex items-center justify-between">
                  <div>
                    <span className="font-bold text-amber-400 block">Reward Entitlement Pending</span>
                    <span className="text-text-secondary text-[11px]">
                      {selectedReferralDetail.eligible_reward_title || '₦10,000 Payout'} ready for issuance.
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      const ref = selectedReferralDetail;
                      setSelectedReferralDetail(null);
                      onOpenGiveRewardModal(ref);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold"
                  >
                    Disburse Now
                  </button>
                </div>
              )}
            </div>

            <div className="p-3 border-t border-border flex justify-end bg-bg/40">
              <button
                onClick={() => setSelectedReferralDetail(null)}
                className="px-4 py-1.5 bg-card border border-border rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* POPUP MODAL: Interactive Client-Side Referral Menu */}
      {clientMenuModalOpen && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md overflow-y-auto">
          <div className="bg-card border-2 border-emerald-500/30 rounded-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-150 custom-scrollbar">
            
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-bg/60 sticky top-0 z-20 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <Eye className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-base text-text-primary">
                      Client-Facing Referral Menu (Live Preview)
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-mono flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Reflecting Super Admin Rules
                    </span>
                  </div>
                  <p className="text-xs text-text-secondary mt-0.5">
                    This is the exact interface pharmacy owners and advocates see when they click &quot;Referrals &amp; Earn&quot; on their client portal.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-center">
                {/* Switch perspective toggle */}
                <div className="bg-bg border border-border rounded-lg p-0.5 flex items-center text-xs">
                  <button
                    onClick={() => setClientMenuPerspective('pharmacy')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      clientMenuPerspective === 'pharmacy'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Pharmacy Partner
                  </button>
                  <button
                    onClick={() => setClientMenuPerspective('customer')}
                    className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                      clientMenuPerspective === 'customer'
                        ? 'bg-accent text-white shadow-sm'
                        : 'text-text-secondary hover:text-text-primary'
                    }`}
                  >
                    Patient Advocate
                  </button>
                </div>

                <button
                  onClick={() => setClientMenuModalOpen(false)}
                  className="p-1.5 text-text-secondary hover:text-text-primary rounded-lg hover:bg-white/5"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body: Client View Mockup */}
            <div className="p-4 sm:p-6 space-y-6">
              
              {/* Client Hero Announcement Card */}
              <div className="bg-gradient-to-r from-emerald-500/20 via-accent/15 to-purple-500/15 border border-emerald-500/30 rounded-2xl p-5 sm:p-7 relative overflow-hidden">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase font-mono tracking-wider">
                    Official Advocate Rewards
                  </span>
                  <span className="text-[11px] font-mono text-text-secondary">
                    Settlement: <strong className="text-text-primary">{payoutConfig.payout_schedule}</strong>
                  </span>
                </div>

                <h2 className="text-xl sm:text-2xl font-black text-text-primary tracking-tight">
                  {payoutConfig.terms_headline}
                </h2>
                <p className="text-xs sm:text-sm text-text-secondary mt-1.5 max-w-2xl leading-relaxed">
                  {payoutConfig.terms_subtitle}
                </p>

                {/* Live Rates Highlight Badges */}
                <div className="mt-5 pt-4 border-t border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="bg-bg/40 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-text-secondary block">
                      {clientMenuPerspective === 'pharmacy' ? 'Store Bounty' : 'Patient Bounty'}
                    </span>
                    <span className="text-sm font-bold font-mono text-emerald-400 mt-0.5 block">
                      ₦{clientMenuPerspective === 'pharmacy' 
                        ? payoutConfig.base_store_payout_ngn.toLocaleString() 
                        : payoutConfig.base_customer_payout_ngn.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-text-secondary">per verified referee</span>
                  </div>

                  <div className="bg-bg/40 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-text-secondary block">Plan Commission</span>
                    <span className="text-sm font-bold font-mono text-purple-300 mt-0.5 block">
                      {payoutConfig.commission_percentage}% Gross
                    </span>
                    <span className="text-[10px] text-text-secondary">1st year recurring fee</span>
                  </div>

                  <div className="bg-bg/40 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-text-secondary block">Min Withdrawal</span>
                    <span className="text-sm font-bold font-mono text-text-primary mt-0.5 block">
                      ₦{payoutConfig.min_withdrawal_threshold_ngn.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-text-secondary">direct to bank</span>
                  </div>

                  <div className="bg-bg/40 p-2.5 rounded-xl border border-white/5">
                    <span className="text-[10px] text-text-secondary block">Your Current Tier</span>
                    <span className="text-sm font-bold text-amber-400 mt-0.5 block">
                      Silver Advocate
                    </span>
                    <span className="text-[10px] font-mono text-emerald-400">
                      +₦{payoutConfig.tier_payouts.silver_ngn.toLocaleString()} Milestone
                    </span>
                  </div>
                </div>
              </div>

              {/* Client Referral Code & Sharing Card */}
              <div className="bg-card border border-border rounded-xl p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Share2 className="w-4 h-4 text-accent" />
                    <h4 className="text-sm font-bold text-text-primary">Your Unique Referral Invitation Code</h4>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Share your personalized code with pharmacy colleagues, hospital dispensaries, or chemists. You earn <strong>₦{payoutConfig.base_store_payout_ngn.toLocaleString()}</strong> instantly when they subscribe.
                  </p>
                  <div className="flex items-center gap-2 pt-1">
                    <div className="bg-bg border-2 border-dashed border-accent/60 rounded-xl px-4 py-2 font-mono font-black text-sm tracking-wider text-accent flex items-center gap-2">
                      <span>PHARM-LAG-8821</span>
                    </div>
                    <button
                      onClick={() => handleCopy('PHARM-LAG-8821')}
                      className="px-3 py-2 bg-accent hover:bg-accent/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      {copiedCode === 'PHARM-LAG-8821' ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-white" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Code</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <div className="bg-bg/60 border border-border/80 rounded-xl p-3.5 space-y-2 text-xs">
                  <span className="text-[11px] font-bold text-text-secondary uppercase block">
                    Instant Share Channels
                  </span>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <button
                      onClick={() => {
                        handleCopy(`Join PharmacyFlow cloud POS using my code PHARM-LAG-8821 and get verified stock discounts: https://pharmacyflow.ng/ref/PHARM-LAG-8821`);
                      }}
                      className="flex-1 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded-lg py-2 px-3 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                      <span>WhatsApp Invite Link</span>
                    </button>
                    <button
                      onClick={() => {
                        handleCopy(`https://pharmacyflow.ng/ref/PHARM-LAG-8821`);
                      }}
                      className="flex-1 bg-card hover:bg-white/5 border border-border rounded-lg py-2 px-3 text-xs font-semibold text-text-primary flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Web Link</span>
                    </button>
                  </div>
                  <span className="text-[10px] text-text-secondary block italic">
                    Referral link: https://pharmacyflow.ng/ref/PHARM-LAG-8821
                  </span>
                </div>
              </div>

              {/* Client Live Earnings Simulator */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-border">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-emerald-400" />
                      <span>Interactive Client Earnings Calculator</span>
                    </h4>
                    <p className="text-xs text-text-secondary">
                      Estimates your cash payout based on current super admin configured rates.
                    </p>
                  </div>
                  <span className="text-xs font-bold font-mono text-accent bg-accent/10 px-2.5 py-1 rounded-lg border border-accent/20">
                    {simulatedStoreCount} Referred Pharmacies
                  </span>
                </div>

                <div className="space-y-3">
                  <input
                    type="range"
                    min="1"
                    max="20"
                    value={simulatedStoreCount}
                    onChange={(e) => setSimulatedStoreCount(Number(e.target.value))}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <div className="flex items-center justify-between text-[11px] text-text-secondary font-mono">
                    <span>1 Store (Bronze)</span>
                    <span>5 Stores (Silver)</span>
                    <span>10 Stores (Gold)</span>
                    <span>20 Stores (Platinum)</span>
                  </div>
                </div>

                {/* Calculation Cards */}
                {(() => {
                  const bountyPerStore = clientMenuPerspective === 'pharmacy' ? payoutConfig.base_store_payout_ngn : payoutConfig.base_customer_payout_ngn;
                  const directBounty = simulatedStoreCount * bountyPerStore;
                  const avgPlanPrice = 65000;
                  const commissionSum = Math.round(simulatedStoreCount * avgPlanPrice * (payoutConfig.commission_percentage / 100));
                  const totalEst = directBounty + commissionSum;
                  
                  let tierName = 'Bronze';
                  let tierBonus = payoutConfig.tier_payouts.bronze_ngn;
                  if (simulatedStoreCount >= 20) {
                    tierName = 'Platinum';
                    tierBonus = payoutConfig.tier_payouts.platinum_ngn;
                  } else if (simulatedStoreCount >= 10) {
                    tierName = 'Gold';
                    tierBonus = payoutConfig.tier_payouts.gold_ngn;
                  } else if (simulatedStoreCount >= 5) {
                    tierName = 'Silver';
                    tierBonus = payoutConfig.tier_payouts.silver_ngn;
                  }

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
                      <div className="bg-bg/70 p-3.5 rounded-xl border border-border/70">
                        <span className="text-[10px] text-text-secondary uppercase font-semibold block">Instant Cash Bounty</span>
                        <span className="text-base font-bold font-mono text-emerald-400 block mt-1">
                          ₦{directBounty.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-text-secondary">₦{bountyPerStore.toLocaleString()} × {simulatedStoreCount} stores</span>
                      </div>

                      <div className="bg-bg/70 p-3.5 rounded-xl border border-border/70">
                        <span className="text-[10px] text-text-secondary uppercase font-semibold block">1st Year Commission ({payoutConfig.commission_percentage}%)</span>
                        <span className="text-base font-bold font-mono text-purple-400 block mt-1">
                          ₦{commissionSum.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-text-secondary">From annual subscription fees</span>
                      </div>

                      <div className="bg-emerald-500/10 p-3.5 rounded-xl border border-emerald-500/30">
                        <span className="text-[10px] text-emerald-400 uppercase font-semibold block">Total Estimated Earnings</span>
                        <span className="text-lg font-bold font-mono text-emerald-400 block mt-1">
                          ₦{totalEst.toLocaleString()}
                        </span>
                        <span className="text-[10px] text-text-secondary">Unlocked Tier: <strong className="text-amber-400">{tierName}</strong> (₦{tierBonus.toLocaleString()})</span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Client Reward Packages Catalog (Live from Super Admin Presets) */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div>
                    <h4 className="text-sm font-bold text-text-primary flex items-center gap-2">
                      <Package className="w-4 h-4 text-accent" />
                      <span>Available Entitlements &amp; Reward Packages</span>
                    </h4>
                    <p className="text-xs text-text-secondary">
                      Advocates can choose any of these perks once their referral is verified. Configured by Super Admin.
                    </p>
                  </div>
                  <span className="text-[10px] font-mono text-text-secondary bg-white/5 px-2 py-0.5 rounded">
                    {presets.length} Active Packages
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {presets.map((preset) => (
                    <div
                      key={preset.id}
                      className="bg-bg/60 border border-border rounded-xl p-4 flex flex-col justify-between space-y-3 hover:border-accent/40 transition-colors"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-bold text-xs sm:text-sm text-text-primary">{preset.title}</span>
                          <span className="text-[10px] font-mono uppercase bg-white/5 px-1.5 py-0.5 rounded text-text-secondary">
                            {preset.category.replace('_', ' ')}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-secondary mt-1 leading-relaxed">
                          {preset.description}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-border/60 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-text-secondary block">Value</span>
                          <span className="font-mono font-bold text-emerald-400 text-xs">
                            ₦{preset.value_ngn.toLocaleString()}
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            setClaimedPresetId(preset.id);
                            setTimeout(() => setClaimedPresetId(null), 3000);
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            claimedPresetId === preset.id
                              ? 'bg-emerald-600 text-white'
                              : 'bg-accent/20 hover:bg-accent/30 text-accent border border-accent/40'
                          }`}
                        >
                          {claimedPresetId === preset.id ? 'Claimed! (Simulated)' : 'Claim Perk'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Client-Facing Support & Assistance Section */}
              <div className="bg-card border border-border rounded-xl p-5 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center">
                      <LifeBuoy className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-text-primary">
                        Have Questions or Facing an Issue? Contact Pharmacy Support
                      </h4>
                      <p className="text-xs text-text-secondary">
                        Submit a ticket regarding hardware pairing, NAFDAC barcode scans, or referral payout disbursement.
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setClientSupportModalOpen(true)}
                    className="bg-accent hover:bg-accent/90 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm transition-all whitespace-nowrap"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Contact Support &amp; Open Ticket</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-text-secondary">
                  <div className="bg-bg/60 p-3 rounded-lg border border-border/70 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Instant ticketing into Super Admin Helpdesk</span>
                  </div>
                  <div className="bg-bg/60 p-3 rounded-lg border border-border/70 flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Average resolution time under 30 minutes</span>
                  </div>
                  <div className="bg-bg/60 p-3 rounded-lg border border-border/70 flex items-center gap-2">
                    <Headphones className="w-4 h-4 text-accent shrink-0" />
                    <span>Lagos technical engineers on standby</span>
                  </div>
                </div>
              </div>

              {/* Informational Sync Notice Footer */}
              <div className="bg-purple-500/10 border border-purple-500/30 rounded-xl p-4 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-5 h-5 text-purple-400 shrink-0" />
                  <p className="text-text-secondary">
                    <strong className="text-purple-300">Super Admin Synchronization Active:</strong> Whenever you change payout amounts, bonuses, or packages in <strong className="text-text-primary">&quot;Modify Referral Amount or Payout&quot;</strong>, this client menu automatically updates in real time.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setClientMenuModalOpen(false);
                    setActiveTab('modify_payout');
                  }}
                  className="bg-purple-600 hover:bg-purple-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap shadow-sm"
                >
                  Edit Payout Rates
                </button>
              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border flex justify-end bg-bg/50 sticky bottom-0 z-20">
              <button
                onClick={() => setClientMenuModalOpen(false)}
                className="px-5 py-2 bg-card border border-border rounded-xl text-xs font-semibold text-text-secondary hover:text-text-primary transition-colors"
              >
                Close Preview
              </button>
            </div>

          </div>
        </div>
      )}

      {/* CLIENT-FACING SUBMIT SUPPORT TICKET MODAL */}
      {clientSupportModalOpen && (
        <div className="fixed inset-0 z-[240] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-5 sm:p-6 shadow-2xl space-y-4">
            
            {clientTicketSubmittedId ? (
              <div className="py-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-base font-bold text-text-primary">
                  Support Ticket Submitted!
                </h3>
                <p className="font-mono text-xs text-accent font-bold">
                  Reference: #{clientTicketSubmittedId}
                </p>
                <p className="text-xs text-text-secondary max-w-sm mx-auto">
                  Our Lagos support desk has received your ticket. The Super Admin team can now view and respond to your request immediately.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <div className="flex items-center gap-2">
                    <LifeBuoy className="w-5 h-5 text-accent" />
                    <div>
                      <h3 className="font-bold text-sm sm:text-base text-text-primary">
                        Contact Support &amp; Report Issue
                      </h3>
                      <span className="text-[11px] text-text-secondary">
                        Client portal ticket direct to Super Admin Desk
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => setClientSupportModalOpen(false)}
                    className="p-1 text-text-secondary hover:text-text-primary rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleClientSupportSubmit} className="space-y-3.5 text-xs">
                  {/* Reporting Store Info */}
                  <div className="bg-bg/60 p-2.5 rounded-xl border border-border flex items-center justify-between">
                    <div>
                      <span className="text-[10px] text-text-secondary uppercase block">Reporting As</span>
                      <span className="font-bold text-text-primary">
                        {clientMenuPerspective === 'pharmacy' ? 'City Care Pharmacy (Pharm. Chinedu Okafor)' : 'Dr. Folashade Adebayo (Green Cross)'}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                      Live Client POS
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-text-secondary uppercase">Issue Subject</label>
                    <input
                      type="text"
                      placeholder="e.g. Referral cash payout status or barcode scanner timeout"
                      value={clientTicketSubject}
                      onChange={(e) => setClientTicketSubject(e.target.value)}
                      required
                      className="w-full bg-bg border border-border rounded-lg p-2.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-text-secondary uppercase">Category</label>
                      <select
                        value={clientTicketCategory}
                        onChange={(e) => setClientTicketCategory(e.target.value as TicketCategory)}
                        className="w-full bg-bg border border-border rounded-lg p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        <option value="Referral & Rewards">Referral &amp; Rewards</option>
                        <option value="Technical & POS Hardware">Technical &amp; POS Hardware</option>
                        <option value="Billing & Subscription">Billing &amp; Subscription</option>
                        <option value="NAFDAC & Compliance">NAFDAC &amp; Compliance</option>
                        <option value="Account & Access">Account &amp; Access</option>
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-text-secondary uppercase">Priority</label>
                      <select
                        value={clientTicketPriority}
                        onChange={(e) => setClientTicketPriority(e.target.value as TicketPriority)}
                        className="w-full bg-bg border border-border rounded-lg p-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        <option value="urgent">Urgent (Till blocked)</option>
                        <option value="high">High (Needs today)</option>
                        <option value="medium">Medium (General)</option>
                        <option value="low">Low (Question)</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-text-secondary uppercase">Message / Issue Details</label>
                    <textarea
                      rows={3}
                      placeholder="Please explain the issue or question in detail..."
                      value={clientTicketMessage}
                      onChange={(e) => setClientTicketMessage(e.target.value)}
                      required
                      className="w-full bg-bg border border-border rounded-lg p-2.5 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent resize-none"
                    />
                  </div>

                  <div className="pt-2 border-t border-border flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setClientSupportModalOpen(false)}
                      className="px-4 py-2 border border-border rounded-lg text-xs font-semibold text-text-secondary hover:text-text-primary"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-accent hover:bg-accent/90 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Submit Support Ticket</span>
                    </button>
                  </div>
                </form>
              </>
            )}

          </div>
        </div>
      )}

    </div>
  );
}
