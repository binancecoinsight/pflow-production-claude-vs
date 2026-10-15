export type SubscriptionStatus = 'active' | 'expiring_soon' | 'expired';
export type SubscriptionPlan = 'Basic' | 'Standard' | 'Premium' | 'Enterprise';
export type SubscriptionCycle = 'Monthly' | 'Quarterly' | 'Annual';

export interface Pharmacy {
  id: string;
  business_name: string;
  owner_name: string;
  status: 'active' | 'expired';
  daily_sales: number;
  last_sync_date: string;
  subscription_status: SubscriptionStatus;
  subscription_plan: SubscriptionPlan;
  subscription_cycle: SubscriptionCycle;
  subscription_expiry: string; // ISO string
  subscription_cost: number;   // In NGN
  state: string;
  phone?: string;
  email?: string;
  is_suspended?: boolean;
  suspension_reason?: string;
}

export type ActivityActionType = 
  | 'subscription_renewed'
  | 'access_suspended'
  | 'access_restored'
  | 'message_sent'
  | 'broadcast_sent'
  | 'broadcast_scheduled'
  | 'store_created'
  | 'password_reset'
  | 'store_renamed'
  | 'reward_granted'
  | 'referral_registered'
  | 'payout_rate_updated'
  | 'expense_recorded'
  | 'ticket_created'
  | 'ticket_replied'
  | 'ticket_resolved';

export interface ScheduledAlert {
  id: string;
  title: string;
  message: string;
  channel: 'SMS' | 'In-App' | 'Email';
  target_type: 'all' | 'selected' | 'single';
  target_count: number;
  scheduled_for: string; // ISO string
  status: 'pending' | 'dispatched' | 'cancelled';
  created_at: number;
  created_by: string;
  store_names?: string[];
}

export interface ActivityLog {
  id: string;
  action_type: ActivityActionType;
  title: string;
  description: string;
  pharmacy_id?: string;
  pharmacy_name?: string;
  performed_by: {
    name: string;
    email: string;
    role: string;
  };
  timestamp: number; // epoch ms
  metadata?: {
    channel?: 'SMS' | 'In-App' | 'Email';
    plan?: string;
    amount?: number;
    reason?: string;
    recipient?: string;
    [key: string]: any;
  };
}

export interface RecentUpdate {
  id: string;
  type: 'store_created' | 'subscription_renewed';
  title: string;
  subtitle: string;
  timeAgo: string;
  timestamp: number; // epoch ms
  plan?: SubscriptionPlan;
  pharmacyId?: string;
  amount?: number;
}

export const PLAN_PRICES: Record<SubscriptionPlan, number> = {
  Basic: 30000,
  Standard: 65000,
  Premium: 120000,
  Enterprise: 250000,
};

const BUSINESS_NAMES = [
  'City Care Pharmacy', 'Green Cross Chemist', 'MediHub Pharmacy', 'PharmaFirst Express', 'Wellness Way Dispensary',
  'HealthLine Care', 'QuickMeds Pharmacy', 'NatureCure Botanicals', 'LifeLink Pharmacy', 'PurePharma Direct',
  'Elite Health Centre', 'Global Meds Superstore', 'Prime Pharmacy & Clinic', 'SafeStep Chemists', 'Vitality Plus Drugs',
  'Apex Health Pharmacy', 'Crown Pharma', 'Beacon Drug Store', 'Sunrise Care Chemist', 'Zenith Pharma'
];

const OWNER_NAMES = [
  'Dr. Olumide Adeleke', 'Pharm. Chidinma Eze', 'Ibrahim Danladi', 'Babatunde Fashola', 'Pharm. Amaka Okonkwo',
  'Dr. Emeka Nwosu', 'Zainab Abubakar', 'Folashade Balogun', 'Dr. Musa Garba', 'Kelechi Umeh',
  'Victoria Ogundipe', 'Dr. Emmanuel Bassey', 'Amina Bello', 'Pharm. Segun Alabi', 'Grace Nwachukwu'
];

const NIGERIAN_STATES = [
  'Lagos (Ikeja)', 'Lagos (Lekki)', 'Lagos (Yaba)', 'Abuja (FCT)', 'Rivers (Port Harcourt)',
  'Oyo (Ibadan)', 'Kano (Nassarawa)', 'Enugu (Independence Layout)', 'Delta (Asaba)', 'Kaduna (Barnawa)',
  'Edo (Benin City)', 'Anambra (Awka)', 'Ogun (Abeokuta)', 'Plateau (Jos)', 'Kwara (Ilorin)'
];

const PLANS: SubscriptionPlan[] = ['Basic', 'Standard', 'Premium', 'Enterprise'];
const CYCLES: SubscriptionCycle[] = ['Monthly', 'Quarterly', 'Annual'];

export const generateMockPharmacies = (count: number): Pharmacy[] => {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  return Array.from({ length: count }, (_, i) => {
    const businessName = `${BUSINESS_NAMES[i % BUSINESS_NAMES.length]} #${Math.floor(i / BUSINESS_NAMES.length) + 1}`;
    const ownerName = OWNER_NAMES[i % OWNER_NAMES.length];
    const state = NIGERIAN_STATES[i % NIGERIAN_STATES.length];
    const plan = PLANS[i % PLANS.length];
    const cycle = CYCLES[i % CYCLES.length];

    // Determine status distribution:
    // ~15% expired, ~15% expiring soon (within 14 days), ~70% active long term
    const rand = (i * 7 + 13) % 100;
    let expiryDate: Date;
    let subStatus: SubscriptionStatus;

    if (rand < 15) {
      // Expired between 1 and 60 days ago
      const daysAgo = ((i * 11) % 59) + 1;
      expiryDate = new Date(now - daysAgo * dayMs);
      subStatus = 'expired';
    } else if (rand < 30) {
      // Expiring soon: between 1 and 14 days in future
      const daysFuture = ((i * 5) % 13) + 1;
      expiryDate = new Date(now + daysFuture * dayMs);
      subStatus = 'expiring_soon';
    } else {
      // Active: between 25 and 330 days in future
      const daysFuture = ((i * 17) % 300) + 25;
      expiryDate = new Date(now + daysFuture * dayMs);
      subStatus = 'active';
    }

    const baseCost = PLAN_PRICES[plan];
    const cost = cycle === 'Annual' ? baseCost * 12 * 0.8 : cycle === 'Quarterly' ? baseCost * 3 * 0.95 : baseCost;

    return {
      id: `ph-${i + 1}`,
      business_name: businessName,
      owner_name: ownerName,
      status: subStatus === 'expired' ? 'expired' : 'active',
      daily_sales: Math.floor(((i * 73 + 1200) % 4500) + 750) * 100, // Naira daily sales
      last_sync_date: new Date(now - ((i * 3) % 7) * dayMs - ((i * 17) % 24) * 3600000).toISOString(),
      subscription_status: subStatus,
      subscription_plan: plan,
      subscription_cycle: cycle,
      subscription_expiry: expiryDate.toISOString(),
      subscription_cost: cost,
      state: state,
      phone: `+234 ${800 + (i % 90)} ${100 + (i % 899)} ${1000 + (i % 8999)}`,
      email: `contact@${businessName.toLowerCase().replace(/[^a-z0-9]/g, '')}.ng`,
    };
  });
};

