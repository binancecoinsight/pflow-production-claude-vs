import type { Subscription, SubscriptionStatus } from '../../types/database';

export type SubscriptionLifecycleState = 'TRIAL' | 'ACTIVE' | 'GRACE' | 'EXPIRED' | 'SUSPENDED' | 'UNKNOWN';

export interface SubscriptionLifecycle {
  state: SubscriptionLifecycleState;
  mutationAllowed: boolean;
  historicalReadAllowed: boolean;
  periodEnd: string | null;
  graceEnd: string | null;
  authoritative: false;
  reason: string;
  capabilities: SubscriptionCapabilities;
}

export interface SubscriptionCapabilities {
  createSale: boolean;
  mutateInventory: boolean;
  createRefundOrRestock: boolean;
  mutateCustomers: boolean;
  mutateSuppliers: boolean;
  openCashShift: boolean;
  enrollDevice: boolean;
  reconcileExistingCashShift: true;
  manageDeviceSecurity: true;
  viewHistoricalRecords: true;
  reviewDurableCheckout: true;
  acknowledgeDurableCheckout: true;
  reconcilePreviouslyAcceptedOperations: true;
  refreshReadModels: true;
  renewSubscription: true;
}

const GRACE_MS = 7 * 24 * 60 * 60 * 1000;

function result(
  state: SubscriptionLifecycleState,
  reason: string,
  periodEnd: string | null = null,
  graceEnd: string | null = null,
): SubscriptionLifecycle {
  return {
    state,
    mutationAllowed: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
    historicalReadAllowed: true,
    periodEnd,
    graceEnd,
    authoritative: false,
    reason,
    capabilities: {
      createSale: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
      mutateInventory: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
      createRefundOrRestock: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
      mutateCustomers: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
      mutateSuppliers: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
      openCashShift: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
      enrollDevice: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
      reconcileExistingCashShift: true,
      manageDeviceSecurity: true,
      viewHistoricalRecords: true,
      reviewDurableCheckout: true,
      acknowledgeDurableCheckout: true,
      reconcilePreviouslyAcceptedOperations: true,
      refreshReadModels: true,
      renewSubscription: true,
    },
  };
}

export function resolveSubscriptionLifecycle(
  subscription: Subscription | null,
  now: Date = new Date(),
): SubscriptionLifecycle {
  if (!subscription) return result('UNKNOWN', 'No authoritative subscription record was loaded. New mutations are blocked locally.');

  const status = subscription.status as SubscriptionStatus | 'SUSPENDED';
  if (status === 'SUSPENDED') return result('SUSPENDED', 'The subscription is suspended. New mutations are blocked.');
  if (status === 'CANCELLED' || status === 'EXPIRED') {
    return result('EXPIRED', `The subscription record is ${status}. New mutations are blocked.`, subscription.current_period_end || null);
  }

  const periodEndMs = Date.parse(subscription.current_period_end);
  if (!Number.isFinite(periodEndMs) || !Number.isFinite(now.getTime())) {
    return result('UNKNOWN', 'Subscription timing evidence is incomplete or invalid. New mutations are blocked locally.');
  }

  const graceEndMs = periodEndMs + GRACE_MS;
  const periodEnd = new Date(periodEndMs).toISOString();
  const graceEnd = new Date(graceEndMs).toISOString();

  if (status === 'PAST_DUE') {
    if (now.getTime() < graceEndMs) return result('GRACE', 'Payment is past due within the approved grace window.', periodEnd, graceEnd);
    return result('EXPIRED', 'The approved grace window has ended.', periodEnd, graceEnd);
  }

  if (now.getTime() < periodEndMs) {
    return result(status, status === 'TRIAL' ? 'Trial access is within its recorded period.' : 'Paid access is within its recorded period.', periodEnd, graceEnd);
  }
  if (now.getTime() < graceEndMs) return result('GRACE', 'The recorded period ended and the approved seven-day grace window is active.', periodEnd, graceEnd);
  return result('EXPIRED', 'The recorded period and approved grace window have ended.', periodEnd, graceEnd);
}
