'use client';

import React, { useState, useMemo } from 'react';
import { 
  CreditCard, Search, Filter, RotateCw, AlertTriangle, CheckCircle2, 
  Clock, ArrowUpDown, ChevronLeft, ChevronRight, Store, Download, Plus, 
  ExternalLink, Calendar, MessageSquare, Ban, Unlock
} from 'lucide-react';
import { Pharmacy, SubscriptionPlan, SubscriptionCycle, SubscriptionStatus } from '@/lib/mock-data';
import { format, differenceInDays } from 'date-fns';

interface SubscriptionManagerProps {
  pharmacies: Pharmacy[];
  onOpenRenewModal?: (pharmacy?: Pharmacy | null) => void;
  onOpenSendMessageModal: (pharmacy: Pharmacy) => void;
  onOpenSuspendModal?: (pharmacy: Pharmacy) => void;
}

const ITEMS_PER_PAGE = 12;

export default function SubscriptionManager({
  pharmacies,
  onOpenRenewModal,
  onOpenSendMessageModal,
  onOpenSuspendModal,
}: SubscriptionManagerProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | SubscriptionStatus>('all');
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [cycleFilter, setCycleFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'subscription_expiry' | 'business_name' | 'subscription_cost'>('subscription_expiry');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [currentPage, setCurrentPage] = useState(1);

  // Compute overall counts
  const totalCount = pharmacies.length;
  const activeCount = useMemo(() => 
    pharmacies.filter(p => p.subscription_status === 'active').length, 
    [pharmacies]
  );
  const expiringSoonCount = useMemo(() => 
    pharmacies.filter(p => p.subscription_status === 'expiring_soon').length, 
    [pharmacies]
  );
  const expiredCount = useMemo(() => 
    pharmacies.filter(p => p.subscription_status === 'expired').length, 
    [pharmacies]
  );

  // ARR/MRR calculation
  const monthlyRecurringRevenue = useMemo(() => {
    return pharmacies
      .filter(p => p.subscription_status !== 'expired')
      .reduce((sum, p) => {
        const monthly = p.subscription_cycle === 'Annual' 
          ? p.subscription_cost / 12 
          : p.subscription_cycle === 'Quarterly' 
          ? p.subscription_cost / 3 
          : p.subscription_cost;
        return sum + monthly;
      }, 0);
  }, [pharmacies]);

  // Filtering & Sorting
  const filteredPharmacies = useMemo(() => {
    return pharmacies
      .filter(p => {
        const query = search.toLowerCase();
        const matchesSearch = 
          !search ||
          p.business_name.toLowerCase().includes(query) ||
          p.owner_name.toLowerCase().includes(query) ||
          p.id.toLowerCase().includes(query) ||
          (p.state && p.state.toLowerCase().includes(query));

        const matchesStatus = statusFilter === 'all' || p.subscription_status === statusFilter;
        const matchesPlan = planFilter === 'all' || p.subscription_plan === planFilter;
        const matchesCycle = cycleFilter === 'all' || p.subscription_cycle === cycleFilter;

        return matchesSearch && matchesStatus && matchesPlan && matchesCycle;
      })
      .sort((a, b) => {
        if (sortField === 'subscription_expiry') {
          const dateA = new Date(a.subscription_expiry).getTime();
          const dateB = new Date(b.subscription_expiry).getTime();
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        } else if (sortField === 'subscription_cost') {
          return sortOrder === 'asc' 
            ? a.subscription_cost - b.subscription_cost 
            : b.subscription_cost - a.subscription_cost;
        } else {
          return sortOrder === 'asc'
            ? a.business_name.localeCompare(b.business_name)
            : b.business_name.localeCompare(a.business_name);
        }
      });
  }, [pharmacies, search, statusFilter, planFilter, cycleFilter, sortField, sortOrder]);

  const totalPages = Math.ceil(filteredPharmacies.length / ITEMS_PER_PAGE) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredPharmacies.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredPharmacies, currentPage]);

  const handleSort = (field: 'subscription_expiry' | 'business_name' | 'subscription_cost') => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setCurrentPage(1);
  };

  const getDaysDiffText = (expiryDateStr: string, status: SubscriptionStatus) => {
    const now = new Date();
    const expiry = new Date(expiryDateStr);
    const diff = differenceInDays(expiry, now);

    if (diff < 0) {
      const positive = Math.abs(diff);
      return `${positive} ${positive === 1 ? 'day' : 'days'} overdue`;
    } else if (diff === 0) {
      return 'Expires today';
    } else if (diff <= 14) {
      return `${diff} ${diff === 1 ? 'day' : 'days'} remaining`;
    } else {
      return `${diff} days valid`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 border border-border rounded-xl p-5 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
              Subscription Management
            </h2>
            <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-accent/15 text-accent border border-accent/25 font-bold">
              NGN BILLING
            </span>
          </div>
          <p className="text-xs sm:text-sm text-text-secondary">
            Manage active pharmacy licenses, monitor expiring contracts, and process instant renewals across Nigeria.
          </p>
        </div>

        {onOpenRenewModal && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onOpenRenewModal(null)}
              className="w-full sm:w-auto bg-accent text-white hover:bg-accent/90 px-4 py-2.5 rounded-lg text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-sm transition-all active:scale-[0.98]"
            >
              <RotateCw className="w-4 h-4" />
              <span>Renew Subscription</span>
            </button>
          </div>
        )}
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Active Card */}
        <div 
          onClick={() => { setStatusFilter('active'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'active'
              ? 'bg-success/10 border-success ring-1 ring-success'
              : 'bg-card border-border hover:border-success/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary">Active Subscriptions</span>
            <div className="w-7 h-7 rounded-md bg-success/15 flex items-center justify-center text-success">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-text-primary">{activeCount.toLocaleString()}</p>
          <p className="text-[11px] text-text-secondary mt-1">
            <span className="text-success font-semibold">{((activeCount / totalCount) * 100).toFixed(1)}%</span> of total network
          </p>
        </div>

        {/* Expiring Soon Card */}
        <div 
          onClick={() => { setStatusFilter('expiring_soon'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'expiring_soon'
              ? 'bg-amber-500/10 border-amber-500 ring-1 ring-amber-500'
              : 'bg-card border-border hover:border-amber-500/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary">Soon to Expire (&le;14d)</span>
            <div className="w-7 h-7 rounded-md bg-amber-500/15 flex items-center justify-center text-amber-500">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-amber-500">{expiringSoonCount.toLocaleString()}</p>
          <p className="text-[11px] text-text-secondary mt-1">
            Requires renewal outreach
          </p>
        </div>

        {/* Expired Card */}
        <div 
          onClick={() => { setStatusFilter('expired'); setCurrentPage(1); }}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            statusFilter === 'expired'
              ? 'bg-error/10 border-error ring-1 ring-error'
              : 'bg-card border-border hover:border-error/50'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary">Expired Subscriptions</span>
            <div className="w-7 h-7 rounded-md bg-error/15 flex items-center justify-center text-error">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-error">{expiredCount.toLocaleString()}</p>
          <p className="text-[11px] text-text-secondary mt-1">
            Service suspended / overdue
          </p>
        </div>

        {/* MRR Card */}
        <div className="p-4 rounded-xl border border-border bg-card">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-text-secondary">Est. Monthly Revenue</span>
            <div className="w-7 h-7 rounded-md bg-accent/15 flex items-center justify-center text-accent">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-accent">
            ₦{(monthlyRecurringRevenue / 1000000).toFixed(2)}M
          </p>
          <p className="text-[11px] text-text-secondary mt-1">
            ₦{Math.round(monthlyRecurringRevenue).toLocaleString()} / month
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Controls */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        {/* Status Segmented Tabs */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
          {[
            { id: 'all', label: 'All Subscriptions', count: totalCount },
            { id: 'active', label: 'Active', count: activeCount },
            { id: 'expiring_soon', label: 'Soon to Expire', count: expiringSoonCount },
            { id: 'expired', label: 'Expired', count: expiredCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setStatusFilter(tab.id as any);
                setCurrentPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                statusFilter === tab.id
                  ? 'bg-accent text-white shadow-sm'
                  : 'text-text-secondary hover:bg-white/5 hover:text-text-primary'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                statusFilter === tab.id ? 'bg-white/25 text-white' : 'bg-bg text-text-secondary'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Selectors */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Search pharmacy name, owner, store ID (e.g. ph-42), or location..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full bg-bg border border-border rounded-lg pl-10 pr-4 py-2 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Plan Tier Filter */}
            <select
              value={planFilter}
              onChange={(e) => { setPlanFilter(e.target.value); setCurrentPage(1); }}
              className="bg-bg border border-border rounded-lg px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">All Plans</option>
              <option value="Basic">Basic Plan</option>
              <option value="Standard">Standard Plan</option>
              <option value="Premium">Premium Plan</option>
              <option value="Enterprise">Enterprise Plan</option>
            </select>

            {/* Cycle Filter */}
            <select
              value={cycleFilter}
              onChange={(e) => { setCycleFilter(e.target.value); setCurrentPage(1); }}
              className="bg-bg border border-border rounded-lg px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">All Cycles</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Annual">Annual (12 Mo)</option>
            </select>

            {/* Sort Field */}
            <button
              onClick={() => handleSort('subscription_expiry')}
              className={`px-3 py-2 border rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors ${
                sortField === 'subscription_expiry'
                  ? 'border-accent bg-accent/10 text-accent'
                  : 'border-border text-text-secondary hover:text-text-primary'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Expiry {sortField === 'subscription_expiry' ? (sortOrder === 'asc' ? '↑' : '↓') : ''}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Table */}
      <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-border bg-bg/40 text-[11px] uppercase tracking-wider text-text-secondary font-medium">
                <th className="py-3 px-4">Pharmacy & Store ID</th>
                <th className="py-3 px-4 hidden md:table-cell">Owner / Licensee</th>
                <th className="py-3 px-4">Tier & Billing</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Fee (NGN)</th>
                <th className="py-3 px-4">Expiration Date</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border text-xs">
              {paginatedData.map((pharmacy) => {
                const isExpired = pharmacy.subscription_status === 'expired';
                const isExpiring = pharmacy.subscription_status === 'expiring_soon';
                const daysDiff = getDaysDiffText(pharmacy.subscription_expiry, pharmacy.subscription_status);

                return (
                  <tr 
                    key={pharmacy.id}
                    className="hover:bg-accent/5 transition-colors group"
                  >
                    {/* Pharmacy & ID */}
                    <td className="py-3 px-4">
                      <div>
                        <p className="font-semibold text-text-primary group-hover:text-accent transition-colors">
                          {pharmacy.business_name}
                        </p>
                        <p className="text-[11px] text-text-secondary font-mono">
                          {pharmacy.id} • {pharmacy.state || 'Lagos'}
                        </p>
                      </div>
                    </td>

                    {/* Owner */}
                    <td className="py-3 px-4 hidden md:table-cell">
                      <p className="text-text-primary font-medium">{pharmacy.owner_name}</p>
                      <p className="text-[10px] text-text-secondary">{pharmacy.phone || '+234 800 000 0000'}</p>
                    </td>

                    {/* Plan */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-text-primary">
                          {pharmacy.subscription_plan}
                        </span>
                        <span className="text-[10px] text-text-secondary">
                          {pharmacy.subscription_cycle}
                        </span>
                      </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1 items-start">
                        {pharmacy.is_suspended ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-500 border border-red-500/30">
                            <Ban className="w-3 h-3" />
                            <span>Suspended</span>
                          </span>
                        ) : (
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            isExpired
                              ? 'bg-error/15 text-error border border-error/25'
                              : isExpiring
                              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/25'
                              : 'bg-success/15 text-success border border-success/25'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${
                              isExpired ? 'bg-error' : isExpiring ? 'bg-amber-500' : 'bg-success'
                            }`} />
                            {isExpired ? 'Expired' : isExpiring ? 'Soon to Expire' : 'Active'}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Cost */}
                    <td className="py-3 px-4 text-right font-mono font-medium tabular-nums text-text-primary">
                      ₦{Math.round(pharmacy.subscription_cost).toLocaleString()}
                    </td>

                    {/* Expiry Date */}
                    <td className="py-3 px-4">
                      <p className="font-medium text-text-primary">
                        {format(new Date(pharmacy.subscription_expiry), 'MMM dd, yyyy')}
                      </p>
                      <p className={`text-[10px] font-medium ${
                        pharmacy.is_suspended ? 'text-red-500' : isExpired ? 'text-error' : isExpiring ? 'text-amber-500' : 'text-text-secondary'
                      }`}>
                        {pharmacy.is_suspended ? 'Access Revoked' : daysDiff}
                      </p>
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Renew */}
                        {onOpenRenewModal && (
                          <button
                            onClick={() => onOpenRenewModal(pharmacy)}
                            title="Renew Subscription"
                            className={`px-2.5 py-1.5 rounded-md text-xs font-semibold inline-flex items-center gap-1 transition-all shadow-sm ${
                              isExpired
                                ? 'bg-error text-white hover:bg-error/90'
                                : isExpiring
                                ? 'bg-amber-600 text-white hover:bg-amber-600/90'
                                : 'bg-accent text-white hover:bg-accent/90'
                            }`}
                          >
                            <RotateCw className="w-3 h-3" />
                            <span className="hidden sm:inline">Renew</span>
                          </button>
                        )}

                        {/* Send Message */}
                        <button
                          onClick={() => onOpenSendMessageModal(pharmacy)}
                          title="Send Message to Pharmacy"
                          className="p-1.5 rounded-md border border-border bg-bg/60 hover:bg-accent/15 hover:border-accent/40 text-text-secondary hover:text-accent transition-colors"
                          aria-label="Send message to store"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </button>

                        {/* Suspend or Restore Access */}
                        {onOpenSuspendModal && (
                          <button
                            onClick={() => onOpenSuspendModal(pharmacy)}
                            title={pharmacy.is_suspended ? "Restore POS Access" : "Suspend Pharmacy Access"}
                            className={`p-1.5 rounded-md border transition-colors ${
                              pharmacy.is_suspended
                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20'
                                : 'border-border bg-bg/60 text-text-secondary hover:text-red-500 hover:border-red-500/40 hover:bg-red-500/10'
                            }`}
                            aria-label={pharmacy.is_suspended ? "Restore access" : "Suspend access"}
                          >
                            {pharmacy.is_suspended ? (
                              <Unlock className="w-3.5 h-3.5" />
                            ) : (
                              <Ban className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {paginatedData.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-text-secondary">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <CreditCard className="w-8 h-8 opacity-40 text-text-secondary" />
                      <p className="text-sm font-medium">No subscriptions match your current filter</p>
                      <button
                        onClick={() => {
                          setSearch('');
                          setStatusFilter('all');
                          setPlanFilter('all');
                          setCycleFilter('all');
                        }}
                        className="text-xs text-accent underline mt-1"
                      >
                        Reset all filters
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        <div className="px-4 py-3 border-t border-border flex items-center justify-between text-xs text-text-secondary bg-bg/30">
          <div>
            Showing <span className="font-semibold text-text-primary">
              {filteredPharmacies.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}
            </span> to <span className="font-semibold text-text-primary">
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredPharmacies.length)}
            </span> of <span className="font-semibold text-text-primary">
              {filteredPharmacies.length}
            </span> subscriptions
          </div>

          <div className="flex items-center gap-1.5">
            <button
              disabled={currentPage === 1}
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded border border-border hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 text-xs font-mono">
              Page {currentPage} of {totalPages}
            </span>
            <button
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded border border-border hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              aria-label="Next page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