export const generateInitialUpdates = (): RecentUpdate[] => {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  return [
    {
      id: 'up-1',
      type: 'store_created',
      title: 'New Store: MediHub Lekki Branch #4',
      subtitle: 'Dr. Olumide Adeleke • Lagos (Lekki)',
      timeAgo: '1 hour ago',
      timestamp: now - 1.2 * hourMs,
      plan: 'Premium',
    },
    {
      id: 'up-2',
      type: 'subscription_renewed',
      title: 'Renewal: City Care Pharmacy #1',
      subtitle: 'Premium (Annual) • ₦1,152,000 paid via NIBSS',
      timeAgo: '3 hours ago',
      timestamp: now - 3.5 * hourMs,
      plan: 'Premium',
      amount: 1152000,
    },
    {
      id: 'up-3',
      type: 'subscription_renewed',
      title: 'Renewal: Green Cross Chemist #2',
      subtitle: 'Standard (Quarterly) • ₦185,250',
      timeAgo: '8 hours ago',
      timestamp: now - 8.2 * hourMs,
      plan: 'Standard',
      amount: 185250,
    },
    {
      id: 'up-4',
      type: 'store_created',
      title: 'New Store: Beacon Drug Store #1',
      subtitle: 'Pharm. Chidinma Eze • Abuja (FCT)',
      timeAgo: '14 hours ago',
      timestamp: now - 14 * hourMs,
      plan: 'Enterprise',
    },
    {
      id: 'up-5',
      type: 'subscription_renewed',
      title: 'Renewal: QuickMeds Pharmacy #3',
      subtitle: 'Enterprise (Annual) • ₦2,400,000 paid',
      timeAgo: '22 hours ago',
      timestamp: now - 22 * hourMs,
      plan: 'Enterprise',
      amount: 2400000,
    },
    {
      id: 'up-6',
      type: 'subscription_renewed',
      title: 'Renewal: HealthLine Care #2',
      subtitle: 'Basic (Monthly) • ₦30,000',
      timeAgo: '36 hours ago',
      timestamp: now - 36 * hourMs,
      plan: 'Basic',
      amount: 30000,
    },
    {
      id: 'up-7',
      type: 'store_created',
      title: 'New Store: Apex Health Pharmacy #2',
      subtitle: 'Zainab Abubakar • Kano (Nassarawa)',
      timeAgo: '2 days ago',
      timestamp: now - 49 * hourMs,
      plan: 'Standard',
    },
    {
      id: 'up-8',
      type: 'subscription_renewed',
      title: 'Renewal: PurePharma Direct #4',
      subtitle: 'Premium (Monthly) • ₦120,000',
      timeAgo: '3 days ago',
      timestamp: now - 71 * hourMs,
      plan: 'Premium',
      amount: 120000,
    },
  ];
};

export const generateInitialActivities = (): ActivityLog[] => {
  const now = Date.now();
  const minMs = 60 * 1000;
  const hourMs = 60 * minMs;

  return [
    {
      id: 'act-rew-1',
      action_type: 'reward_granted',
      title: 'Disbursed Referral Incentive: ₦10,000 Cash Transfer',
      description: 'Credited Access Bank account of Pharm. Amaka Okonkwo for converted onboarding of Zenith Drug Mart.',
      performed_by: {
        name: 'Babatunde Fashola',
        email: 'billing@pharmacyflow.ng',
        role: 'Billing Specialist',
      },
      timestamp: now - 8 * minMs,
      metadata: {
        amount: 10000,
        channel: 'SMS',
        recipient: 'Pharm. Amaka Okonkwo',
      },
    },
    {
      id: 'act-1',
      action_type: 'subscription_renewed',
      title: 'Renewed Enterprise Subscription',
      description: 'Extended subscription for 12 months with 20% annual discount via NIBSS instant settlement.',
      pharmacy_id: 'ph-1',
      pharmacy_name: 'City Care Pharmacy #1',
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: now - 12 * minMs,
      metadata: {
        plan: 'Enterprise',
        amount: 2400000,
        channel: 'In-App',
      },
    },
    {
      id: 'act-2',
      action_type: 'message_sent',
      title: 'Dispatched Expiry Warning SMS',
      description: 'Automated notice sent to superintendent pharmacist regarding license expiration in 3 days.',
      pharmacy_id: 'ph-3',
      pharmacy_name: 'MediHub Pharmacy #1',
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: now - 35 * minMs,
      metadata: {
        channel: 'SMS',
        recipient: '+234 803 555 1234',
      },
    },
    {
      id: 'act-3',
      action_type: 'access_suspended',
      title: 'Suspended POS Access',
      description: 'Temporary access deactivation applied due to 45-day overdue subscription payment.',
      pharmacy_id: 'ph-7',
      pharmacy_name: 'QuickMeds Pharmacy #2',
      performed_by: {
        name: 'Pharm. Chidinma Eze',
        email: 'compliance@pharmacyflow.ng',
        role: 'Compliance Lead',
      },
      timestamp: now - 2.5 * hourMs,
      metadata: {
        reason: 'Payment Overdue (>30 days)',
      },
    },
    {
      id: 'act-4',
      action_type: 'store_created',
      title: 'Onboarded New Store Branch',
      description: 'Registered new pharmacy store and provisioned initial Standard cloud license.',
      pharmacy_id: 'ph-19',
      pharmacy_name: 'Sunrise Care Chemist #1',
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: now - 5 * hourMs,
      metadata: {
        plan: 'Standard',
      },
    },
    {
      id: 'act-5',
      action_type: 'access_restored',
      title: 'Restored POS Cloud Access',
      description: 'Account reactivated following proof of payment and renewal processing.',
      pharmacy_id: 'ph-11',
      pharmacy_name: 'Elite Health Centre #1',
      performed_by: {
        name: 'Babatunde Fashola',
        email: 'billing@pharmacyflow.ng',
        role: 'Billing Specialist',
      },
      timestamp: now - 8 * hourMs,
      metadata: {
        reason: 'Payment Verified',
      },
    },
    {
      id: 'act-6',
      action_type: 'message_sent',
      title: 'Broadcast Announcement Dispatched',
      description: 'Sent scheduled regulatory compliance checklist to all active pharmacy outlets in Lagos state.',
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: now - 18 * hourMs,
      metadata: {
        channel: 'In-App',
      },
    },
    {
      id: 'act-7',
      action_type: 'password_reset',
      title: 'Store Manager Password Reset',
      description: 'Generated secure one-time credentials token upon owner phone verification.',
      pharmacy_id: 'ph-4',
      pharmacy_name: 'PharmaFirst Express #1',
      performed_by: {
        name: 'Admin User',
        email: 'medihub.infotech@gmail.com',
        role: 'Super Admin',
      },
      timestamp: now - 26 * hourMs,
    },
    {
      id: 'act-8',
      action_type: 'subscription_renewed',
      title: 'Renewed Premium Subscription',
      description: 'Quarterly subscription extension processed for ₦342,000.',
      pharmacy_id: 'ph-2',
      pharmacy_name: 'Green Cross Chemist #1',
      performed_by: {
        name: 'Babatunde Fashola',
        email: 'billing@pharmacyflow.ng',
        role: 'Billing Specialist',
      },
      timestamp: now - 42 * hourMs,
      metadata: {
        plan: 'Premium',
        amount: 342000,
      },
    },
  ];
};

