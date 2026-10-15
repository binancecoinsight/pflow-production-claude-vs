/**
 * PharmacyFlow Database Contracts (Migrations M-1 through M-7)
 * Authoritative schema typings for client-side type safety
 */

export type UserRole = 'OWNER' | 'MANAGER' | 'PHARMACIST' | 'CASHIER';

export type MemberStatus = 'ACTIVE' | 'SUSPENDED' | 'INVITED';

export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';

export type DeviceStatus = 'ACTIVE' | 'BLOCKED' | 'DECOMMISSIONED';

export type DevicePlatform = 'ANDROID' | 'WINDOWS' | 'WEB' | 'IOS';

export interface UserProfile {
  id: string;
  full_name: string | null;
  phone_number: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pharmacy {
  id: string;
  name: string;
  owner_id: string;
  currency: string;
  subscription_plan?: string;
  subscription_expires_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Branch {
  id: string;
  pharmacy_id: string;
  name: string;
  address?: string | null;
  phone?: string | null;
  is_main: boolean;
  created_at: string;
  updated_at: string;
}

export interface PharmacyMember {
  id: string;
  user_id: string;
  pharmacy_id: string;
  role: UserRole;
  default_branch_id?: string | null;
  status: MemberStatus;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  role: UserRole;
  permission: string;
}

export interface SubscriptionPlan {
  code: string;
  name: string;
  max_branches: number;
  max_staff: number;
  monthly_price_ngn: number;
  monthly_price_usd: number;
  features: Record<string, unknown>;
  is_active: boolean;
}

export interface Subscription {
  id: string;
  pharmacy_id: string;
  plan_code: string;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancelled_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Device {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  registered_by: string;
  device_name: string;
  platform: DevicePlatform;
  is_hardware_keystore: boolean;
  public_key_pem: string;
  status: DeviceStatus;
  last_seen_at?: string | null;
  last_sync_at?: string | null;
  created_at: string;
}

export type CustomerStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';

export interface Customer {
  id: string;
  pharmacy_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  status: CustomerStatus;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = 'SETTLED' | 'PENDING_MANUAL' | 'UNCONFIRMED_EXTERNAL';

export type RegisterSessionStatus = 'OPEN' | 'CLOSED';

export interface CashRegisterSession {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  cashier_id: string;
  opened_at: string;
  closed_at?: string | null;
  opening_cash: number; // integer minor units
  counted_cash?: number | null; // integer minor units
  expected_cash?: number | null; // integer minor units
  variance?: number | null; // integer minor units
  notes?: string | null;
  status: RegisterSessionStatus;
  created_at: string;
  updated_at: string;
}

export type PurchaseStatus = 'COMPLETED' | 'PENDING' | 'CANCELLED';

export interface Purchase {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  supplier_id?: string | null;
  invoice_number?: string | null;
  total_cost: number; // integer minor units (e.g. kobo or cents)
  status: PurchaseStatus;
  client_op_id?: string | null;
  notes?: string | null;
  received_at?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface PurchaseItem {
  id: string;
  pharmacy_id: string;
  purchase_id: string;
  product_id: string;
  batch_id: string;
  quantity: number;
  unit_cost: number; // integer minor units (e.g. kobo or cents)
  total_cost: number; // integer minor units (e.g. kobo or cents)
  created_at: string;
}

export interface Supplier {
  id: string;
  pharmacy_id: string;
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  created_at: string;
}

export type StockMovementType = 
  | 'PURCHASE' 
  | 'SALE' 
  | 'RETURN' 
  | 'ADJUSTMENT' 
  | 'DEFICIT_RECONCILIATION' 
  | 'OPENING_BALANCE';

export interface StockLedgerEntry {
  id: string;
  pharmacy_id: string;
  branch_id?: string | null;
  product_id: string;
  batch_id: string;
  movement_type: StockMovementType;
  quantity_delta: number;
  resulting_batch_stock: number;
  reference_id: string;
  device_id?: string | null;
  notes?: string | null;
  created_at: string;
}

export type StockAdjustmentType = 'INCREASE' | 'DECREASE';

export interface StockAdjustment {
  id: string;
  pharmacy_id: string;
  branch_id: string;
  product_id: string;
  batch_id: string;
  adjustment_type: StockAdjustmentType;
  quantity_delta: number;
  previous_stock: number;
  resulting_stock: number;
  reason: string;
  notes?: string | null;
  client_op_id: string;
  payload_hash: string;
  adjusted_by: string;
  created_at: string;
}

