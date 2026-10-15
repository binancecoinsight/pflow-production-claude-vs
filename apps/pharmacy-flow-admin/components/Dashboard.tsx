'use client';

import React, { useEffect, useState, useMemo } from 'react';
import Sidebar from './Sidebar';
import KpiStats from './KpiStats';
import PharmacyTable from './PharmacyTable';
import SubscriptionManager from './SubscriptionManager';
import RenewSubscriptionModal from './RenewSubscriptionModal';
import SendMessageModal from './SendMessageModal';
import SuspendAccessModal from './SuspendAccessModal';
import BroadcastModal from './BroadcastModal';
import RenameStoreModal from './RenameStoreModal';
import ResetPasswordModal from './ResetPasswordModal';
import WhatsNewView from './WhatsNewView';
import SettingsModal from './SettingsModal';
import HeaderDateTime from './HeaderDateTime';
import ReferralManager from './ReferralManager';
import GiveRewardModal from './GiveRewardModal';
import AnalyticsView from './AnalyticsView';
import SupportTicketsView from './SupportTicketsView';
import { 
  Pharmacy, 
  generateMockPharmacies, 
  RecentUpdate, 
  generateInitialUpdates,
  ActivityLog,
  generateInitialActivities,
  ScheduledAlert,
  generateInitialScheduledAlerts,
  SubscriptionPlan,
  SubscriptionCycle,
  Referral,
  generateInitialReferrals,
  CustomerReferrer,
  generateInitialReferrers,
  EntitlementPreset,
  generateInitialEntitlementPresets,
  ReferralRewardType,
  ReferralPayoutConfig,
  generateInitialReferralPayoutConfig,
  SubscriptionPayment,
  generateMockSubscriptionPayments,
  Expense,
  generateInitialExpenses,
  SupportTicket,
  TicketMessage,
  TicketStatus,
  TicketPriority,
  TicketCategory,
  generateInitialSupportTickets
} from '@/lib/mock-data';
import { createClient } from '@/lib/supabase';
import { 
  Bell, Search, User, Menu, Settings, CreditCard, RotateCw, 
  ChevronRight, CheckCircle2, ShieldCheck, Store, Sparkles, MessageSquare, Ban,
  Gift, LifeBuoy
} from 'lucide-react';
import { format } from 'date-fns';

export type DashboardView = 
  | 'overview' 
  | 'subscriptions' 
  | 'support_tickets'
  | 'referrals' 
  | 'refferal'
  | 'whats_new' 
  | 'pharmacies' 
  | 'owners' 
  | 'analytics' 
  | 'compliance';