export const generateInitialScheduledAlerts = (): ScheduledAlert[] => {
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;

  return [
    {
      id: 'sch-1',
      title: 'Monthly Data Backup & Maintenance Window',
      message: 'Scheduled POS system optimization: terminals will undergo background sync between 02:00 AM - 04:00 AM. No manual action required.',
      channel: 'In-App',
      target_type: 'all',
      target_count: 500,
      scheduled_for: new Date(now + 2 * dayMs).toISOString(),
      status: 'pending',
      created_at: now - 3600000,
      created_by: 'Admin User (Super Admin)',
    },
    {
      id: 'sch-2',
      title: 'NAFDAC Batch Verification Reminder',
      message: 'Notice to all Lagos state pharmacies: please upload your weekly narcotic dispensary registers before Friday 5:00 PM.',
      channel: 'SMS',
      target_type: 'selected',
      target_count: 14,
      scheduled_for: new Date(now + 4 * dayMs).toISOString(),
      status: 'pending',
      created_at: now - 7200000,
      created_by: 'Pharm. Chidinma Eze (Compliance Lead)',
      store_names: ['City Care Pharmacy #1', 'MediHub Lekki', 'Beacon Drug Store #1'],
    },
  ];
};

export type ReferralRewardType = 
  | 'cash_transfer' 
  | 'subscription_credit' 
  | 'drug_voucher' 
  | 'hardware_perk' 
  | 'sms_bundle';

export type ReferralStatus = 'pending' | 'converted' | 'rewarded' | 'expired';
export type RewardStatus = 'unclaimed' | 'issued' | 'paid' | 'ineligible';

export interface Referral {
  id: string;
  referrer_name: string;
  referrer_phone: string;
  referrer_email: string;
  referrer_type: 'customer' | 'pharmacy_partner' | 'field_agent';
  referral_code: string;
  referred_name: string;
  referred_phone: string;
  referred_email?: string;
  referred_type: 'pharmacy' | 'individual_customer';
  state: string;
  date_referred: string; // ISO
  status: ReferralStatus;
  conversion_date?: string;
  subscription_plan?: SubscriptionPlan;
  order_value_ngn?: number;
  reward_status: RewardStatus;
  eligible_reward_title?: string;
  eligible_reward_type?: ReferralRewardType;
  eligible_reward_value?: number;
  reward_details?: {
    reward_id: string;
    reward_type: ReferralRewardType;
    entitlement_title: string;
    value_ngn: number;
    voucher_code?: string;
    bank_name?: string;
    account_number?: string;
    disbursed_at: string;
    disbursed_by: string;
    notes?: string;
  };
}

export interface CustomerReferrer {
  id: string;
  name: string;
  phone: string;
  email: string;
  type: 'customer' | 'pharmacy_partner' | 'field_agent';
  referral_code: string;
  tier: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
  total_referrals: number;
  converted_referrals: number;
  pending_referrals: number;
  total_earned_ngn: number;
  unclaimed_rewards_count: number;
  bank_details: {
    bank_name: string;
    account_number: string;
    account_name: string;
  };
  joined_date: string;
}

export interface EntitlementPreset {
  id: string;
  title: string;
  category: ReferralRewardType;
  value_ngn: number;
  description: string;
  tier_eligibility: string;
  instant_eligible: boolean;
}

export interface ReferralPayoutConfig {
  base_store_payout_ngn: number;
  base_customer_payout_ngn: number;
  tier_payouts: {
    bronze_ngn: number;
    silver_ngn: number;
    gold_ngn: number;
    platinum_ngn: number;
  };
  commission_percentage: number;
  min_withdrawal_threshold_ngn: number;
  payout_schedule: 'Instant NIBSS Settlement' | 'Weekly Batch (Every Friday)' | 'Bi-Weekly' | 'Monthly End';
  auto_sms_notification: boolean;
  terms_headline: string;
  terms_subtitle: string;
  client_referral_active: boolean;
  last_updated: string;
  last_updated_by: {
    name: string;
    role: string;
    email: string;
  };
}

export const generateInitialReferralPayoutConfig = (): ReferralPayoutConfig => ({
  base_store_payout_ngn: 10000,
  base_customer_payout_ngn: 3000,
  tier_payouts: {
    bronze_ngn: 10000,
    silver_ngn: 15000,
    gold_ngn: 25000,
    platinum_ngn: 50000,
  },
  commission_percentage: 10,
  min_withdrawal_threshold_ngn: 5000,
  payout_schedule: 'Instant NIBSS Settlement',
  auto_sms_notification: true,
  terms_headline: 'Earn up to ₦50,000 per verified pharmacy onboarded',
  terms_subtitle: 'Instant NIBSS cash credit directly to your verified Nigerian bank account upon referee subscription.',
  client_referral_active: true,
  last_updated: new Date().toISOString(),
  last_updated_by: {
    name: 'Admin User',
    role: 'Super Admin',
    email: 'medihub.infotech@gmail.com',
  },
});

export const generateInitialEntitlementPresets = (): EntitlementPreset[] => [
  {
    id: 'ent-1',
    title: '₦10,000 Direct Cash Payout',
    category: 'cash_transfer',
    value_ngn: 10000,
    description: 'Instant NIBSS credit to verified Nigerian bank account for single store onboarding.',
    tier_eligibility: 'All Tiers (Bronze+)',
    instant_eligible: true,
  },
  {
    id: 'ent-2',
    title: '1 Month Free Standard License',
    category: 'subscription_credit',
    value_ngn: 65000,
    description: 'Adds 30 days of Standard cloud POS subscription credit to the referrer pharmacy.',
    tier_eligibility: 'Silver & Gold Tier',
    instant_eligible: true,
  },
  {
    id: 'ent-3',
    title: '₦25,000 MediHub Wholesaler Voucher',
    category: 'drug_voucher',
    value_ngn: 25000,
    description: 'Redeemable voucher for stock orders on verified wholesale pharmaceutical supplies.',
    tier_eligibility: 'All Tiers',
    instant_eligible: true,
  },
  {
    id: 'ent-4',
    title: 'Free 2D Wireless Barcode Scanner',
    category: 'hardware_perk',
    value_ngn: 45000,
    description: 'Brand-new plug-and-play Bluetooth handheld scanner delivered to the store.',
    tier_eligibility: 'Gold & Platinum Tier (5+ Referrals)',
    instant_eligible: false,
  },
  {
    id: 'ent-5',
    title: '5,000 Free Promotional SMS Bundle',
    category: 'sms_bundle',
    value_ngn: 20000,
    description: 'Bulk SMS units credited to the store for marketing campaigns and patient reminders.',
    tier_eligibility: 'All Tiers',
    instant_eligible: true,
  },
  {
    id: 'ent-6',
    title: '₦50,000 Super Advocate Cash Bonus',
    category: 'cash_transfer',
    value_ngn: 50000,
    description: 'Quarterly milestone bonus payout for driving 10+ active pharmacy subscriptions.',
    tier_eligibility: 'Platinum Tier Exclusively',
    instant_eligible: true,
  },
];

