import type { User } from '@supabase/supabase-js';

export type PlatformAdminRole = 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT';

export interface PlatformAdminRecord {
  user_id: string;
  platform_role: PlatformAdminRole;
  is_active: boolean;
  granted_at: string;
  notes?: string | null;
}

export type AdminAuthResult =
  | { status: 'authorized'; user: User; admin: PlatformAdminRecord }
  | { status: 'unauthenticated'; user: null; admin: null; reason: string }
  | { status: 'forbidden'; user: User; admin: null; reason: string }
  | { status: 'error'; user: null; admin: null; reason: string };

/**
 * Evaluates whether actualRole meets or exceeds the required platform role.
 * Role Hierarchy: SUPER_ADMIN (Level 3) > ADMIN (Level 2) > SUPPORT (Level 1)
 */
export function verifyAdminRole(
  requiredRole: PlatformAdminRole,
  actualRole: PlatformAdminRole
): boolean {
  if (actualRole === 'SUPER_ADMIN') return true;
  if (requiredRole === 'ADMIN' && actualRole === 'ADMIN') return true;
  if (requiredRole === 'SUPPORT' && (actualRole === 'ADMIN' || actualRole === 'SUPPORT')) return true;
  return false;
}

/**
 * Access matrix defining permission boundaries across the platform admin roles.
 * - SUPPORT: Operational view, assistance, tickets, customer care. Redacted financial ledger.
 * - ADMIN: Store management, renewals, suspensions, subscriptions, reports, expenses.
 * - SUPER_ADMIN: Full platform authority, payout rule changes, admin roster management.
 */
export const ROLE_ACCESS_MATRIX: Record<PlatformAdminRole, {
  canViewOverview: boolean;
  canViewSupportTickets: boolean;
  canManageSupportTickets: boolean;
  canViewPharmacies: boolean;
  canViewOwners: boolean;
  canViewSubscriptions: boolean;
  canManageSubscriptions: boolean;
  canSuspendStores: boolean;
  canViewFinancials: boolean;
  canRecordExpenses: boolean;
  canDisburseReferrals: boolean;
  canModifyPayoutRules: boolean;
  canManagePlatformAdmins: boolean;
}> = {
  SUPPORT: {
    canViewOverview: true,
    canViewSupportTickets: true,
    canManageSupportTickets: true,
    canViewPharmacies: true,
    canViewOwners: true,
    canViewSubscriptions: false,
    canManageSubscriptions: false,
    canSuspendStores: false,
    canViewFinancials: false,
    canRecordExpenses: false,
    canDisburseReferrals: false,
    canModifyPayoutRules: false,
    canManagePlatformAdmins: false,
  },
  ADMIN: {
    canViewOverview: true,
    canViewSupportTickets: true,
    canManageSupportTickets: true,
    canViewPharmacies: true,
    canViewOwners: true,
    canViewSubscriptions: true,
    canManageSubscriptions: true,
    canSuspendStores: true,
    canViewFinancials: true,
    canRecordExpenses: true,
    canDisburseReferrals: true,
    canModifyPayoutRules: false,
    canManagePlatformAdmins: false,
  },
  SUPER_ADMIN: {
    canViewOverview: true,
    canViewSupportTickets: true,
    canManageSupportTickets: true,
    canViewPharmacies: true,
    canViewOwners: true,
    canViewSubscriptions: true,
    canManageSubscriptions: true,
    canSuspendStores: true,
    canViewFinancials: true,
    canRecordExpenses: true,
    canDisburseReferrals: true,
    canModifyPayoutRules: true,
    canManagePlatformAdmins: true,
  },
};

/**
 * Pure authorization evaluation function.
 * Evaluates authenticated user identity and database admin record against security policy.
 * Independent of network/IO for deterministic testing and auditability.
 */
export function evaluateAdminProfile(
  user: { id: string; email?: string } | null,
  adminRecord: PlatformAdminRecord | null,
  options?: { userError?: Error | { message: string } | null; adminError?: Error | { message: string } | null }
): AdminAuthResult {
  if (options?.userError || !user) {
    return {
      status: 'unauthenticated',
      user: null,
      admin: null,
      reason: options?.userError?.message || 'No active user session.',
    };
  }

  if (options?.adminError || !adminRecord || !adminRecord.is_active || adminRecord.user_id !== user.id) {
    return {
      status: 'forbidden',
      user: user as User,
      admin: null,
      reason: options?.adminError?.message || 'User does not possess an active platform administrator profile.',
    };
  }

  return {
    status: 'authorized',
    user: user as User,
    admin: adminRecord,
  };
}
