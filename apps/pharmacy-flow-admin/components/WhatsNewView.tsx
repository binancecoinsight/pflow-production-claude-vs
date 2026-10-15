'use client';

import React, { useState, useMemo } from 'react';
import { 
  Sparkles, Search, Filter, CreditCard, Ban, Unlock, MessageSquare, 
  Store, Key, ShieldCheck, User, Calendar, Clock, ArrowUpDown, ChevronDown,
  Download, CheckCircle2, AlertTriangle, ExternalLink, Bell, Edit3, Gift, Award, Share2,
  SlidersHorizontal
} from 'lucide-react';
import { ActivityLog, ActivityActionType } from '@/lib/mock-data';
import { format, formatDistanceToNow } from 'date-fns';

interface WhatsNewViewProps {
  activities: ActivityLog[];
  onNavigateToPharmacy?: (pharmacyId: string) => void;
  onOpenRenewModal?: (pharmacyId?: string) => void;
}

export default function WhatsNewView({
  activities,
  onNavigateToPharmacy,
  onOpenRenewModal,
}: WhatsNewViewProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | ActivityActionType>('all');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | '24h' | '7d' | '30d'>('all');
  const [refTime] = useState(() => Date.now());

  // Metrics
  const totalCount = activities.length;
  const renewalsCount = useMemo(() => 
    activities.filter(a => a.action_type === 'subscription_renewed').length,
    [activities]
  );
  const suspensionsCount = useMemo(() => 
    activities.filter(a => a.action_type === 'access_suspended' || a.action_type === 'access_restored').length,
    [activities]
  );
  const messagesCount = useMemo(() => 
    activities.filter(a => a.action_type === 'message_sent').length,
    [activities]
  );

  // Filtered activity list
  const filteredActivities = useMemo(() => {
    return activities.filter(item => {
      // Category
      if (categoryFilter !== 'all' && item.action_type !== categoryFilter) {
        return false;
      }

      // Actor
      if (actorFilter !== 'all') {
        const actorStr = `${item.performed_by.name} ${item.performed_by.role} ${item.performed_by.email}`.toLowerCase();
        if (!actorStr.includes(actorFilter.toLowerCase())) {
          return false;
        }
      }

      // Timeframe
      if (timeFilter !== 'all') {
        const ageMs = refTime - item.timestamp;
        const maxMs = timeFilter === '24h' 
          ? 24 * 3600000 
          : timeFilter === '7d' 
          ? 7 * 24 * 3600000 
          : 30 * 24 * 3600000;
        if (ageMs > maxMs) return false;
      }

      // Search Query
      if (search.trim()) {
        const q = search.toLowerCase();
        const inTitle = item.title.toLowerCase().includes(q);
        const inDesc = item.description.toLowerCase().includes(q);
        const inStore = item.pharmacy_name?.toLowerCase().includes(q) || item.pharmacy_id?.toLowerCase().includes(q);
        const inActor = item.performed_by.name.toLowerCase().includes(q) || item.performed_by.email.toLowerCase().includes(q);
        if (!inTitle && !inDesc && !inStore && !inActor) return false;
      }

      return true;
    });
  }, [activities, categoryFilter, actorFilter, timeFilter, search, refTime]);

  const getActionBadge = (type: ActivityActionType) => {
    switch (type) {
      case 'subscription_renewed':
        return {
          icon: CreditCard,
          label: 'Renewal',
          color: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30',
          iconColor: 'text-emerald-500',
        };
      case 'access_suspended':
        return {
          icon: Ban,
          label: 'Access Suspended',
          color: 'bg-red-500/15 text-red-500 border-red-500/30',
          iconColor: 'text-red-500',
        };
      case 'access_restored':
        return {
          icon: Unlock,
          label: 'Access Restored',
          color: 'bg-teal-500/15 text-teal-500 border-teal-500/30',
          iconColor: 'text-teal-500',
        };
      case 'message_sent':
        return {
          icon: MessageSquare,
          label: 'Notice Dispatched',
          color: 'bg-blue-500/15 text-blue-500 border-blue-500/30',
          iconColor: 'text-blue-500',
        };
      case 'store_created':
        return {
          icon: Store,
          label: 'Store Created',
          color: 'bg-purple-500/15 text-purple-500 border-purple-500/30',
          iconColor: 'text-purple-500',
        };
      case 'store_renamed':
        return {
          icon: Edit3,
          label: 'Store Renamed',
          color: 'bg-indigo-500/15 text-indigo-500 border-indigo-500/30',
          iconColor: 'text-indigo-500',
        };
      case 'broadcast_sent':
        return {
          icon: Bell,
          label: 'Push Broadcast',
          color: 'bg-orange-500/15 text-orange-500 border-orange-500/30',
          iconColor: 'text-orange-500',
        };
      case 'broadcast_scheduled':
        return {
          icon: Calendar,
          label: 'Broadcast Scheduled',
          color: 'bg-cyan-500/15 text-cyan-500 border-cyan-500/30',
          iconColor: 'text-cyan-500',
        };
      case 'password_reset':
        return {
          icon: Key,
          label: 'Security Reset',
          color: 'bg-amber-500/15 text-amber-500 border-amber-500/30',
          iconColor: 'text-amber-500',
        };
      case 'reward_granted':
        return {
          icon: Gift,
          label: 'Incentive Disbursed',
          color: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
          iconColor: 'text-emerald-400',
        };
      case 'referral_registered':
        return {
          icon: Share2,
          label: 'Referral Verified',
          color: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
          iconColor: 'text-cyan-400',
        };
      case 'payout_rate_updated':
        return {
          icon: SlidersHorizontal,
          label: 'Payout Rate Modified',
          color: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
          iconColor: 'text-purple-400',
        };
      default:
        return {
          icon: ShieldCheck,
          label: 'Admin Action',
          color: 'bg-accent/15 text-accent border-accent/30',
          iconColor: 'text-accent',
        };
    }
  };

  const handleExportCSV = () => {
    const csvRows = [
      ['Timestamp', 'Action Type', 'Title', 'Description', 'Pharmacy ID', 'Pharmacy Name', 'Performed By Name', 'Performed By Email', 'Role'],
      ...filteredActivities.map(a => [
        new Date(a.timestamp).toISOString(),
        a.action_type,
        `"${a.title.replace(/"/g, '""')}"`,
        `"${a.description.replace(/"/g, '""')}"`,
        a.pharmacy_id || '',
        `"${(a.pharmacy_name || '').replace(/"/g, '""')}"`,
        `"${a.performed_by.name.replace(/"/g, '""')}"`,
        a.performed_by.email,
        a.performed_by.role,
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `pharmacyflow_audit_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      {/* View Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card/60 border border-border rounded-xl p-5 backdrop-blur-sm">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-8 h-8 rounded-lg bg-accent/15 text-accent flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-text-primary">
              What&apos;s New &amp; Audit Log
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 font-bold flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" />
              LIVE FEED
            </span>
          </div>
          <p className="text-xs sm:text-sm text-text-secondary">
            Centralized chronological trail of all recent operations, subscription renewals, access suspensions, and messages performed by staff and administrators.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="border border-border bg-card hover:bg-white/5 text-text-primary px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Audit CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Counters */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div 
          onClick={() => setCategoryFilter('all')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            categoryFilter === 'all' 
              ? 'bg-accent/10 border-accent ring-1 ring-accent' 
              : 'bg-card border-border hover:border-accent/40'
          }`}
        >
          <span className="text-xs font-medium text-text-secondary">Total Logged Activities</span>
          <p className="text-2xl font-bold font-mono text-text-primary mt-1">{totalCount}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">Across all platform modules</p>
        </div>

        <div 
          onClick={() => setCategoryFilter('subscription_renewed')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            categoryFilter === 'subscription_renewed' 
              ? 'bg-emerald-500/10 border-emerald-500 ring-1 ring-emerald-500' 
              : 'bg-card border-border hover:border-emerald-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Renewals Processed</span>
            <CreditCard className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-emerald-500 mt-1">{renewalsCount}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">Instant NIBSS &amp; card renewals</p>
        </div>

        <div 
          onClick={() => setCategoryFilter('access_suspended')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            categoryFilter === 'access_suspended' 
              ? 'bg-red-500/10 border-red-500 ring-1 ring-red-500' 
              : 'bg-card border-border hover:border-red-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Access Holds &amp; Suspensions</span>
            <Ban className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-red-500 mt-1">{suspensionsCount}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">Overdue &amp; compliance actions</p>
        </div>

        <div 
          onClick={() => setCategoryFilter('message_sent')}
          className={`p-4 rounded-xl border cursor-pointer transition-all ${
            categoryFilter === 'message_sent' 
              ? 'bg-blue-500/10 border-blue-500 ring-1 ring-blue-500' 
              : 'bg-card border-border hover:border-blue-500/40'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-text-secondary">Dispatched Notices</span>
            <MessageSquare className="w-4 h-4 text-blue-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-blue-500 mt-1">{messagesCount}</p>
          <p className="text-[11px] text-text-secondary mt-0.5">SMS &amp; In-app alerts to stores</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-secondary" />
            <input
              type="text"
              placeholder="Search by action, store name, admin email, or keyword..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-bg border border-border rounded-lg pl-10 pr-4 py-2 text-xs text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Category Dropdown */}
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="bg-bg border border-border rounded-lg px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">All Action Types</option>
              <option value="subscription_renewed">Subscription Renewals</option>
              <option value="broadcast_sent">Push Broadcasts Sent</option>
              <option value="broadcast_scheduled">Scheduled Broadcasts</option>
              <option value="message_sent">Direct Messages &amp; Notices</option>
              <option value="access_suspended">Access Suspensions</option>
              <option value="access_restored">Access Restorations</option>
              <option value="store_renamed">Store Renaming</option>
              <option value="store_created">New Store Creations</option>
              <option value="password_reset">Password Resets</option>
              <option value="reward_granted">Referral Incentives & Entitlements</option>
              <option value="referral_registered">New Referrals Registered</option>
              <option value="payout_rate_updated">Referral Payout Rates Modified</option>
            </select>

            {/* Actor Dropdown */}
            <select
              value={actorFilter}
              onChange={(e) => setActorFilter(e.target.value)}
              className="bg-bg border border-border rounded-lg px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">All Administrators</option>
              <option value="medihub.infotech@gmail.com">Super Admin (medihub.infotech@gmail.com)</option>
              <option value="compliance@pharmacyflow.ng">Compliance Lead</option>
              <option value="billing@pharmacyflow.ng">Billing Specialist</option>
            </select>

            {/* Timeframe Dropdown */}
            <select
              value={timeFilter}
              onChange={(e) => setTimeFilter(e.target.value as any)}
              className="bg-bg border border-border rounded-lg px-2.5 py-2 text-xs text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
            >
              <option value="all">All Time</option>
              <option value="24h">Past 24 Hours</option>
              <option value="7d">Past 7 Days</option>
              <option value="30d">Past 30 Days</option>
            </select>
          </div>
        </div>
      </div>

      {/* Activity Timeline List */}
      <div className="space-y-3">
        {filteredActivities.map((act) => {
          const badge = getActionBadge(act.action_type);
          const Icon = badge.icon;
          const formattedDate = format(new Date(act.timestamp), 'MMM dd, yyyy · HH:mm:ss');
          const timeAgo = formatDistanceToNow(new Date(act.timestamp), { addSuffix: true });

          return (
            <div
              key={act.id}
              className="bg-card border border-border rounded-xl p-4 sm:p-5 hover:border-accent/40 transition-colors shadow-sm"
            >
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                {/* Left side: Icon + Content */}
                <div className="flex items-start gap-3.5">
                  <div className={`p-2.5 rounded-xl border mt-0.5 shrink-0 ${badge.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-text-primary">
                        {act.title}
                      </h4>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${badge.color}`}>
                        {badge.label}
                      </span>
                      {act.pharmacy_name && (
                        <span className="text-xs font-semibold text-accent">
                          • {act.pharmacy_name}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-text-secondary leading-relaxed">
                      {act.description}
                    </p>

                    {/* Metadata Pill Box */}
                    {act.metadata && Object.keys(act.metadata).length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-text-secondary">
                        {act.metadata.amount && (
                          <span className="font-mono font-semibold text-text-primary bg-bg/80 px-2 py-0.5 rounded border border-border">
                            Amount: ₦{act.metadata.amount.toLocaleString()}
                          </span>
                        )}
                        {act.metadata.plan && (
                          <span className="bg-bg/80 px-2 py-0.5 rounded border border-border">
                            Plan: <span className="font-medium text-text-primary">{act.metadata.plan}</span>
                          </span>
                        )}
                        {act.metadata.channel && (
                          <span className="bg-bg/80 px-2 py-0.5 rounded border border-border">
                            Channel: <span className="font-medium text-text-primary">{act.metadata.channel}</span>
                          </span>
                        )}
                        {act.metadata.reason && (
                          <span className="bg-red-500/10 text-red-500 px-2 py-0.5 rounded border border-red-500/20">
                            Reason: {act.metadata.reason}
                          </span>
                        )}
                        {act.metadata.recipient && (
                          <span className="bg-bg/80 px-2 py-0.5 rounded border border-border font-mono">
                            To: {act.metadata.recipient}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Performer block */}
                    <div className="flex items-center gap-2 pt-2 text-[11px] text-text-secondary">
                      <div className="w-5 h-5 rounded-full bg-accent/20 flex items-center justify-center text-accent text-[10px] font-bold">
                        {act.performed_by.name.charAt(0)}
                      </div>
                      <span>
                        Performed by <span className="font-semibold text-text-primary">{act.performed_by.name}</span> ({act.performed_by.role})
                      </span>
                      <span className="hidden sm:inline opacity-50">·</span>
                      <span className="hidden sm:inline font-mono text-[10px] text-text-secondary/80">
                        {act.performed_by.email}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right side: Timestamp & Quick Action */}
                <div className="sm:text-right shrink-0 flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-1 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                  <div className="flex items-center gap-1.5 text-xs text-text-secondary">
                    <Clock className="w-3.5 h-3.5 opacity-60" />
                    <span className="font-medium text-text-primary">{timeAgo}</span>
                  </div>
                  <span className="text-[10px] font-mono text-text-secondary/70">
                    {formattedDate}
                  </span>
                </div>
              </div>
            </div>
          );
        })}

        {filteredActivities.length === 0 && (
          <div className="bg-card border border-border rounded-xl p-12 text-center space-y-3">
            <Sparkles className="w-8 h-8 text-text-secondary opacity-40 mx-auto" />
            <h4 className="text-sm font-bold text-text-primary">No Activities Found</h4>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              There are no recorded administrative activities matching your current search or category filters.
            </p>
            <button
              onClick={() => {
                setSearch('');
                setCategoryFilter('all');
                setActorFilter('all');
                setTimeFilter('all');
              }}
              className="text-xs text-accent underline font-semibold"
            >
              Reset all filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