export const generateInitialReferrers = (): CustomerReferrer[] => [
  {
    id: 'ref-user-1',
    name: 'Pharm. Chidinma Eze',
    phone: '+234 803 234 5678',
    email: 'chidinma.eze@gmail.com',
    type: 'pharmacy_partner',
    referral_code: 'CHIDI-PHARM-24',
    tier: 'Platinum',
    total_referrals: 14,
    converted_referrals: 11,
    pending_referrals: 3,
    total_earned_ngn: 235000,
    unclaimed_rewards_count: 2,
    bank_details: {
      bank_name: 'Guaranty Trust Bank (GTB)',
      account_number: '0123984571',
      account_name: 'Chidinma Ngozi Eze',
    },
    joined_date: '2026-01-14',
  },
  {
    id: 'ref-user-2',
    name: 'Dr. Olumide Adeleke',
    phone: '+234 802 888 4321',
    email: 'olumide.adeleke@citycare.ng',
    type: 'pharmacy_partner',
    referral_code: 'CITYCARE-LKO',
    tier: 'Gold',
    total_referrals: 9,
    converted_referrals: 7,
    pending_referrals: 2,
    total_earned_ngn: 145000,
    unclaimed_rewards_count: 1,
    bank_details: {
      bank_name: 'Zenith Bank PLC',
      account_number: '2081449901',
      account_name: 'Dr. Olumide Adeleke',
    },
    joined_date: '2026-02-01',
  },
  {
    id: 'ref-user-3',
    name: 'Pharm. Amaka Okonkwo',
    phone: '+234 814 776 2200',
    email: 'amaka.okonkwo@pharmaflow.com',
    type: 'customer',
    referral_code: 'AMAKA-WELLNESS',
    tier: 'Silver',
    total_referrals: 6,
    converted_referrals: 4,
    pending_referrals: 2,
    total_earned_ngn: 70000,
    unclaimed_rewards_count: 1,
    bank_details: {
      bank_name: 'Access Bank',
      account_number: '0719882234',
      account_name: 'Amaka Jennifer Okonkwo',
    },
    joined_date: '2026-03-10',
  },
  {
    id: 'ref-user-4',
    name: 'Ibrahim Danladi',
    phone: '+234 805 112 9087',
    email: 'i.danladi@kanopharm.org',
    type: 'field_agent',
    referral_code: 'DANLADI-NORTH-REP',
    tier: 'Gold',
    total_referrals: 12,
    converted_referrals: 9,
    pending_referrals: 3,
    total_earned_ngn: 190000,
    unclaimed_rewards_count: 1,
    bank_details: {
      bank_name: 'First Bank of Nigeria',
      account_number: '3044910283',
      account_name: 'Ibrahim Danladi',
    },
    joined_date: '2026-02-18',
  },
  {
    id: 'ref-user-5',
    name: 'Folashade Balogun',
    phone: '+234 818 334 9912',
    email: 'f.balogun@ibadanmed.ng',
    type: 'customer',
    referral_code: 'SHADE-IBADAN',
    tier: 'Bronze',
    total_referrals: 3,
    converted_referrals: 2,
    pending_referrals: 1,
    total_earned_ngn: 20000,
    unclaimed_rewards_count: 0,
    bank_details: {
      bank_name: 'Kuda Microfinance Bank',
      account_number: '2001994821',
      account_name: 'Folashade Balogun',
    },
    joined_date: '2026-04-05',
  },
];

