'use client';

import React, { useState } from 'react';
import {
  LayoutDashboard, Store, Users, Settings, LogOut, BarChart3,
  ShieldCheck, Bell, ChevronRight, ChevronDown, Trash2, Edit3,
  Key, PlusCircle, Search, AlertTriangle, Menu, X, History, Sparkles, CreditCard,
  CheckCircle2, Clock, Calendar, Gift, LifeBuoy
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { RecentUpdate } from '@/lib/mock-data';
import { createClient } from '@/lib/supabase';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  currentView: string;
  onSelectView: (view: string) => void;
  permissions?: {
    canViewOverview?: boolean;
    canViewSubscriptions?: boolean;
    canViewSupportTickets?: boolean;
    canViewPharmacies?: boolean;
    canViewOwners?: boolean;
    canViewFinancials?: boolean;
    canManageSubscriptions?: boolean;
    canSuspendStores?: boolean;
    [key: string]: boolean | undefined;
  };
  expiringCount?: number;
  pendingRewardsCount?: number;
  openTicketsCount?: number;
  recentUpdates?: RecentUpdate[];
  onOpenSettings?: () => void;
  onOpenRenewModal?: () => void;
  onOpenBroadcastModal?: (mode: 'all' | 'selected' | 'scheduled') => void;
  onOpenRenameModal?: () => void;
  onOpenResetPasswordModal?: () => void;
  onOpenAddPharmacyModal?: () => void;
}

