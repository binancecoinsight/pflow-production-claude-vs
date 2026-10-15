export interface Product {
  id: string;
  name: string;
  sku: string;
  alias?: string;
  category: string;
  subcategory?: string;
  price: number;
  wholesalePrice?: number;
  cost: number;
  stock: number;
  minStock: number;
  description?: string;
  expiryDate?: string;
  batchNumber?: string;
  model?: string;
  manufacturer?: string;
  type?: 'product' | 'service';
  active?: number;
}

export interface SaleItem {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  cost: number;
  originalPrice?: number;
  total: number;
  serialNumber?: string;
}

export interface Sale {
  id: string;
  receiptId?: string;
  timestamp: string;
  items: SaleItem[];
  totalAmount: number;
  paymentMethod: 'cash' | 'card' | 'debt' | 'other';
  accountId?: string;
  accountName?: string;
}

export interface User {
  id: string;
  name: string;
  username: string;
  role: string;
  roleId?: string;
  roleName?: string;
  active: boolean;
  branchId?: string;
  branchName?: string;
  createdBy?: string;
}

export interface Role {
  id: string;
  name: string;
  permissions: string[];
}

export interface Account {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
  totalDebt: number;
  debtLimit?: number;
  createdAt: string;
  dueDate?: string;
}

export interface AccountTransaction {
  id: string;
  accountId: string;
  saleId?: string;
  invoiceId?: string;
  amount: number;
  balance?: number;
  type: 'SALE' | 'PAYMENT' | 'INVOICE';
  notes: string;
  timestamp: string;
  saleCreatedAt?: string;
  attendantName?: string;
  dueDate?: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startDate: string;
  endDate?: string;
  type: 'holiday' | 'leave' | 'duty' | 'other';
  allDay: boolean;
  createdBy: string;
  createdAt: string;
  staffId?: string;
  staffName?: string;
}

export interface DashboardStats {
  totalSales: number;
  totalRevenue: number;
  totalProfit: number;
  totalExpenses: number;
  totalProducts?: number;
  dailyExpenses?: number;
  weeklyExpenses?: number;
  monthlyExpenses?: number;
  yearlyExpenses?: number;
  netProfit: number;
  salesChange?: string;
  revenueChange?: string;
  profitChange?: string;
  lowStockCount: number;
  expiringSoonCount: number;
  recentSales: Sale[];
  lowStockProducts?: { name: string; stock: number }[];
  expiringSoonProducts?: { name: string; expiryDate: string }[];
  weeklyRevenue?: { day: string; amount: number; expenses: number }[];
  upcomingEvents?: CalendarEvent[];
  reminders?: {
    type: 'invoice' | 'debt';
    id: string;
    title: string;
    amount: number;
    dueDate: string;
    customer: string;
  }[];
}

export interface Expense {
  id: string;
  description: string;
  amount: number;
  category: string;
  date: string;
  recurring: 'none' | 'daily' | 'weekly' | 'monthly';
  nextOccurrence?: string;
  createdAt: string;
}

export interface Return {
  id: string;
  saleId: string;
  productId: string;
  productName?: string;
  quantity: number;
  reason: string;
  returnedBy: string;
  timestamp: string;
  sentToVendor: boolean;
  sentToVendorDate?: string;
  vendorReplaced: boolean;
  vendorReplaceDate?: string;
  inShop: boolean;
  returnedToStoreDate?: string;
  status: 'customer_returned' | 'sent_to_vendor' | 'vendor_replaced' | 'completed';
}

export interface Supplier {
  id: string;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface Purchase {
  id: string;
  supplierId: string;
  supplierName?: string;
  timestamp: string;
  totalAmount: number;
  status: 'paid' | 'unpaid';
  dueDate?: string;
  items: PurchaseItem[];
}

export interface PurchaseItem {
  id: string;
  purchaseId: string;
  productId: string;
  productName?: string;
  quantity: number;
  cost: number;
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  productId?: string;
  productName: string;
  quantity: number;
  price: number;
  total: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  accountId: string;
  accountName: string;
  timestamp: string;
  dueDate?: string;
  status: 'paid' | 'unpaid' | 'overdue' | 'cancelled';
  items: InvoiceItem[];
  totalAmount: number;
  notes?: string;
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeEmail?: string;
  bankName?: string;
  accountName_store?: string;
  accountNumber_store?: string;
  templateId?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
}

export interface Referral {
  id: string;
  pharmacyId: string;
  code: string;
  referredPharmacyName: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  plan: string;
  status: 'pending' | 'invited' | 'signed_up' | 'subscribed';
  rewardAmount: number;
  rewardStatus: 'pending' | 'available' | 'redeemed';
  notes?: string;
  createdAt: string;
  rewardedAt?: string | null;
}

export interface ReferralPayout {
  id: string;
  pharmacyId: string;
  amount: number;
  type: 'subscription_credit' | 'bank_transfer';
  bankName?: string;
  accountNumber?: string;
  accountName?: string;
  status: string;
  reference: string;
  notes?: string;
  createdAt: string;
}

export interface ReferralSummary {
  referralCode: string;
  referralLink: string;
  walletBalance: number;
  totalEarned: number;
  totalRedeemed: number;
  pendingRewards: number;
  successfulCount: number;
  totalInvited: number;
  currentTier: string;
  nextTier: string;
  nextTierThreshold: number;
  commissionRate: string;
  refereeDiscount: string;
  referrals: Referral[];
  payouts: ReferralPayout[];
}

export interface Subscription {
  id: string;
  pharmacyId: string;
  planId: 'starter' | 'pro' | 'enterprise';
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  status: 'active' | 'past_due' | 'trial' | 'cancelled';
  amount: number;
  currency: string;
  startDate: string;
  currentPeriodEnd: string;
  autoRenew: boolean | number;
  paymentMethod: 'card' | 'bank_transfer' | 'credit';
  cardLast4?: string;
  cardBrand?: string;
  referralCreditApplied?: number;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionInvoice {
  id: string;
  pharmacyId: string;
  invoiceNumber: string;
  planName: string;
  billingCycle: 'monthly' | 'yearly';
  amount: number;
  discountApplied?: number;
  currency: string;
  status: 'paid' | 'pending' | 'refunded';
  paymentMethod: string;
  date: string;
  periodStart?: string;
  periodEnd?: string;
}

export interface PlanFeature {
  id: 'starter' | 'pro' | 'enterprise';
  name: string;
  description: string;
  badge?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  maxBranches: number;
  maxUsers: number;
  maxProducts: number;
  features: string[];
}