export const generateInitialReferrals = (): Referral[] => {
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;

  return [
    {
      id: 'ref-101',
      referrer_name: 'Pharm. Chidinma Eze',
      referrer_phone: '+234 803 234 5678',
      referrer_email: 'chidinma.eze@gmail.com',
      referrer_type: 'pharmacy_partner',
      referral_code: 'CHIDI-PHARM-24',
      referred_name: 'LifeLink Pharmacy Surulere',
      referred_phone: '+234 803 999 1122',
      referred_email: 'lifelink.surulere@yahoo.com',
      referred_type: 'pharmacy',
      state: 'Lagos (Surulere)',
      date_referred: new Date(now - 4 * dayMs).toISOString(),
      status: 'converted',
      conversion_date: new Date(now - 1 * dayMs).toISOString(),
      subscription_plan: 'Premium',
      order_value_ngn: 120000,
      reward_status: 'unclaimed',
      eligible_reward_title: '₦25,000 MediHub Wholesaler Voucher',
      eligible_reward_type: 'drug_voucher',
      eligible_reward_value: 25000,
    },
    {
      id: 'ref-102',
      referrer_name: 'Dr. Olumide Adeleke',
      referrer_phone: '+234 802 888 4321',
      referrer_email: 'olumide.adeleke@citycare.ng',
      referrer_type: 'pharmacy_partner',
      referral_code: 'CITYCARE-LKO',
      referred_name: 'Apex Health Chemist Lekki Phase 1',
      referred_phone: '+234 802 334 8877',
      referred_email: 'apexhealth.lekki@gmail.com',
      referred_type: 'pharmacy',
      state: 'Lagos (Lekki)',
      date_referred: new Date(now - 6 * dayMs).toISOString(),
      status: 'converted',
      conversion_date: new Date(now - 2 * dayMs).toISOString(),
      subscription_plan: 'Standard',
      order_value_ngn: 65000,
      reward_status: 'unclaimed',
      eligible_reward_title: '1 Month Free Standard License',
      eligible_reward_type: 'subscription_credit',
      eligible_reward_value: 65000,
    },
    {
      id: 'ref-103',
      referrer_name: 'Ibrahim Danladi',
      referrer_phone: '+234 805 112 9087',
      referrer_email: 'i.danladi@kanopharm.org',
      referrer_type: 'field_agent',
      referral_code: 'DANLADI-NORTH-REP',
      referred_name: 'PurePharma Direct Fagge',
      referred_phone: '+234 806 772 1199',
      referred_email: 'fagge.purepharma@gmail.com',
      referred_type: 'pharmacy',
      state: 'Kano (Fagge)',
      date_referred: new Date(now - 8 * dayMs).toISOString(),
      status: 'converted',
      conversion_date: new Date(now - 3 * dayMs).toISOString(),
      subscription_plan: 'Enterprise',
      order_value_ngn: 250000,
      reward_status: 'unclaimed',
      eligible_reward_title: '₦50,000 Super Advocate Cash Bonus',
      eligible_reward_type: 'cash_transfer',
      eligible_reward_value: 50000,
    },
    {
      id: 'ref-104',
      referrer_name: 'Pharm. Amaka Okonkwo',
      referrer_phone: '+234 814 776 2200',
      referrer_email: 'amaka.okonkwo@pharmaflow.com',
      referrer_type: 'customer',
      referral_code: 'AMAKA-WELLNESS',
      referred_name: 'Zenith Drug Mart Independence Layout',
      referred_phone: '+234 814 554 1188',
      referred_email: 'enugu.zenithdrug@gmail.com',
      referred_type: 'pharmacy',
      state: 'Enugu (Independence Layout)',
      date_referred: new Date(now - 12 * dayMs).toISOString(),
      status: 'rewarded',
      conversion_date: new Date(now - 7 * dayMs).toISOString(),
      subscription_plan: 'Standard',
      order_value_ngn: 65000,
      reward_status: 'paid',
      eligible_reward_title: '₦10,000 Direct Cash Payout',
      eligible_reward_type: 'cash_transfer',
      eligible_reward_value: 10000,
      reward_details: {
        reward_id: 'rew-901',
        reward_type: 'cash_transfer',
        entitlement_title: '₦10,000 Direct Cash Payout',
        value_ngn: 10000,
        bank_name: 'Access Bank',
        account_number: '0719882234',
        disbursed_at: new Date(now - 6 * dayMs).toISOString(),
        disbursed_by: 'Babatunde Fashola (Billing Specialist)',
        notes: 'NIBSS transaction ref #PAY-992144 settled immediately.',
      },
    },
    {
      id: 'ref-105',
      referrer_name: 'Pharm. Chidinma Eze',
      referrer_phone: '+234 803 234 5678',
      referrer_email: 'chidinma.eze@gmail.com',
      referrer_type: 'pharmacy_partner',
      referral_code: 'CHIDI-PHARM-24',
      referred_name: 'Beacon Drug Store Garki',
      referred_phone: '+234 809 112 4433',
      referred_email: 'garki.beacon@gmail.com',
      referred_type: 'pharmacy',
      state: 'Abuja (Garki)',
      date_referred: new Date(now - 15 * dayMs).toISOString(),
      status: 'rewarded',
      conversion_date: new Date(now - 10 * dayMs).toISOString(),
      subscription_plan: 'Premium',
      order_value_ngn: 120000,
      reward_status: 'issued',
      eligible_reward_title: 'Free 2D Wireless Barcode Scanner',
      eligible_reward_type: 'hardware_perk',
      eligible_reward_value: 45000,
      reward_details: {
        reward_id: 'rew-902',
        reward_type: 'hardware_perk',
        entitlement_title: 'Free 2D Wireless Barcode Scanner',
        value_ngn: 45000,
        voucher_code: 'HW-PERK-SCAN-8819',
        disbursed_at: new Date(now - 9 * dayMs).toISOString(),
        disbursed_by: 'Admin User (Super Admin)',
        notes: 'Dispatched via GIG Logistics tracking #GIG-LAG-98124.',
      },
    },
    {
      id: 'ref-106',
      referrer_name: 'Dr. Olumide Adeleke',
      referrer_phone: '+234 802 888 4321',
      referrer_email: 'olumide.adeleke@citycare.ng',
      referrer_type: 'pharmacy_partner',
      referral_code: 'CITYCARE-LKO',
      referred_name: 'SafeStep Chemists Ikeja GRA',
      referred_phone: '+234 807 443 2211',
      referred_email: 'safestep.ikeja@gmail.com',
      referred_type: 'pharmacy',
      state: 'Lagos (Ikeja)',
      date_referred: new Date(now - 3 * dayMs).toISOString(),
      status: 'pending',
      reward_status: 'unclaimed',
      eligible_reward_title: '₦10,000 Direct Cash Payout',
      eligible_reward_type: 'cash_transfer',
      eligible_reward_value: 10000,
    },
    {
      id: 'ref-107',
      referrer_name: 'Folashade Balogun',
      referrer_phone: '+234 818 334 9912',
      referrer_email: 'f.balogun@ibadanmed.ng',
      referrer_type: 'customer',
      referral_code: 'SHADE-IBADAN',
      referred_name: 'Vitality Plus Drugs Bodija',
      referred_phone: '+234 812 667 9900',
      referred_email: 'vitalityplus.bodija@gmail.com',
      referred_type: 'pharmacy',
      state: 'Oyo (Ibadan)',
      date_referred: new Date(now - 1 * dayMs).toISOString(),
      status: 'pending',
      reward_status: 'unclaimed',
      eligible_reward_title: '₦10,000 Direct Cash Payout',
      eligible_reward_type: 'cash_transfer',
      eligible_reward_value: 10000,
    },
    {
      id: 'ref-108',
      referrer_name: 'Pharm. Chidinma Eze',
      referrer_phone: '+234 803 234 5678',
      referrer_email: 'chidinma.eze@gmail.com',
      referrer_type: 'pharmacy_partner',
      referral_code: 'CHIDI-PHARM-24',
      referred_name: 'Crown Pharma Asaba',
      referred_phone: '+234 803 881 2244',
      referred_email: 'crown.pharma.asaba@gmail.com',
      referred_type: 'pharmacy',
      state: 'Delta (Asaba)',
      date_referred: new Date(now - 5 * dayMs).toISOString(),
      status: 'converted',
      conversion_date: new Date(now - 2 * dayMs).toISOString(),
      subscription_plan: 'Standard',
      order_value_ngn: 65000,
      reward_status: 'unclaimed',
      eligible_reward_title: '5,000 Free Promotional SMS Bundle',
      eligible_reward_type: 'sms_bundle',
      eligible_reward_value: 20000,
    },
    {
      id: 'ref-109',
      referrer_name: 'Ibrahim Danladi',
      referrer_phone: '+234 805 112 9087',
      referrer_email: 'i.danladi@kanopharm.org',
      referrer_type: 'field_agent',
      referral_code: 'DANLADI-NORTH-REP',
      referred_name: 'Sunrise Care Barnawa',
      referred_phone: '+234 805 444 3322',
      referred_email: 'sunrise.barnawa@gmail.com',
      referred_type: 'pharmacy',
      state: 'Kaduna (Barnawa)',
      date_referred: new Date(now - 18 * dayMs).toISOString(),
      status: 'rewarded',
      conversion_date: new Date(now - 14 * dayMs).toISOString(),
      subscription_plan: 'Standard',
      order_value_ngn: 65000,
      reward_status: 'paid',
      eligible_reward_title: '₦10,000 Direct Cash Payout',
      eligible_reward_type: 'cash_transfer',
      eligible_reward_value: 10000,
      reward_details: {
        reward_id: 'rew-903',
        reward_type: 'cash_transfer',
        entitlement_title: '₦10,000 Direct Cash Payout',
        value_ngn: 10000,
        bank_name: 'First Bank of Nigeria',
        account_number: '3044910283',
        disbursed_at: new Date(now - 13 * dayMs).toISOString(),
        disbursed_by: 'Admin User (Super Admin)',
        notes: 'Settled via auto-NIBSS disbursement batch #REF-B12.',
      },
    },
    {
      id: 'ref-110',
      referrer_name: 'Folashade Balogun',
      referrer_phone: '+234 818 334 9912',
      referrer_email: 'f.balogun@ibadanmed.ng',
      referrer_type: 'customer',
      referral_code: 'SHADE-IBADAN',
      referred_name: 'NatureCure Botanicals Dugbe',
      referred_phone: '+234 818 990 1234',
      referred_email: 'naturecure.dugbe@gmail.com',
      referred_type: 'pharmacy',
      state: 'Oyo (Ibadan)',
      date_referred: new Date(now - 22 * dayMs).toISOString(),
      status: 'rewarded',
      conversion_date: new Date(now - 17 * dayMs).toISOString(),
      subscription_plan: 'Basic',
      order_value_ngn: 30000,
      reward_status: 'paid',
      eligible_reward_title: '₦10,000 Direct Cash Payout',
      eligible_reward_type: 'cash_transfer',
      eligible_reward_value: 10000,
      reward_details: {
        reward_id: 'rew-904',
        reward_type: 'cash_transfer',
        entitlement_title: '₦10,000 Direct Cash Payout',
        value_ngn: 10000,
        bank_name: 'Kuda Microfinance Bank',
        account_number: '2001994821',
        disbursed_at: new Date(now - 16 * dayMs).toISOString(),
        disbursed_by: 'Babatunde Fashola (Billing Specialist)',
        notes: 'Disbursed to Kuda wallet successfully.',
      },
    },
  ];
};

export type AnalyticsTimeframe = '7days' | '14days' | '1month' | '3month' | '6month' | '1year';

