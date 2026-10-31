export type SubscriptionLifecycleState =
  | 'TRIAL'
  | 'ACTIVE'
  | 'GRACE'
  | 'EXPIRED'
  | 'SUSPENDED'
  | 'UNKNOWN';

export interface SubscriptionCapabilities {
  // Mutation operations (blocked when expired, suspended, or unknown)
  createSale: boolean;
  mutateInventory: boolean;
  createRefundOrRestock: boolean;
  mutateCustomers: boolean;
  mutateSuppliers: boolean;
  openCashShift: boolean;
  enrollDevice: boolean;

  // Read & Recovery operations (UNCONDITIONALLY PRESERVED across all states)
  reconcileExistingCashShift: true;
  manageDeviceSecurity: true;
  viewHistoricalRecords: true;
  reviewDurableCheckout: true;
  acknowledgeDurableCheckout: true;
  reconcilePreviouslyAcceptedOperations: true;
  refreshReadModels: true;
  renewSubscription: true;
}

export interface SubscriptionLifecycle {
  readonly state: SubscriptionLifecycleState;
  readonly mutationAllowed: boolean;
  readonly historicalReadAllowed: true;
  readonly periodEnd: string | null;
  readonly graceEnd: string | null;
  readonly authoritative: boolean;
  readonly pharmacyId: string | null;
  readonly serverTime: string | null;
  readonly reason: string;
  readonly capabilities: SubscriptionCapabilities;
}

export interface AuthoritativeEntitlementPayload {
  readonly pharmacy_id: string;
  readonly state: SubscriptionLifecycleState;
  readonly plan_code: string | null;
  readonly features: Record<string, unknown>;
  readonly current_period_start: string | null;
  readonly current_period_end: string | null;
  readonly grace_period_end: string | null;
  readonly mutations_allowed: boolean;
  readonly historical_reads_allowed: true;
  readonly server_time: string;
  readonly reason: string;
}

/**
 * Returns strongly typed capabilities for a given lifecycle state.
 * Under APP-02, TRIAL, ACTIVE, and GRACE allow mutations; EXPIRED, SUSPENDED, and UNKNOWN block mutations.
 * Historical reads, durable checkout review, and previously accepted operation reconciliation are ALWAYS preserved.
 */
export function resolveCapabilities(state: SubscriptionLifecycleState): SubscriptionCapabilities {
  const allowed = state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE';
  return {
    createSale: allowed,
    mutateInventory: allowed,
    createRefundOrRestock: allowed,
    mutateCustomers: allowed,
    mutateSuppliers: allowed,
    openCashShift: allowed,
    enrollDevice: allowed,
    reconcileExistingCashShift: true,
    manageDeviceSecurity: true,
    viewHistoricalRecords: true,
    reviewDurableCheckout: true,
    acknowledgeDurableCheckout: true,
    reconcilePreviouslyAcceptedOperations: true,
    refreshReadModels: true,
    renewSubscription: true,
  };
}