export default function Dashboard() {
  const [currentView, setCurrentView] = useState<DashboardView>('overview');
  const [pharmacies, setPharmacies] = useState<Pharmacy[]>([]);
  const [payments, setPayments] = useState<SubscriptionPayment[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>(generateInitialExpenses);
  const [supportTickets, setSupportTickets] = useState<SupportTicket[]>(() => generateInitialSupportTickets([]));
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [referrers, setReferrers] = useState<CustomerReferrer[]>([]);
  const [presets, setPresets] = useState<EntitlementPreset[]>([]);
  const [payoutConfig, setPayoutConfig] = useState<ReferralPayoutConfig>(generateInitialReferralPayoutConfig);
  const [recentUpdates, setRecentUpdates] = useState<RecentUpdate[]>([]);
  const [activities, setActivities] = useState<ActivityLog[]>([]);
  const [scheduledAlerts, setScheduledAlerts] = useState<ScheduledAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUsingMock, setIsUsingMock] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [greeting, setGreeting] = useState('');
  
  // Modals state
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [selectedPharmacyForRenewal, setSelectedPharmacyForRenewal] = useState<Pharmacy | null>(null);

  const [sendMessageModalOpen, setSendMessageModalOpen] = useState(false);
  const [selectedPharmacyForMessage, setSelectedPharmacyForMessage] = useState<Pharmacy | null>(null);

  const [suspendModalOpen, setSuspendModalOpen] = useState(false);
  const [selectedPharmacyForSuspend, setSelectedPharmacyForSuspend] = useState<Pharmacy | null>(null);

  const [broadcastModalOpen, setBroadcastModalOpen] = useState(false);
  const [broadcastInitialMode, setBroadcastInitialMode] = useState<'all' | 'selected' | 'scheduled'>('all');

  const [renameModalOpen, setRenameModalOpen] = useState(false);
  const [selectedPharmacyForRename, setSelectedPharmacyForRename] = useState<Pharmacy | null>(null);

  const [resetPasswordModalOpen, setResetPasswordModalOpen] = useState(false);
  const [selectedPharmacyForResetPassword, setSelectedPharmacyForResetPassword] = useState<Pharmacy | null>(null);

  // Give Reward Modal State
  const [giveRewardModalOpen, setGiveRewardModalOpen] = useState(false);
  const [selectedReferralForReward, setSelectedReferralForReward] = useState<Referral | null>(null);
  const [selectedReferrerForReward, setSelectedReferrerForReward] = useState<CustomerReferrer | null>(null);

  const [toastNotification, setToastNotification] = useState<string | null>(null);

  useEffect(() => {
    async function fetchData() {
      try {
        const supabase = createClient();
        
        if (!supabase) {
          // Fallback to mock data if keys are missing
          const mocks = generateMockPharmacies(500);
          setPharmacies(mocks);
          setPayments(generateMockSubscriptionPayments(mocks));
          setRecentUpdates(generateInitialUpdates());
          setActivities(generateInitialActivities());
          setScheduledAlerts(generateInitialScheduledAlerts());
          setReferrals(generateInitialReferrals());
          setReferrers(generateInitialReferrers());
          setPresets(generateInitialEntitlementPresets());
          setIsUsingMock(true);
          return;
        }

        const { data, error } = await supabase
          .from('pharmacies')
          .select('*');

        if (error || !data || data.length === 0) {
          const mocks = generateMockPharmacies(500);
          setPharmacies(mocks);
          setPayments(generateMockSubscriptionPayments(mocks));
          setRecentUpdates(generateInitialUpdates());
          setActivities(generateInitialActivities());
          setScheduledAlerts(generateInitialScheduledAlerts());
          setReferrals(generateInitialReferrals());
          setReferrers(generateInitialReferrers());
          setPresets(generateInitialEntitlementPresets());
          setIsUsingMock(true);
        } else {
          // If supabase returned data, merge with subscription attributes if missing
          const enriched = (data as any[]).map((p) => ({
            ...p,
            subscription_status: p.subscription_status || (p.status === 'expired' ? 'expired' : 'active'),
            subscription_plan: p.subscription_plan || 'Standard',
            subscription_cycle: p.subscription_cycle || 'Monthly',
            subscription_expiry: p.subscription_expiry || new Date(Date.now() + 60 * 24 * 3600000).toISOString(),
            subscription_cost: p.subscription_cost || 65000,
            state: p.state || 'Lagos',
          }));
          setPharmacies(enriched as Pharmacy[]);
          setPayments(generateMockSubscriptionPayments(enriched as Pharmacy[]));
          setRecentUpdates(generateInitialUpdates());
          setActivities(generateInitialActivities());
          setScheduledAlerts(generateInitialScheduledAlerts());
          setReferrals(generateInitialReferrals());
          setReferrers(generateInitialReferrers());
          setPresets(generateInitialEntitlementPresets());
          setIsUsingMock(false);
        }
      } catch (err) {
        console.error('Database connection error:', err);
        const mocks = generateMockPharmacies(500);
        setPharmacies(mocks);
        setPayments(generateMockSubscriptionPayments(mocks));
        setRecentUpdates(generateInitialUpdates());
        setActivities(generateInitialActivities());
        setScheduledAlerts(generateInitialScheduledAlerts());
        setReferrals(generateInitialReferrals());
        setReferrers(generateInitialReferrers());
        setPresets(generateInitialEntitlementPresets());
        setIsUsingMock(true);
      } finally {
        setLoading(false);
      }
    }

    fetchData();

    // Set greeting based on time
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good Morning');
    else if (hour < 18) setGreeting('Good Afternoon');
    else setGreeting('Good Evening');
  }, []);

  // Compute key counters
  const totalActive = useMemo(() => 
    pharmacies.filter(p => !p.is_suspended && (p.subscription_status === 'active' || p.status === 'active')).length,
    [pharmacies]
  );
  
  const totalSales = useMemo(() => 
    pharmacies.reduce((acc, p) => acc + (p.daily_sales || 0), 0),
    [pharmacies]
  );

  const expiringSoonCount = useMemo(() => 
    pharmacies.filter(p => p.subscription_status === 'expiring_soon' && !p.is_suspended).length,
    [pharmacies]
  );

  // Renewal Handlers
  const handleOpenRenewModal = (pharmacy?: Pharmacy | null) => {
    setSelectedPharmacyForRenewal(pharmacy || null);
    setRenewModalOpen(true);
  };

  const handleConfirmRenewal = (
    updatedPharmacy: Pharmacy, 
    details: {
      plan: SubscriptionPlan;
      cycle: SubscriptionCycle;
      amount: number;
      newExpiry: string;
      isNewStore?: boolean;
    }
  ) => {
    setPharmacies(prev => {
      const exists = prev.some(p => p.id === updatedPharmacy.id);
      if (exists) {
        return prev.map(p => p.id === updatedPharmacy.id ? { ...updatedPharmacy, is_suspended: false } : p);
      } else {
        return [updatedPharmacy, ...prev];
      }
    });

    const newUpdate: RecentUpdate = {
      id: `up-${Date.now()}`,
      type: details.isNewStore ? 'store_created' : 'subscription_renewed',
      title: details.isNewStore 
        ? `New Store: ${updatedPharmacy.business_name}`
        : `Renewal: ${updatedPharmacy.business_name}`,
      subtitle: `${details.plan} (${details.cycle}) • ₦${details.amount.toLocaleString()} paid`,
      timeAgo: 'Just now',
      timestamp: Date.now(),
      plan: details.plan,
      pharmacyId: updatedPharmacy.id,
      amount: details.amount,
    };
    setRecentUpdates(prev => [newUpdate, ...prev]);

    const newActivity: ActivityLog = {
      id: `act-${Date.now()}`,
      action_type: 'subscription_renewed',
      title: `Renewed ${details.plan} Plan for ${updatedPharmacy.business_name}`,
      description: `License extended for ${details.cycle} period until ${format(new Date(details.newExpiry), 'MMM dd, yyyy')}. Fee: ₦${details.amount.toLocaleString()}.`,
      pharmacy_id: updatedPharmacy.id,
      pharmacy_name: updatedPharmacy.business_name,
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: Date.now(),
      metadata: {
        plan: details.plan,
        amount: details.amount,
        channel: 'In-App',
      },
    };
    setActivities(prev => [newActivity, ...prev]);

    // Record subscription payment for analytics & financial ledger
    const newPayment: SubscriptionPayment = {
      id: `sub-pay-${Date.now()}`,
      pharmacy_id: updatedPharmacy.id,
      pharmacy_name: updatedPharmacy.business_name,
      owner_name: updatedPharmacy.owner_name,
      state: updatedPharmacy.state,
      plan: details.plan,
      cycle: details.cycle,
      amount_paid: details.amount,
      payment_date: new Date().toISOString(),
      timestamp: Date.now(),
      payment_method: 'NIBSS Instant Settlement',
      reference_no: `NIBSS-${updatedPharmacy.state.slice(0, 3).toUpperCase()}-${Math.floor(100000 + Math.random() * 900000)}`,
      status: 'successful',
    };
    setPayments(prev => [newPayment, ...prev]);

    setToastNotification(
      `Successfully renewed ${updatedPharmacy.business_name} until ${format(new Date(details.newExpiry), 'MMM dd, yyyy')}`
    );
    setTimeout(() => setToastNotification(null), 5000);
  };

  // Direct Message Handlers
  const handleOpenSendMessageModal = (pharmacy: Pharmacy) => {
    setSelectedPharmacyForMessage(pharmacy);
    setSendMessageModalOpen(true);
  };

  const handleSendMessage = (data: {
    pharmacy: Pharmacy;
    channel: 'SMS' | 'In-App' | 'Email';
    subject: string;
    message: string;
  }) => {
    const newActivity: ActivityLog = {
      id: `act-${Date.now()}`,
      action_type: 'message_sent',
      title: `Dispatched ${data.channel} Notice to ${data.pharmacy.business_name}`,
      description: data.message,
      pharmacy_id: data.pharmacy.id,
      pharmacy_name: data.pharmacy.business_name,
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: Date.now(),
      metadata: {
        channel: data.channel,
        recipient: data.pharmacy.phone || data.pharmacy.email || 'Registered Contact',
      },
    };

    setActivities(prev => [newActivity, ...prev]);
    setToastNotification(`Message successfully sent to ${data.pharmacy.business_name} via ${data.channel}`);
    setTimeout(() => setToastNotification(null), 4000);
  };

  // Suspension Handlers
  const handleOpenSuspendModal = (pharmacy: Pharmacy) => {
    setSelectedPharmacyForSuspend(pharmacy);
    setSuspendModalOpen(true);
  };

  const handleToggleSuspension = (pharmacy: Pharmacy, suspend: boolean, reason: string) => {
    setPharmacies(prev => 
      prev.map(p => {
        if (p.id === pharmacy.id) {
          return {
            ...p,
            is_suspended: suspend,
            suspension_reason: suspend ? reason : undefined,
          };
        }
        return p;
      })
    );

    const newActivity: ActivityLog = {
      id: `act-${Date.now()}`,
      action_type: suspend ? 'access_suspended' : 'access_restored',
      title: suspend 
        ? `Suspended POS Access for ${pharmacy.business_name}`
        : `Restored POS Access for ${pharmacy.business_name}`,
      description: suspend
        ? `Store access halted. Reason: ${reason}`
        : `Full POS and cloud access reinstated. Reason: ${reason}`,
      pharmacy_id: pharmacy.id,
      pharmacy_name: pharmacy.business_name,
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: Date.now(),
      metadata: {
        reason: reason,
      },
    };
    setActivities(prev => [newActivity, ...prev]);

    setToastNotification(
      suspend 
        ? `Access suspended for ${pharmacy.business_name}`
        : `Access restored for ${pharmacy.business_name}`
    );
    setTimeout(() => setToastNotification(null), 4000);
  };

  // Push Broadcast Handlers
  const handleDispatchBroadcast = (data: {
    title: string;
    message: string;
    channel: 'SMS' | 'In-App' | 'Email';
    targetType: 'all' | 'selected';
    selectedStores: Pharmacy[];
    isScheduled: boolean;
    scheduledFor?: string;
  }) => {
    const targetCount = data.targetType === 'all' ? pharmacies.length : data.selectedStores.length;
    const targetStoreNames = data.targetType === 'all' ? undefined : data.selectedStores.map(p => p.business_name);

    if (data.isScheduled && data.scheduledFor) {
      const newAlert: ScheduledAlert = {
        id: `sch-${Date.now()}`,
        title: data.title,
        message: data.message,
        channel: data.channel,
        target_type: data.targetType,
        target_count: targetCount,
        scheduled_for: data.scheduledFor,
        status: 'pending',
        created_at: Date.now(),
        created_by: 'Admin User (Super Admin)',
        store_names: targetStoreNames,
      };
      setScheduledAlerts(prev => [newAlert, ...prev]);

      const newActivity: ActivityLog = {
        id: `act-${Date.now()}`,
        action_type: 'broadcast_scheduled',
        title: `Scheduled ${data.channel} Broadcast: "${data.title}"`,
        description: `Queued for automated delivery to ${targetCount} stores on ${format(new Date(data.scheduledFor), 'MMM dd, yyyy @ hh:mm a')}.`,
        performed_by: {
          name: 'Admin User',
          email: 'medihub.infotech@gmail.com',
          role: 'Super Admin',
        },
        timestamp: Date.now(),
        metadata: {
          channel: data.channel,
        },
      };
      setActivities(prev => [newActivity, ...prev]);

      setToastNotification(`Broadcast scheduled for ${format(new Date(data.scheduledFor), 'MMM dd, yyyy @ hh:mm a')}`);
    } else {
      const newActivity: ActivityLog = {
        id: `act-${Date.now()}`,
        action_type: 'broadcast_sent',
        title: `Dispatched ${data.channel} Broadcast to ${data.targetType === 'all' ? 'All Stores' : `${targetCount} Stores`}`,
        description: `Subject: "${data.title}" — Message: ${data.message.slice(0, 100)}...`,
        performed_by: {
          name: 'Admin User',
          email: 'medihub.infotech@gmail.com',
          role: 'Super Admin',
        },
        timestamp: Date.now(),
        metadata: {
          channel: data.channel,
        },
      };
      setActivities(prev => [newActivity, ...prev]);

      setToastNotification(`Broadcast successfully dispatched to ${targetCount} stores via ${data.channel}`);
    }

    setTimeout(() => setToastNotification(null), 5000);
  };

  const handleCancelScheduledAlert = (alertId: string) => {
    setScheduledAlerts(prev => prev.filter(a => a.id !== alertId));
    setToastNotification('Scheduled broadcast was cancelled.');
    setTimeout(() => setToastNotification(null), 3500);
  };

  // Rename Store Handler
  const handleConfirmRename = (pharmacy: Pharmacy, newName: string, newState: string) => {
    setPharmacies(prev => 
      prev.map(p => {
        if (p.id === pharmacy.id) {
          return {
            ...p,
            business_name: newName,
            state: newState,
          };
        }
        return p;
      })
    );

    const newActivity: ActivityLog = {
      id: `act-${Date.now()}`,
      action_type: 'store_renamed',
      title: `Renamed Store: ${pharmacy.business_name} → ${newName}`,
      description: `Official registered name updated for ID ${pharmacy.id} in ${newState}.`,
      pharmacy_id: pharmacy.id,
      pharmacy_name: newName,
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: Date.now(),
    };
    setActivities(prev => [newActivity, ...prev]);

    setToastNotification(`Store successfully renamed to "${newName}"`);
    setTimeout(() => setToastNotification(null), 4000);
  };

  // Reset Password Handler
  const handleConfirmResetPassword = (
    pharmacy: Pharmacy, 
    method: 'generate_temp' | 'send_link' | 'custom', 
    details: { tempPassword?: string; forceReset: boolean }
  ) => {
    const newActivity: ActivityLog = {
      id: `act-${Date.now()}`,
      action_type: 'password_reset',
      title: `Reset Login Password for ${pharmacy.business_name}`,
      description: method === 'send_link'
        ? `Dispatched secure reset link to ${pharmacy.phone || pharmacy.email}.`
        : `Generated new temporary terminal access credentials${details.forceReset ? ' (Password change enforced upon next login)' : ''}.`,
      pharmacy_id: pharmacy.id,
      pharmacy_name: pharmacy.business_name,
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: Date.now(),
    };
    setActivities(prev => [newActivity, ...prev]);

    setToastNotification(`Credentials successfully updated for ${pharmacy.business_name}`);
    setTimeout(() => setToastNotification(null), 4000);
  };

  // Referral Reward Handlers
  const pendingRewardsCount = useMemo(() => {
    return referrals.filter(r => r.status === 'converted' && r.reward_status === 'unclaimed').length;
  }, [referrals]);

  const handleOpenGiveRewardModal = (referral?: Referral, referrer?: CustomerReferrer) => {
    setSelectedReferralForReward(referral || null);
    setSelectedReferrerForReward(referrer || null);
    setGiveRewardModalOpen(true);
  };

  const handleConfirmGrantReward = (rewardData: {
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
  }) => {
    // 1. Update matching referral if selected
    if (rewardData.referralId) {
      setReferrals(prev => prev.map(ref => {
        if (ref.id === rewardData.referralId) {
          return {
            ...ref,
            status: 'rewarded',
            reward_status: rewardData.rewardType === 'cash_transfer' ? 'paid' : 'issued',
            reward_details: {
              reward_id: `rew-${Date.now()}`,
              reward_type: rewardData.rewardType,
              entitlement_title: rewardData.entitlementTitle,
              value_ngn: rewardData.amountNgn,
              voucher_code: rewardData.voucherCode,
              bank_name: rewardData.bankName,
              account_number: rewardData.accountNumber,
              disbursed_at: new Date().toISOString(),
              disbursed_by: 'Admin User (Super Admin)',
              notes: rewardData.notes,
            }
          };
        }
        return ref;
      }));
    }

    // 2. Update referrer's cumulative rewards metrics
    setReferrers(prev => prev.map(adv => {
      if (adv.id === rewardData.referrerId) {
        return {
          ...adv,
          total_earned_ngn: adv.total_earned_ngn + rewardData.amountNgn,
          unclaimed_rewards_count: Math.max(0, adv.unclaimed_rewards_count - 1),
        };
      }
      return adv;
    }));

    // 3. Log to activity log for What's New & Audit Trail
    const newActivity: ActivityLog = {
      id: `act-${Date.now()}`,
      action_type: 'reward_granted',
      title: `Disbursed Entitlement: ${rewardData.entitlementTitle}`,
      description: `Granted ₦${rewardData.amountNgn.toLocaleString()} (${rewardData.rewardType.replace('_', ' ')}) to ${rewardData.referrerName}${rewardData.voucherCode ? ` · Voucher: ${rewardData.voucherCode}` : ''}.${rewardData.notes ? ` Notes: ${rewardData.notes}` : ''}`,
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: Date.now(),
      metadata: {
        amount: rewardData.amountNgn,
        channel: rewardData.sendNotification ? 'SMS' : undefined,
        recipient: rewardData.referrerName,
      },
    };
    setActivities(prev => [newActivity, ...prev]);

    setToastNotification(`Successfully disbursed "${rewardData.entitlementTitle}" (₦${rewardData.amountNgn.toLocaleString()}) to ${rewardData.referrerName}!`);
    setTimeout(() => setToastNotification(null), 5000);
  };

  // Super Admin Update Referral Payout Configuration Handler
  const handleUpdatePayoutConfig = (newConfig: ReferralPayoutConfig, newPresets: EntitlementPreset[]) => {
    setPayoutConfig(newConfig);
    setPresets(newPresets);

    const newActivity: ActivityLog = {
      id: `act-payout-${Date.now()}`,
      action_type: 'reward_granted',
      title: 'Referral Payout Rules Updated by Super Admin',
      description: `Super admin updated referral payout rates: Store bounty set to ₦${newConfig.base_store_payout_ngn.toLocaleString()}, Patient bounty ₦${newConfig.base_customer_payout_ngn.toLocaleString()}, commission ${newConfig.commission_percentage}%. Client side referral menu updated.`,
      performed_by: {
        name: newConfig.last_updated_by?.name || 'Admin User',
        email: newConfig.last_updated_by?.email || 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: Date.now(),
      metadata: {
        amount: newConfig.base_store_payout_ngn,
        plan: `${newConfig.commission_percentage}% Commission`,
        base_store_payout: newConfig.base_store_payout_ngn,
        commission: newConfig.commission_percentage,
        updated_at: newConfig.last_updated,
      },
    };
    setActivities(prev => [newActivity, ...prev]);

    setToastNotification(
      `Referral payout updated: ₦${newConfig.base_store_payout_ngn.toLocaleString()} per store, ${newConfig.commission_percentage}% commission. Reflected on client side referral menu.`
    );
    setTimeout(() => setToastNotification(null), 5000);
  };

  // Super Admin Operating Expenses Recording & Management Handlers
  const handleAddExpense = (newExpense: Omit<Expense, 'id' | 'timestamp'>) => {
    const expenseItem: Expense = {
      ...newExpense,
      id: `exp-${Date.now()}`,
      timestamp: new Date(newExpense.date).getTime() || Date.now(),
    };
    setExpenses(prev => [expenseItem, ...prev]);

    const newActivity: ActivityLog = {
      id: `act-exp-${Date.now()}`,
      action_type: 'expense_recorded',
      title: `Recorded Expense: ${newExpense.title}`,
      description: `Categorized under ${newExpense.category} as ${newExpense.type === 'recurring' ? `Recurring (${newExpense.frequency})` : 'One-Time'} expense of ₦${newExpense.amount.toLocaleString()}. Vendor: ${newExpense.vendor}. Factored before total earnings are summarized.`,
      performed_by: {
        name: 'Super Admin',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Administrator',
      },
      timestamp: Date.now(),
      metadata: {
        amount: newExpense.amount,
        type: newExpense.type,
        category: newExpense.category,
        vendor: newExpense.vendor,
      },
    };
    setActivities(prev => [newActivity, ...prev]);

    setToastNotification(
      `Operating expense ₦${newExpense.amount.toLocaleString()} recorded (${newExpense.type === 'recurring' ? `Recurring • ${newExpense.frequency}` : 'One-Time'}). Factored into net earnings.`
    );
    setTimeout(() => setToastNotification(null), 5000);
  };

  const handleDeleteExpense = (id: string) => {
    const target = expenses.find(e => e.id === id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setToastNotification(`Expense "${target?.title || 'Record'}" removed from financial ledger.`);
    setTimeout(() => setToastNotification(null), 4000);
  };

  // Support Tickets & Client Inquiries Handlers
  const handleReplySupportTicket = (
    ticketId: string, 
    messageText: string, 
    options?: { isInternal?: boolean; newStatus?: TicketStatus }
  ) => {
    let targetTicket: SupportTicket | undefined;

    setSupportTickets(prev => prev.map(t => {
      if (t.id === ticketId) {
        targetTicket = t;
        const newMsg: TicketMessage = {
          id: `msg-${Date.now()}`,
          sender_type: 'admin',
          sender_name: 'Super Admin',
          sender_role: 'Operations Desk',
          message: messageText,
          timestamp: Date.now(),
          internal_note: options?.isInternal,
        };

        const updatedStatus = options?.newStatus || (t.status === 'open' ? 'in_progress' : t.status);

        return {
          ...t,
          status: updatedStatus,
          updated_at: Date.now(),
          messages: [...t.messages, newMsg],
        };
      }
      return t;
    }));

    if (targetTicket) {
      const isInternal = options?.isInternal;
      const newActivity: ActivityLog = {
        id: `act-ticket-${Date.now()}`,
        action_type: isInternal ? 'message_sent' : 'ticket_replied',
        title: isInternal 
          ? `Internal Staff Note on ${targetTicket.ticket_number}`
          : `Replied to Ticket ${targetTicket.ticket_number} (${targetTicket.pharmacy_name})`,
        description: isInternal
          ? `Staff note added to ticket #${targetTicket.ticket_number}.`
          : `Dispatched support resolution to ${targetTicket.client_name}: "${messageText.slice(0, 90)}..."`,
        pharmacy_id: targetTicket.pharmacy_id,
        pharmacy_name: targetTicket.pharmacy_name,
        performed_by: {
          name: 'Super Admin',
          email: 'medihub.infotech@gmail.com',
          role: 'Super Administrator',
        },
        timestamp: Date.now(),
        metadata: {
          ticket_id: targetTicket.id,
          ticket_number: targetTicket.ticket_number,
          subject: targetTicket.subject,
        },
      };
      setActivities(prev => [newActivity, ...prev]);

      setToastNotification(
        isInternal 
          ? `Internal note saved on ticket ${targetTicket.ticket_number}.`
          : `Reply sent to ${targetTicket.client_name} (${targetTicket.pharmacy_name}).`
      );
      setTimeout(() => setToastNotification(null), 4000);
    }
  };

  const handleUpdateTicketStatus = (ticketId: string, status: TicketStatus) => {
    let targetTicket: SupportTicket | undefined;
    setSupportTickets(prev => prev.map(t => {
      if (t.id === ticketId) {
        targetTicket = t;
        return { ...t, status, updated_at: Date.now() };
      }
      return t;
    }));

    if (targetTicket) {
      if (status === 'resolved') {
        const newActivity: ActivityLog = {
          id: `act-res-${Date.now()}`,
          action_type: 'ticket_resolved',
          title: `Resolved Support Ticket ${targetTicket.ticket_number}`,
          description: `Issue "${targetTicket.subject}" for ${targetTicket.pharmacy_name} marked as resolved.`,
          pharmacy_id: targetTicket.pharmacy_id,
          pharmacy_name: targetTicket.pharmacy_name,
          performed_by: {
            name: 'Super Admin',
            email: 'medihub.infotech@gmail.com',
            role: 'Super Administrator',
          },
          timestamp: Date.now(),
        };
        setActivities(prev => [newActivity, ...prev]);
      }

      setToastNotification(`Ticket ${targetTicket.ticket_number} status updated to ${status.replace('_', ' ')}.`);
      setTimeout(() => setToastNotification(null), 3000);
    }
  };

  const handleUpdateTicketPriority = (ticketId: string, priority: TicketPriority) => {
    setSupportTickets(prev => prev.map(t => t.id === ticketId ? { ...t, priority, updated_at: Date.now() } : t));
    setToastNotification(`Priority updated to ${priority}.`);
    setTimeout(() => setToastNotification(null), 2500);
  };

  const handleAssignTicket = (ticketId: string, agentName: string) => {
    setSupportTickets(prev => prev.map(t => t.id === ticketId ? { ...t, assigned_to: agentName, updated_at: Date.now() } : t));
    setToastNotification(`Ticket assigned to ${agentName}.`);
    setTimeout(() => setToastNotification(null), 2500);
  };

  const handleAddSupportTicket = (
    newTicket: Omit<SupportTicket, 'id' | 'created_at' | 'updated_at' | 'messages'> & { initialMessage: string }
  ) => {
    const ticketId = `tick-${Date.now()}`;
    const now = Date.now();
    const created: SupportTicket = {
      ...newTicket,
      id: ticketId,
      created_at: now,
      updated_at: now,
      messages: [
        {
          id: `msg-${Date.now()}`,
          sender_type: 'client',
          sender_name: newTicket.client_name,
          sender_role: 'Client Requester',
          message: newTicket.initialMessage,
          timestamp: now,
        }
      ],
    };

    setSupportTickets(prev => [created, ...prev]);

    const newActivity: ActivityLog = {
      id: `act-newtick-${Date.now()}`,
      action_type: 'ticket_created',
      title: `New Support Ticket: ${created.ticket_number} - ${created.pharmacy_name}`,
      description: `Client reported: "${created.subject}". Priority: ${created.priority.toUpperCase()}, Category: ${created.category}.`,
      pharmacy_id: created.pharmacy_id,
      pharmacy_name: created.pharmacy_name,
      performed_by: {
        name: created.client_name,
        email: created.client_email,
        role: 'Client (Superintendent)',
      },
      timestamp: now,
      metadata: {
        ticket_id: created.id,
        ticket_number: created.ticket_number,
        priority: created.priority,
      },
    };
    setActivities(prev => [newActivity, ...prev]);

    setToastNotification(`Support ticket #${created.ticket_number} logged for ${created.pharmacy_name}. Ready for triage.`);
    setTimeout(() => setToastNotification(null), 5000);
  };

  const openTicketsCount = useMemo(() => supportTickets.filter(t => t.status === 'open').length, [supportTickets]);

  return (
    <div className="flex h-screen bg-bg text-text-primary overflow-hidden">
      {/* Sidebar with Navigation and Live Recent Updates */}
      <Sidebar 
        isOpen={sidebarOpen} 
        onClose={() => setSidebarOpen(false)}
        currentView={currentView}
        onSelectView={(v) => setCurrentView(v as any)}
        expiringCount={expiringSoonCount}
        pendingRewardsCount={pendingRewardsCount}
        openTicketsCount={openTicketsCount}
        recentUpdates={recentUpdates}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenRenewModal={() => handleOpenRenewModal(null)}
        onOpenBroadcastModal={(mode) => {
          setBroadcastInitialMode(mode);
          setBroadcastModalOpen(true);
        }}
        onOpenRenameModal={() => {
          setSelectedPharmacyForRename(null);
          setRenameModalOpen(true);
        }}
        onOpenResetPasswordModal={() => {
          setSelectedPharmacyForResetPassword(null);
          setResetPasswordModalOpen(true);
        }}
        onOpenAddPharmacyModal={() => {
          setSelectedPharmacyForRenewal(null);
          setRenewModalOpen(true);
        }}
      />
      
      <main className="flex-1 flex flex-col overflow-hidden lg:pl-64">
        {/* Top Header */}
        <header className="h-16 border-b border-border flex items-center justify-between px-3 sm:px-6 md:px-8 bg-card/60 backdrop-blur-md z-40 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4">
            <button 
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-white/10 rounded-md transition-colors text-text-primary"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Breadcrumb Navigation */}
            <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold tracking-tight">
              <span 
                onClick={() => setCurrentView('overview')}
                className="cursor-pointer text-text-secondary hover:text-text-primary transition-colors hidden sm:inline"
              >
                Pharmacy Flow
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-text-secondary hidden sm:inline" />
              <span className="capitalize text-text-primary font-bold">
                {currentView === 'whats_new' ? "What's New" : (currentView === 'referrals' || currentView === 'refferal') ? 'Referrals & Entitlements' : currentView === 'analytics' ? 'Revenue Analytics' : currentView}
              </span>
              {isUsingMock && (
                <span className="ml-1 text-[9px] px-1.5 py-0.2 bg-accent/15 text-accent border border-accent/25 rounded uppercase font-bold tracking-wider hidden md:inline">
                  Demo Data
                </span>
              )}
            </div>
          </div>

          {/* Centralized Responsive Date & Time */}
          <HeaderDateTime />

          {/* Header Action Right Zone */}
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Quick Broadcast Button */}
            <button
              onClick={() => {
                setBroadcastInitialMode('all');
                setBroadcastModalOpen(true);
              }}
              className="border border-border bg-card hover:bg-white/5 text-text-primary px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors hidden sm:flex"
              title="Push Broadcast"
            >
              <Bell className="w-3.5 h-3.5 text-accent" />
              <span>Broadcast</span>
            </button>

            {/* Quick Renew Button in Header */}
            <button
              onClick={() => handleOpenRenewModal(null)}
              className="bg-accent text-white hover:bg-accent/90 px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Renew</span>
            </button>

            <button 
              onClick={() => setSettingsOpen(true)}
              className="p-2 hover:bg-white/10 rounded-md transition-colors text-text-secondary hover:text-accent"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Referrals & Incentives Header Button */}
            <button 
              onClick={() => setCurrentView('referrals')}
              className="relative p-2 hover:bg-white/10 rounded-md transition-colors text-text-secondary hover:text-text-primary"
              title="Customer Referrals & Entitlements"
              aria-label="Referrals"
            >
              <Gift className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-400" />
              {pendingRewardsCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-emerald-400 rounded-full ring-2 ring-card" />
              )}
            </button>

            <button 
              onClick={() => setCurrentView('whats_new')}
              className="relative p-2 hover:bg-white/10 rounded-md transition-colors text-text-secondary hover:text-text-primary"
              title="View What's New"
              aria-label="What's New"
            >
              <Sparkles className="w-4 h-4 sm:w-5 sm:h-5 text-accent" />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-accent rounded-full ring-2 ring-card" />
            </button>

            <button 
              onClick={() => setCurrentView('subscriptions')}
              className="relative p-2 hover:bg-white/10 rounded-md transition-colors text-text-secondary hover:text-text-primary"
              title="Subscriptions"
              aria-label="Notifications"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {expiringSoonCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-card" />
              )}
            </button>

            {/* Profile pill */}
            <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-border">
              <div className="text-right hidden md:block">
                <p className="text-xs font-semibold leading-tight">Admin User</p>
                <p className="text-[10px] text-text-secondary uppercase tracking-tight">Super Admin</p>
              </div>
              <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-accent/20 flex items-center justify-center border border-accent/30 text-accent font-bold text-xs">
                AU
              </div>
            </div>
          </div>
        </header>

        {/* Global Toast Notification */}
        {toastNotification && (
          <div className="bg-success text-white px-4 py-2.5 text-xs font-semibold flex items-center justify-between shadow-md transition-all animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{toastNotification}</span>
            </div>
            <button 
              onClick={() => setToastNotification(null)}
              className="hover:underline text-[11px] opacity-80 hover:opacity-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Settings Modal */}
        <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

        {/* Renew Subscription Modal (Search & Add / Renew) */}
        {renewModalOpen && (
          <RenewSubscriptionModal 
            key={selectedPharmacyForRenewal ? selectedPharmacyForRenewal.id : 'new-renewal-modal'}
            isOpen={renewModalOpen}
            onClose={() => {
              setRenewModalOpen(false);
              setSelectedPharmacyForRenewal(null);
            }}
            pharmacies={pharmacies}
            initialPharmacy={selectedPharmacyForRenewal}
            onConfirmRenewal={handleConfirmRenewal}
          />
        )}

        {/* Send Message Modal */}
        {sendMessageModalOpen && selectedPharmacyForMessage && (
          <SendMessageModal 
            isOpen={sendMessageModalOpen}
            onClose={() => {
              setSendMessageModalOpen(false);
              setSelectedPharmacyForMessage(null);
            }}
            pharmacy={selectedPharmacyForMessage}
            onSendMessage={handleSendMessage}
          />
        )}

        {/* Suspend Access Modal */}
        {suspendModalOpen && selectedPharmacyForSuspend && (
          <SuspendAccessModal 
            isOpen={suspendModalOpen}
            onClose={() => {
              setSuspendModalOpen(false);
              setSelectedPharmacyForSuspend(null);
            }}
            pharmacy={selectedPharmacyForSuspend}
            onConfirmToggleSuspension={handleToggleSuspension}
          />
        )}

        {/* Broadcast Modal */}
        {broadcastModalOpen && (
          <BroadcastModal 
            isOpen={broadcastModalOpen}
            onClose={() => setBroadcastModalOpen(false)}
            pharmacies={pharmacies}
            initialTargetMode={broadcastInitialMode}
            scheduledAlerts={scheduledAlerts}
            onDispatchBroadcast={handleDispatchBroadcast}
            onCancelScheduledAlert={handleCancelScheduledAlert}
          />
        )}

        {/* Rename Store Modal */}
        {renameModalOpen && (
          <RenameStoreModal 
            isOpen={renameModalOpen}
            onClose={() => {
              setRenameModalOpen(false);
              setSelectedPharmacyForRename(null);
            }}
            pharmacies={pharmacies}
            initialPharmacy={selectedPharmacyForRename}
            onConfirmRename={handleConfirmRename}
          />
        )}

        {/* Reset Password Modal */}
        {resetPasswordModalOpen && (
          <ResetPasswordModal 
            isOpen={resetPasswordModalOpen}
            onClose={() => {
              setResetPasswordModalOpen(false);
              setSelectedPharmacyForResetPassword(null);
            }}
            pharmacies={pharmacies}
            initialPharmacy={selectedPharmacyForResetPassword}
            onConfirmResetPassword={handleConfirmResetPassword}
          />
        )}

        {/* Give Reward & Entitlement Modal */}
        {giveRewardModalOpen && (
          <GiveRewardModal 
            key={selectedReferralForReward ? selectedReferralForReward.id : selectedReferrerForReward ? selectedReferrerForReward.id : 'give-reward-modal'}
            isOpen={giveRewardModalOpen}
            onClose={() => {
              setGiveRewardModalOpen(false);
              setSelectedReferralForReward(null);
              setSelectedReferrerForReward(null);
            }}
            referrals={referrals}
            referrers={referrers}
            presets={presets}
            initialReferral={selectedReferralForReward}
            initialReferrer={selectedReferrerForReward}
            onConfirmGrantReward={handleConfirmGrantReward}
          />
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 md:p-8">
          {loading ? (
            <div className="h-full flex items-center justify-center">
              <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin" />
                <p className="text-text-secondary text-sm font-medium animate-pulse">Initializing Pharmacy Flow...</p>
              </div>
            </div>
          ) : (
            <div className="max-w-7xl mx-auto space-y-6">
              {/* VIEW 1: Subscriptions View */}
              {currentView === 'subscriptions' && (
                <SubscriptionManager 
                  pharmacies={pharmacies}
                  onOpenRenewModal={handleOpenRenewModal}
                  onOpenSendMessageModal={handleOpenSendMessageModal}
                  onOpenSuspendModal={handleOpenSuspendModal}
                />
              )}

              {/* VIEW 2: Customer Referrals & Entitlements View */}
              {(currentView === 'referrals' || currentView === 'refferal') && (
                <ReferralManager 
                  referrals={referrals}
                  referrers={referrers}
                  presets={presets}
                  payoutConfig={payoutConfig}
                  onOpenGiveRewardModal={handleOpenGiveRewardModal}
                  onUpdatePayoutConfig={handleUpdatePayoutConfig}
                  onAddSupportTicket={handleAddSupportTicket}
                  onNavigateToSupport={() => setCurrentView('support_tickets')}
                />
              )}

              {/* VIEW: Client Support Tickets & Helpdesk */}
              {currentView === 'support_tickets' && (
                <SupportTicketsView 
                  tickets={supportTickets}
                  pharmacies={pharmacies}
                  onReplyTicket={handleReplySupportTicket}
                  onUpdateTicketStatus={handleUpdateTicketStatus}
                  onUpdateTicketPriority={handleUpdateTicketPriority}
                  onAssignTicket={handleAssignTicket}
                  onCreateTicket={handleAddSupportTicket}
                />
              )}

              {/* VIEW 3: What's New Activity Log View */}
              {currentView === 'whats_new' && (
                <WhatsNewView 
                  activities={activities}
                  onOpenRenewModal={(pId) => {
                    const found = pharmacies.find(p => p.id === pId);
                    handleOpenRenewModal(found || null);
                  }}
                />
              )}

              {/* VIEW 3: Overview / Main Dashboard View */}
              {currentView === 'overview' && (
                <>
                  {/* Greeting Section */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl sm:text-3xl font-bold tracking-tight">{greeting}, Admin</h2>
                      <p className="text-text-secondary text-xs sm:text-sm mt-1">
                        Here is what is happening across Nigeria&apos;s licensed pharmacy network today.
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setBroadcastInitialMode('all');
                          setBroadcastModalOpen(true);
                        }}
                        className="border border-border bg-card hover:bg-white/5 text-text-primary px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Bell className="w-3.5 h-3.5 text-accent" />
                        <span>Push Broadcast</span>
                      </button>
                      <button 
                        onClick={() => handleOpenRenewModal(null)}
                        className="bg-accent text-white hover:bg-accent/90 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm transition-colors"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Renew Subscription</span>
                      </button>
                      <button 
                        onClick={() => setCurrentView('whats_new')}
                        className="bg-card border border-border hover:border-accent/40 text-text-primary px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-accent" />
                        <span>What&apos;s New</span>
                      </button>
                      <button 
                        onClick={() => setCurrentView('support_tickets')}
                        className="bg-card border border-border hover:border-rose-500/40 text-text-primary px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors"
                      >
                        <LifeBuoy className="w-3.5 h-3.5 text-rose-400" />
                        <span>Support Tickets</span>
                        {openTicketsCount > 0 && (
                          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold">
                            {openTicketsCount}
                          </span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* High level KPI summary with click-through to Subscriptions */}
                  <KpiStats 
                    totalActive={totalActive} 
                    totalSales={totalSales} 
                    expiringSoon={expiringSoonCount}
                    onNavigateToSubscriptions={() => setCurrentView('subscriptions')}
                  />
                  
                  {/* Section Title & Quick Table */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base sm:text-lg font-bold tracking-tight">Active Pharmacy Network</h3>
                      <p className="text-xs text-text-secondary">All stores connected to centralized POS and inventory sync.</p>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <button 
                        onClick={() => {
                          setSelectedPharmacyForRename(null);
                          setRenameModalOpen(true);
                        }}
                        className="text-xs border border-border hover:border-accent/40 px-3 py-1.5 rounded-md font-medium text-text-secondary hover:text-text-primary transition-colors hidden sm:inline"
                      >
                        Rename Store
                      </button>
                      <button 
                        onClick={() => handleOpenRenewModal(null)}
                        className="text-xs bg-accent text-white px-3 py-1.5 rounded-md font-medium hover:bg-accent/90 transition-colors"
                      >
                        + Add / Renew Store
                      </button>
                    </div>
                  </div>
                  
                  <PharmacyTable 
                    pharmacies={pharmacies} 
                    onRenewPharmacy={(p) => handleOpenRenewModal(p)}
                    onRenamePharmacy={(p) => {
                      setSelectedPharmacyForRename(p);
                      setRenameModalOpen(true);
                    }}
                    onResetPasswordPharmacy={(p) => {
                      setSelectedPharmacyForResetPassword(p);
                      setResetPasswordModalOpen(true);
                    }}
                    onSendMessagePharmacy={(p) => handleOpenSendMessageModal(p)}
                  />
                </>
              )}

              {/* VIEW 4: Pharmacies Directory View */}
              {currentView === 'pharmacies' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold tracking-tight">Pharmacies Directory</h2>
                      <p className="text-xs text-text-secondary">Comprehensive listing of all onboarded drug stores and chemists.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          setBroadcastInitialMode('all');
                          setBroadcastModalOpen(true);
                        }}
                        className="border border-border bg-card hover:bg-white/5 text-text-primary px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <Bell className="w-3.5 h-3.5 text-accent" />
                        <span>Broadcast Alert</span>
                      </button>
                      <button 
                        onClick={() => handleOpenRenewModal(null)}
                        className="bg-accent text-white hover:bg-accent/90 px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5"
                      >
                        <RotateCw className="w-3.5 h-3.5" />
                        <span>Renew or Add Store</span>
                      </button>
                    </div>
                  </div>
                  <PharmacyTable 
                    pharmacies={pharmacies}
                    onRenewPharmacy={(p) => handleOpenRenewModal(p)}
                    onRenamePharmacy={(p) => {
                      setSelectedPharmacyForRename(p);
                      setRenameModalOpen(true);
                    }}
                    onResetPasswordPharmacy={(p) => {
                      setSelectedPharmacyForResetPassword(p);
                      setResetPasswordModalOpen(true);
                    }}
                    onSendMessagePharmacy={(p) => handleOpenSendMessageModal(p)}
                  />
                </div>
              )}

              {/* VIEW 5: Subscription Revenue & Operating Financials Analytics */}
              {currentView === 'analytics' && (
                <AnalyticsView 
                  payments={payments}
                  expenses={expenses}
                  onAddExpense={handleAddExpense}
                  onDeleteExpense={handleDeleteExpense}
                  onOpenRenewModal={() => handleOpenRenewModal(null)}
                />
              )}

              {/* VIEW 6: Owners & Compliance placeholders */}
              {(currentView === 'owners' || currentView === 'compliance') && (
                <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-xl bg-accent/15 text-accent flex items-center justify-center mx-auto">
                    {currentView === 'owners' ? <User className="w-6 h-6" /> : <ShieldCheck className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="text-lg font-bold capitalize">{currentView} Panel</h3>
                    <p className="text-xs text-text-secondary max-w-md mx-auto mt-1">
                      Manage all verified superintendent pharmacists, NAFDAC regulatory compliance logs, and recurring Nigerian Naira billing streams.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-3 pt-2">
                    <button 
                      onClick={() => setCurrentView('subscriptions')}
                      className="bg-accent text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-accent/90"
                    >
                      Go to Subscriptions Panel
                    </button>
                    <button 
                      onClick={() => setCurrentView('whats_new')}
                      className="border border-border text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg text-xs font-semibold"
                    >
                      View What&apos;s New
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