export interface SubscriptionPayment {
  id: string;
  pharmacy_id: string;
  pharmacy_name: string;
  owner_name: string;
  state: string;
  plan: SubscriptionPlan;
  cycle: SubscriptionCycle;
  amount_paid: number; // in NGN
  payment_date: string; // ISO string
  timestamp: number; // epoch ms
  payment_method: 'NIBSS Instant Settlement' | 'Debit Card (Paystack/Flutterwave)' | 'Direct Bank Deposit' | 'POS Terminal Transfer';
  reference_no: string;
  status: 'successful' | 'refunded';
}

export const generateMockSubscriptionPayments = (pharmacies: Pharmacy[]): SubscriptionPayment[] => {
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;
  const methods: SubscriptionPayment['payment_method'][] = [
    'NIBSS Instant Settlement',
    'Debit Card (Paystack/Flutterwave)',
    'Direct Bank Deposit',
    'POS Terminal Transfer',
  ];

  const payments: SubscriptionPayment[] = [];
  const totalCount = Math.min(pharmacies.length, 360);

  for (let i = 0; i < totalCount; i++) {
    const pharmacy = pharmacies[i % pharmacies.length];
    
    // Distribute timestamps smoothly:
    // First 25 payments: within 7 days
    // Next 35 payments: within 14 days
    // Next 60 payments: within 30 days (1 month)
    // Next 90 payments: within 90 days (3 months)
    // Next 70 payments: within 180 days (6 months)
    // Remainder: within 365 days (1 year)
    let daysAgo: number;
    if (i < 25) {
      daysAgo = (i * 0.28) % 6.8; // 0 to 6.8 days
    } else if (i < 60) {
      daysAgo = 7 + ((i - 25) * 0.2) % 6.8; // 7 to 13.8 days
    } else if (i < 120) {
      daysAgo = 14 + ((i - 60) * 0.26) % 15.5; // 14 to 29.5 days
    } else if (i < 210) {
      daysAgo = 30 + ((i - 120) * 0.65) % 59; // 30 to 89 days
    } else if (i < 280) {
      daysAgo = 90 + ((i - 210) * 1.25) % 89; // 90 to 179 days
    } else {
      daysAgo = 180 + ((i - 280) * 2.25) % 180; // 180 to 360 days
    }

    const paymentTime = now - Math.floor(daysAgo * dayMs) - ((i * 37) % 86400000);
    const plan = pharmacy.subscription_plan || 'Standard';
    const cycle = pharmacy.subscription_cycle || (i % 3 === 0 ? 'Annual' : i % 2 === 0 ? 'Quarterly' : 'Monthly');
    const basePrice = PLAN_PRICES[plan];
    const amount = cycle === 'Annual' 
      ? basePrice * 12 * 0.8 
      : cycle === 'Quarterly' 
      ? basePrice * 3 * 0.95 
      : basePrice;

    const method = methods[i % methods.length];
    const stateAbbr = pharmacy.state.slice(0, 3).toUpperCase();
    const refCode = `${method.slice(0, 4).toUpperCase()}-${stateAbbr}-${100000 + ((i * 739) % 900000)}`;

    payments.push({
      id: `sub-pay-${i + 1}`,
      pharmacy_id: pharmacy.id,
      pharmacy_name: pharmacy.business_name,
      owner_name: pharmacy.owner_name,
      state: pharmacy.state,
      plan: plan,
      cycle: cycle,
      amount_paid: amount,
      payment_date: new Date(paymentTime).toISOString(),
      timestamp: paymentTime,
      payment_method: method,
      reference_no: refCode,
      status: 'successful',
    });
  }

  // Sort descending by payment date
  return payments.sort((a, b) => b.timestamp - a.timestamp);
};

export type ExpenseType = 'onetime' | 'recurring';
export type ExpenseFrequency = 'weekly' | 'monthly' | 'quarterly' | 'annual';
export type ExpenseCategory = 
  | 'Infrastructure & Cloud' 
  | 'Salaries & Field Support' 
  | 'SMS & Telecom APIs' 
  | 'Marketing & Outreach' 
  | 'Hardware & POS Terminals' 
  | 'Compliance & Licensing' 
  | 'Office & Operations';

export interface Expense {
  id: string;
  title: string;
  category: ExpenseCategory;
  amount: number; // in NGN
  type: ExpenseType; // 'onetime' | 'recurring'
  frequency?: ExpenseFrequency; // 'weekly' | 'monthly' | 'quarterly' | 'annual'
  date: string; // ISO date string
  timestamp: number; // epoch ms
  vendor: string;
  payment_method: string;
  receipt_ref?: string;
  notes?: string;
  recorded_by: string;
  status: 'paid' | 'scheduled' | 'active';
}