export default function Sidebar({
  isOpen,
  onClose,
  currentView,
  onSelectView,
  permissions,
  expiringCount = 0,
  pendingRewardsCount = 0,
  openTicketsCount = 0,
  recentUpdates = [],
  onOpenSettings,
  onOpenRenewModal,
  onOpenBroadcastModal,
  onOpenRenameModal,
  onOpenResetPasswordModal,
  onOpenAddPharmacyModal,
}: SidebarProps) {
  const [adminOpen, setAdminOpen] = useState(false);
  const [pushOpen, setPushOpen] = useState(false);
  const [updatesOpen, setUpdatesOpen] = useState(true);
  const [updateFilter, setUpdateFilter] = useState('24h');
  const [refTime] = useState(() => Date.now());

  const allNavItems = [
    { id: 'overview', icon: LayoutDashboard, label: 'Overview' },
    { id: 'subscriptions', icon: CreditCard, label: 'Subscriptions', badge: expiringCount > 0 ? `${expiringCount} due` : undefined, badgeColor: 'bg-amber-500/20 text-amber-500 border-amber-500/30' },
    { id: 'support_tickets', icon: LifeBuoy, label: 'Support Tickets', badge: openTicketsCount > 0 ? `${openTicketsCount} open` : undefined, badgeColor: 'bg-rose-500/20 text-rose-400 border-rose-500/30' },
    { id: 'referrals', icon: Gift, label: 'Referrals', badge: pendingRewardsCount > 0 ? `${pendingRewardsCount} due` : 'Active', badgeColor: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
    { id: 'whats_new', icon: Sparkles, label: "What's New", badge: 'Live', badgeColor: 'bg-accent/20 text-accent border-accent/30' },
    { id: 'pharmacies', icon: Store, label: 'Pharmacies' },
    { id: 'owners', icon: Users, label: 'Owners' },
    { id: 'analytics', icon: BarChart3, label: 'Analytics' },
    { id: 'compliance', icon: ShieldCheck, label: 'Compliance' },
  ];

  const navItems = allNavItems.filter((item) => {
    if (!permissions) return true;
    if (item.id === 'subscriptions' && permissions.canViewSubscriptions === false) return false;
    if (item.id === 'analytics' && permissions.canViewFinancials === false) return false;
    return true;
  });

  const handleAdminAction = (action: string) => {
    if (action === 'renew subscription' && onOpenRenewModal) {
      onOpenRenewModal();
      onClose();
      return;
    }
    const confirmed = window.confirm(`WARNING: You are about to ${action}. This action may have significant impact. Do you wish to proceed?`);
    if (confirmed) {
      alert(`Action "${action}" confirmed and executed.`);
    }
  };

  // Filter updates based on selected window
  const filteredUpdates = React.useMemo(() => {
    let maxAgeMs = 24 * 60 * 60 * 1000;
    if (updateFilter === '6h') maxAgeMs = 6 * 60 * 60 * 1000;
    else if (updateFilter === '12h') maxAgeMs = 12 * 60 * 60 * 1000;
    else if (updateFilter === '24h') maxAgeMs = 24 * 60 * 60 * 1000;
    else if (updateFilter === '48h') maxAgeMs = 48 * 60 * 60 * 1000;
    else if (updateFilter === '72h') maxAgeMs = 72 * 60 * 60 * 1000;
    else if (updateFilter === '1w') maxAgeMs = 7 * 24 * 60 * 60 * 1000;
    else if (updateFilter === '1m') maxAgeMs = 30 * 24 * 60 * 60 * 1000;

    return recentUpdates.filter(u => (refTime - u.timestamp) <= maxAgeMs);
  }, [recentUpdates, updateFilter, refTime]);

  const handleNavClick = (viewId: string) => {
    onSelectView(viewId);
    onClose();
  };

  return (
    <>
      {/* Backdrop for mobile */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[150] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Actual Sidebar Content */}
      <aside className={cn(
        "fixed top-0 left-0 w-64 border-r border-border h-screen flex flex-col bg-card z-[151] transition-transform duration-300 ease-in-out shadow-2xl",
        isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-5 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center shadow-sm">
              <Store className="text-white w-5 h-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-text-primary block leading-none">PharmacyFlow</span>
              <span className="text-[10px] text-text-secondary font-mono tracking-wider uppercase mt-0.5 block">Nigeria Admin</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 hover:bg-white/10 rounded-md text-text-secondary hover:text-text-primary"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          <p className="data-grid-header px-3 mb-2 mt-2">Main Navigation</p>
          {navItems.map((item) => {
            const isActive = currentView === item.id || (item.id === 'referrals' && (currentView === 'refferal' || currentView === 'referral'));
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                className={cn(
                  "w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs font-semibold",
                  isActive
                    ? "bg-accent/15 text-accent shadow-sm border border-accent/25"
                    : "text-text-secondary hover:bg-white/5 hover:text-text-primary"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <item.icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.2 rounded-full border font-mono font-bold",
                    item.badgeColor || "bg-accent/20 text-accent border-accent/30"
                  )}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Recent Updates Section */}
          <div className="pt-3 border-t border-border/50 mt-3">
            <button
              onClick={() => setUpdatesOpen(!updatesOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4 text-accent" />
                <span>Recent Updates</span>
              </div>
              {updatesOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>

            <AnimatePresence>
              {updatesOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden pl-2 pr-1 space-y-2 mt-1"
                >
                  <div className="px-1">
                    <label className="text-[10px] text-text-secondary font-medium block mb-1">Filter Timeframe:</label>
                    <select
                      value={updateFilter}
                      onChange={(e) => setUpdateFilter(e.target.value)}
                      className="w-full bg-bg border border-border rounded py-1 px-2 text-[10px] text-text-primary focus:outline-none focus:ring-1 focus:ring-accent"
                    >
                      <option value="6h">Past 6 Hours</option>
                      <option value="12h">Past 12 Hours</option>
                      <option value="24h">Past 24 Hours</option>
                      <option value="48h">Past 48 Hours</option>
                      <option value="72h">Past 72 Hours</option>
                      <option value="1w">Past 1 Week</option>
                      <option value="1m">Past 1 Month</option>
                    </select>
                  </div>

                  <div className="space-y-2 max-h-48 overflow-y-auto px-1">
                    {filteredUpdates.map((item) => (
                      <div
                        key={item.id}
                        className="p-2 rounded bg-bg/60 border border-border/70 hover:border-accent/40 transition-colors"
                      >
                        <div className="flex items-start gap-2">
                          <div className={`mt-0.5 p-1 rounded ${
                            item.type === 'subscription_renewed' ? 'bg-accent/15 text-accent' : 'bg-success/15 text-success'
                          }`}>
                            {item.type === 'subscription_renewed' ? (
                              <CreditCard className="w-3 h-3" />
                            ) : (
                              <Sparkles className="w-3 h-3" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-semibold text-text-primary leading-tight truncate">
                              {item.title}
                            </p>
                            <p className="text-[9px] text-text-secondary truncate mt-0.5">
                              {item.subtitle}
                            </p>
                            <span className="text-[9px] font-mono text-accent/80 block mt-1">
                              {item.timeAgo}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}

                    {filteredUpdates.length === 0 && (
                      <p className="text-[10px] text-text-secondary text-center py-2">
                        No updates in this timeframe
                      </p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Push Notifications Section */}
          <div className="pt-2">
            <button
              onClick={() => setPushOpen(!pushOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <Bell className="w-4 h-4" />
                <span>Push Broadcast</span>
              </div>
              {pushOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
            <AnimatePresence>
              {pushOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden pl-7 pr-2 space-y-1.5 mt-1"
                >
                  <div className="relative mb-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-text-secondary" />
                    <input
                      type="text"
                      placeholder="Search stores..."
                      className="w-full bg-bg border border-border rounded py-1 pl-7 pr-2 text-[10px] focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <button
                    onClick={() => {
                      if (onOpenBroadcastModal) onOpenBroadcastModal('all');
                      onClose();
                    }}
                    className="w-full text-left py-1 text-[11px] text-text-secondary hover:text-accent transition-colors flex items-center justify-between"
                  >
                    <span>Send to All Stores</span>
                    <span className="text-[9px] px-1 bg-accent/15 text-accent rounded font-mono">500+</span>
                  </button>
                  <button
                    onClick={() => {
                      if (onOpenBroadcastModal) onOpenBroadcastModal('selected');
                      onClose();
                    }}
                    className="w-full text-left py-1 text-[11px] text-text-secondary hover:text-accent transition-colors"
                  >
                    Select Specific Stores...
                  </button>
                  <button
                    onClick={() => {
                      if (onOpenBroadcastModal) onOpenBroadcastModal('scheduled');
                      onClose();
                    }}
                    className="w-full text-left py-1 text-[11px] text-text-secondary hover:text-accent transition-colors flex items-center gap-1.5"
                  >
                    <Calendar className="w-3 h-3 text-accent" />
                    <span>Scheduled Alerts Queue</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Administrative Menu (Restricted to roles with management authority) */}
          {(!permissions || permissions.canManageSubscriptions || permissions.canSuspendStores) && (
            <div className="pt-2">
              <button
                onClick={() => setAdminOpen(!adminOpen)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="w-4 h-4" />
                  <span>Administrative</span>
                </div>
                {adminOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
              <AnimatePresence>
                {adminOpen && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-7 pr-2 space-y-1 mt-1"
                  >
                    <button
                      onClick={() => {
                        if (onOpenRenewModal) onOpenRenewModal();
                        onClose();
                      }}
                      className="w-full flex items-center gap-2 py-1.5 text-[11px] text-text-secondary hover:text-accent transition-colors"
                    >
                      <CreditCard className="w-3 h-3" /> Renew Subscriptions
                    </button>
                    <button
                      onClick={() => {
                        if (onOpenAddPharmacyModal) onOpenAddPharmacyModal();
                        else if (onOpenRenewModal) onOpenRenewModal();
                        onClose();
                      }}
                      className="w-full flex items-center gap-2 py-1.5 text-[11px] text-text-secondary hover:text-accent transition-colors"
                    >
                      <PlusCircle className="w-3 h-3" /> Add New Pharmacy
                    </button>
                    <button
                      onClick={() => {
                        if (onOpenRenameModal) onOpenRenameModal();
                        onClose();
                      }}
                      className="w-full flex items-center gap-2 py-1.5 text-[11px] text-text-secondary hover:text-accent transition-colors"
                    >
                      <Edit3 className="w-3 h-3" /> Rename Stores
                    </button>
                    <button
                      onClick={() => {
                        if (onOpenResetPasswordModal) onOpenResetPasswordModal();
                        onClose();
                      }}
                      className="w-full flex items-center gap-2 py-1.5 text-[11px] text-text-secondary hover:text-accent transition-colors"
                    >
                      <Key className="w-3 h-3" /> Reset Passwords
                    </button>
                    <button
                      onClick={() => handleAdminAction('delete pharmacy')}
                      className="w-full flex items-center gap-2 py-1.5 text-[11px] text-error hover:bg-error/10 transition-colors rounded px-1"
                    >
                      <Trash2 className="w-3 h-3" /> Delete Pharmacy
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </nav>

        <div className="p-3 border-t border-border space-y-1 bg-card/90">
          <button
            onClick={() => {
              if (onOpenSettings) onOpenSettings();
              onClose();
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-secondary hover:bg-white/5 hover:text-text-primary transition-colors"
          >
            <Settings className="w-4 h-4" />
            <span>Settings & Theme</span>
          </button>
          <button
            onClick={async () => {
              try {
                const supabase = createClient();
                if (supabase) {
                  await supabase.auth.signOut();
                }
              } catch (err) {
                console.error('Logout error:', err);
              } finally {
                window.location.href = '/login';
              }
            }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-text-secondary hover:bg-error/10 hover:text-error transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