export const generateInitialExpenses = (): Expense[] => {
  const now = Date.now();
  const dayMs = 24 * 3600 * 1000;

  return [
    {
      id: 'exp-rec-1',
      title: 'AWS Cloud EC2 & Aurora Multi-AZ Database Instances',
      category: 'Infrastructure & Cloud',
      amount: 450000,
      type: 'recurring',
      frequency: 'monthly',
      date: new Date(now - 28 * dayMs).toISOString(),
      timestamp: now - 28 * dayMs,
      vendor: 'Amazon Web Services (AWS)',
      payment_method: 'Corporate USD Card',
      receipt_ref: 'AWS-INV-2026-904',
      notes: 'Centralized Postgres database for 500+ pharmacy cloud inventory sync.',
      recorded_by: 'Super Admin (Finance)',
      status: 'active',
    },
    {
      id: 'exp-rec-2',
      title: 'Termii SMS Gateway & WhatsApp 2FA Dispatch API',
      category: 'SMS & Telecom APIs',
      amount: 180000,
      type: 'recurring',
      frequency: 'monthly',
      date: new Date(now - 25 * dayMs).toISOString(),
      timestamp: now - 25 * dayMs,
      vendor: 'Termii Technologies',
      payment_method: 'Direct Bank Transfer',
      receipt_ref: 'TRM-NG-4482',
      notes: 'Transaction OTPs and renewal reminders dispatched to pharmacy owners.',
      recorded_by: 'Engineering Lead',
      status: 'active',
    },
    {
      id: 'exp-rec-3',
      title: 'Technical Support Engineers & Pharmacy Field Agents Payroll',
      category: 'Salaries & Field Support',
      amount: 1450000,
      type: 'recurring',
      frequency: 'monthly',
      date: new Date(now - 20 * dayMs).toISOString(),
      timestamp: now - 20 * dayMs,
      vendor: 'Workforce Operations Lagos',
      payment_method: 'NIBSS Batch Salary Transfer',
      receipt_ref: 'PAYROLL-M09-881',
      notes: 'Monthly stipends for 6 full-time pharmacist integration field specialists.',
      recorded_by: 'Super Admin (HR & Ops)',
      status: 'active',
    },
    {
      id: 'exp-rec-4',
      title: 'NAFDAC Drug Verification & Controlled Substance API License',
      category: 'Compliance & Licensing',
      amount: 85000,
      type: 'recurring',
      frequency: 'monthly',
      date: new Date(now - 14 * dayMs).toISOString(),
      timestamp: now - 14 * dayMs,
      vendor: 'NAFDAC Regulatory Portal',
      payment_method: 'Remita Central Settlement',
      receipt_ref: 'REM-NAF-1193',
      notes: 'Real-time barcode validation against Nigeria fake drug registry.',
      recorded_by: 'Compliance Officer',
      status: 'active',
    },
    {
      id: 'exp-rec-5',
      title: 'Paystack & NIBSS Gateway Settlement Integration Retainer',
      category: 'Compliance & Licensing',
      amount: 95000,
      type: 'recurring',
      frequency: 'monthly',
      date: new Date(now - 10 * dayMs).toISOString(),
      timestamp: now - 10 * dayMs,
      vendor: 'Paystack Payments Limited',
      payment_method: 'Automated Account Debit',
      receipt_ref: 'PSTK-RETAIN-702',
      notes: 'Direct settlement reconciliation and dispute webhook handlers.',
      recorded_by: 'Super Admin (Finance)',
      status: 'active',
    },
    {
      id: 'exp-rec-6',
      title: 'High-Speed Fiber Dedicated Internet for Operations Centre',
      category: 'Office & Operations',
      amount: 65000,
      type: 'recurring',
      frequency: 'monthly',
      date: new Date(now - 8 * dayMs).toISOString(),
      timestamp: now - 8 * dayMs,
      vendor: 'FiberOne Broadband Ikeja',
      payment_method: 'Debit Card',
      receipt_ref: 'FIB-LAG-5521',
      notes: 'Dedicated 100Mbps link for customer support desk and monitoring.',
      recorded_by: 'Operations Manager',
      status: 'active',
    },
    {
      id: 'exp-one-1',
      title: 'Bulk Thermal POS Receipt Printers & Barcode Scanners (Batch 14)',
      category: 'Hardware & POS Terminals',
      amount: 920000,
      type: 'onetime',
      date: new Date(now - 4 * dayMs).toISOString(),
      timestamp: now - 4 * dayMs,
      vendor: 'Hardware Direct Nigeria Ltd',
      payment_method: 'Direct Bank Transfer',
      receipt_ref: 'HDN-INVOICE-3301',
      notes: 'Procurement of 40 wireless Bluetooth thermal printers for newly onboarded pharmacies.',
      recorded_by: 'Super Admin (Procurement)',
      status: 'paid',
    },
    {
      id: 'exp-one-2',
      title: 'Lagos & Ogun State Pharmacists Community WhatsApp Blast Campaign',
      category: 'Marketing & Outreach',
      amount: 320000,
      type: 'onetime',
      date: new Date(now - 9 * dayMs).toISOString(),
      timestamp: now - 9 * dayMs,
      vendor: 'PharmaLead Media Agency',
      payment_method: 'Debit Card',
      receipt_ref: 'PLM-AD-771',
      notes: 'Targeted campaign delivering demo videos to 1,200 retail pharmacy superintendents.',
      recorded_by: 'Growth Lead',
      status: 'paid',
    },
    {
      id: 'exp-one-3',
      title: 'Pharmaceutical Society of Nigeria (PSN) Annual Exhibition Booth',
      category: 'Marketing & Outreach',
      amount: 650000,
      type: 'onetime',
      date: new Date(now - 22 * dayMs).toISOString(),
      timestamp: now - 22 * dayMs,
      vendor: 'PSN National Secretariat',
      payment_method: 'Direct Bank Transfer',
      receipt_ref: 'PSN-BOOTH-2026',
      notes: 'Live software kiosk and branded banners at the annual pharmacists congress.',
      recorded_by: 'Super Admin',
      status: 'paid',
    },
    {
      id: 'exp-one-4',
      title: 'PCN (Pharmacy Council of Nigeria) Digital Integration Security Audit',
      category: 'Compliance & Licensing',
      amount: 450000,
      type: 'onetime',
      date: new Date(now - 42 * dayMs).toISOString(),
      timestamp: now - 42 * dayMs,
      vendor: 'CyberShield Security Ltd',
      payment_method: 'Direct Bank Transfer',
      receipt_ref: 'CSS-AUDIT-992',
      notes: 'Third-party penetration testing and patient prescription privacy certification.',
      recorded_by: 'Compliance Officer',
      status: 'paid',
    },
    {
      id: 'exp-one-5',
      title: 'Office Ergonomic Workstations & POS Testing Stand Procurement',
      category: 'Office & Operations',
      amount: 380000,
      type: 'onetime',
      date: new Date(now - 75 * dayMs).toISOString(),
      timestamp: now - 75 * dayMs,
      vendor: 'Modern Office Solutions VI',
      payment_method: 'Corporate Bank Transfer',
      receipt_ref: 'MOS-VI-4491',
      notes: 'Setup of hardware QA testing lab for pharmacy POS terminals.',
      recorded_by: 'Operations Manager',
      status: 'paid',
    }
  ];
};

export type TicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';
export type TicketPriority = 'urgent' | 'high' | 'medium' | 'low';
export type TicketCategory = 
  | 'Technical & POS Hardware'
  | 'Billing & Subscription'
  | 'Referral & Rewards'
  | 'Inventory & Cloud Sync'
  | 'NAFDAC & Compliance'
  | 'Account & Access';

export interface TicketMessage {
  id: string;
  sender_type: 'client' | 'admin';
  sender_name: string;
  sender_role?: string;
  message: string;
  timestamp: number;
  internal_note?: boolean;
}

export interface SupportTicket {
  id: string;
  ticket_number: string;
  pharmacy_id: string;
  pharmacy_name: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  state: string;
  subject: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  channel: 'Client Portal' | 'In-App POS' | 'WhatsApp' | 'Phone Call' | 'Email';
  created_at: number;
  updated_at: number;
  assigned_to?: string;
  messages: TicketMessage[];
}

export const generateInitialSupportTickets = (pharmacies: Pharmacy[]): SupportTicket[] => {
  const now = Date.now();
  const hourMs = 3600 * 1000;
  const dayMs = 24 * hourMs;

  const findPharmacy = (name: string): Pharmacy => {
    return pharmacies.find(p => p.business_name.toLowerCase().includes(name.toLowerCase())) || pharmacies[0] || {
      id: 'pharm-1',
      business_name: 'City Care Pharmacy',
      owner_name: 'Pharm. Chinedu Okafor',
      status: 'active',
      daily_sales: 450000,
      last_sync_date: new Date().toISOString(),
      subscription_status: 'active',
      subscription_plan: 'Standard',
      subscription_cycle: 'Monthly',
      subscription_expiry: new Date(now + 30 * dayMs).toISOString(),
      subscription_cost: 65000,
      state: 'Lagos',
      phone: '+234 803 219 4481',
      email: 'citycare.ikeja@gmail.com',
    };
  };

  const p1 = findPharmacy('City Care');
  const p2 = findPharmacy('Green Cross');
  const p3 = findPharmacy('MediHub');
  const p4 = findPharmacy('QuickMeds');
  const p5 = findPharmacy('NatureCure');

  return [
    {
      id: 'tick-1042',
      ticket_number: 'TICK-1042',
      pharmacy_id: p1.id,
      pharmacy_name: p1.business_name,
      client_name: p1.owner_name || 'Pharm. Chinedu Okafor',
      client_email: p1.email || 'citycare.ikeja@gmail.com',
      client_phone: p1.phone || '+234 803 219 4481',
      state: p1.state || 'Lagos',
      subject: 'Bluetooth Thermal Printer drops connection during evening checkout peak',
      category: 'Technical & POS Hardware',
      priority: 'urgent',
      status: 'open',
      channel: 'Client Portal',
      created_at: now - 3 * hourMs,
      updated_at: now - 3 * hourMs,
      assigned_to: 'Unassigned',
      messages: [
        {
          id: 'msg-1',
          sender_type: 'client',
          sender_name: p1.owner_name || 'Pharm. Chinedu Okafor',
          sender_role: 'Superintendent Pharmacist',
          message: 'Good afternoon support team. Our newly delivered wireless thermal receipt printer (Batch 14) keeps dropping Bluetooth connection to the Android POS tablet whenever we have more than 4 customers waiting in line. We had to issue handwritten receipts for 3 customers earlier. Please advise or send replacement configuration steps urgently.',
          timestamp: now - 3 * hourMs,
        }
      ]
    },
    {
      id: 'tick-1039',
      ticket_number: 'TICK-1039',
      pharmacy_id: p2.id,
      pharmacy_name: p2.business_name,
      client_name: p2.owner_name || 'Dr. Folashade Adebayo',
      client_email: p2.email || 'greencross.garki@gmail.com',
      client_phone: p2.phone || '+234 802 891 3320',
      state: p2.state || 'Abuja FCT',
      subject: 'Referral cash payout delayed into Kuda Microfinance Bank wallet',
      category: 'Referral & Rewards',
      priority: 'high',
      status: 'in_progress',
      channel: 'Client Portal',
      created_at: now - 8 * hourMs,
      updated_at: now - 1 * hourMs,
      assigned_to: 'Babatunde Fashola (Billing Specialist)',
      messages: [
        {
          id: 'msg-2',
          sender_type: 'client',
          sender_name: p2.owner_name || 'Dr. Folashade Adebayo',
          sender_role: 'Managing Director',
          message: 'Hello PharmacyFlow Admin, I referred Apex Health Pharmacy last week under the new ₦15,000 onboarding bounty program. The dashboard displays status as "Rewarded", but my Kuda account 2001994821 has not received the NIBSS credit alert yet. Please look into the disbursement reference code.',
          timestamp: now - 8 * hourMs,
        },
        {
          id: 'msg-3',
          sender_type: 'admin',
          sender_name: 'Babatunde Fashola',
          sender_role: 'Billing & Settlement Specialist',
          message: 'Hello Dr. Folashade, thank you for contacting us. We reviewed your referral payout record for Apex Health Pharmacy. The NIBSS instant settlement batch had a temporary gateway queue on Friday evening. Our finance team has re-dispatched the ₦15,000 credit to your Kuda Microfinance account. You should receive the SMS credit notification shortly. Ref: DISB-KUDA-8819.',
          timestamp: now - 1 * hourMs,
        }
      ]
    },
    {
      id: 'tick-1035',
      ticket_number: 'TICK-1035',
      pharmacy_id: p3.id,
      pharmacy_name: p3.business_name,
      client_name: p3.owner_name || 'Pharm. Ibrahim Musa',
      client_email: p3.email || 'medihub.vi@gmail.com',
      client_phone: p3.phone || '+234 805 119 7731',
      state: p3.state || 'Lagos',
      subject: 'NAFDAC Barcode verification API timeout for newly received anti-malarial stock',
      category: 'NAFDAC & Compliance',
      priority: 'medium',
      status: 'open',
      channel: 'In-App POS',
      created_at: now - 14 * hourMs,
      updated_at: now - 14 * hourMs,
      assigned_to: 'Aisha Bello (Technical Lead)',
      messages: [
        {
          id: 'msg-4',
          sender_type: 'client',
          sender_name: p3.owner_name || 'Pharm. Ibrahim Musa',
          sender_role: 'Chief Pharmacist',
          message: 'Greetings support. When barcode-scanning our newly delivered packs of Coartem and Lonart, the cloud POS returns an error: "NAFDAC Regulatory Registry Gateway Timeout (504)". Is the federal drug verification directory undergoing scheduled maintenance, or should we update our local sync settings?',
          timestamp: now - 14 * hourMs,
        }
      ]
    },
    {
      id: 'tick-1028',
      ticket_number: 'TICK-1028',
      pharmacy_id: p4.id,
      pharmacy_name: p4.business_name,
      client_name: p4.owner_name || 'Dr. Ngozi Eze',
      client_email: p4.email || 'quickmeds.ph@gmail.com',
      client_phone: p4.phone || '+234 809 332 5590',
      state: p4.state || 'Rivers',
      subject: 'Debit card charged via Paystack but POS still displays "Expiring Soon" warning',
      category: 'Billing & Subscription',
      priority: 'high',
      status: 'open',
      channel: 'Client Portal',
      created_at: now - 22 * hourMs,
      updated_at: now - 22 * hourMs,
      assigned_to: 'Unassigned',
      messages: [
        {
          id: 'msg-5',
          sender_type: 'client',
          sender_name: p4.owner_name || 'Dr. Ngozi Eze',
          sender_role: 'Pharmacy Owner',
          message: 'Our corporate card was debited ₦65,000 for the Standard Quarterly renewal yesterday evening (Paystack Transaction Ref: PSTK-PH-99214). However, our checkout terminal in Port Harcourt still shows an orange banner saying subscription expires in 2 days. Kindly verify and refresh the license sync so our tills do not lock.',
          timestamp: now - 22 * hourMs,
        }
      ]
    },
    {
      id: 'tick-1017',
      ticket_number: 'TICK-1017',
      pharmacy_id: p5.id,
      pharmacy_name: p5.business_name,
      client_name: p5.owner_name || 'Pharm. Kemi Alabi',
      client_email: p5.email || 'naturecure.ibadan@gmail.com',
      client_phone: p5.phone || '+234 807 441 2289',
      state: p5.state || 'Oyo',
      subject: 'Request to configure restricted cashier profile for night shift dispenser',
      category: 'Account & Access',
      priority: 'low',
      status: 'resolved',
      channel: 'Client Portal',
      created_at: now - 2 * dayMs,
      updated_at: now - 1 * dayMs,
      assigned_to: 'Aisha Bello (Technical Lead)',
      messages: [
        {
          id: 'msg-6',
          sender_type: 'client',
          sender_name: p5.owner_name || 'Pharm. Kemi Alabi',
          sender_role: 'Superintendent Pharmacist',
          message: 'Can we create a secondary cashier login for our night attendant that prevents them from viewing wholesale profit margins and bulk inventory acquisition prices?',
          timestamp: now - 2 * dayMs,
        },
        {
          id: 'msg-7',
          sender_type: 'admin',
          sender_name: 'Aisha Bello',
          sender_role: 'Technical Support Lead',
          message: 'Hello Pharm. Kemi! Yes, absolutely. You can navigate to Settings > Staff Roles and toggle on "Cashier Restricted Mode". This enables dispensing and receipt printing while redacting wholesale costs. We have also provisioned this permission profile for NatureCure Botanicals.',
          timestamp: now - 1.5 * dayMs,
        },
        {
          id: 'msg-8',
          sender_type: 'client',
          sender_name: p5.owner_name || 'Pharm. Kemi Alabi',
          sender_role: 'Superintendent Pharmacist',
          message: 'Tested and verified on our main counter tablet. Thank you for the quick resolution!',
          timestamp: now - 1 * dayMs,
        }
      ]
    }
  ];
};



