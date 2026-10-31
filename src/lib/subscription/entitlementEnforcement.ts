import { SubscriptionLifecycle, SubscriptionLifecycleState } from './capabilities';
import { consumeReplayAuthorization, type ReplayRequest, type ReplayAuthorization } from './foundationSecurity';

export type ProtectedMutationOperation =
  | 'SALE_COMMIT'
  | 'SALE_CREATE'
  | 'SALE_REFUND'
  | 'INVENTORY_MUTATION'
  | 'STOCK_INTAKE'
  | 'STOCK_ADJUSTMENT'
  | 'STOCK_ADJUST'
  | 'STOCK_TRANSFER'
  | 'TRANSFER_DISPATCH'
  | 'TRANSFER_RECEIVE'
  | 'REFUND_RESTOCK'
  | 'CUSTOMER_MUTATION'
  | 'SUPPLIER_MUTATION'
  | 'CASH_SHIFT_OPEN'
  | 'DEVICE_ENROLLMENT'
  | 'STAFF_MUTATION'
  | 'STAFF_INVITE'
  | 'STAFF_ROLE'
  | 'STAFF_REACTIVATE'
  | 'STAFF_SUSPEND';

export type ProtectedReadOrRecoveryOperation =
  | 'HISTORICAL_READ'
  | 'DURABLE_CHECKOUT_REVIEW'
  | 'DURABLE_CHECKOUT_ACKNOWLEDGE'
  | 'OFFLINE_REPLAY_RECONCILE'
  | 'CASH_SHIFT_RECONCILE'
  | 'DEVICE_SECURITY_MANAGE'
  | 'READ_MODEL_REFRESH'
  | 'SUBSCRIPTION_RENEW';

export type ProtectedOperation = ProtectedMutationOperation | ProtectedReadOrRecoveryOperation;

const MUTATION_OPERATIONS = new Set<ProtectedMutationOperation>([
  'SALE_COMMIT',
  'SALE_CREATE',
  'SALE_REFUND',
  'INVENTORY_MUTATION',
  'STOCK_INTAKE',
  'STOCK_ADJUSTMENT',
  'STOCK_ADJUST',
  'STOCK_TRANSFER',
  'TRANSFER_DISPATCH',
  'TRANSFER_RECEIVE',
  'REFUND_RESTOCK',
  'CUSTOMER_MUTATION',
  'SUPPLIER_MUTATION',
  'CASH_SHIFT_OPEN',
  'DEVICE_ENROLLMENT',
  'STAFF_MUTATION',
  'STAFF_INVITE',
  'STAFF_ROLE',
  'STAFF_REACTIVATE',
  'STAFF_SUSPEND',
]);

export function isMutationOperation(operation: string): operation is ProtectedMutationOperation {
  return MUTATION_OPERATIONS.has(operation as ProtectedMutationOperation);
}

export class EntitlementViolationError extends Error {
  readonly code: 'ENTITLEMENT_EXPIRED' | 'ENTITLEMENT_UNKNOWN' | 'ENTITLEMENT_SUSPENDED';
  readonly state: SubscriptionLifecycleState;
  readonly operation: ProtectedOperation;
  readonly pharmacyId?: string;

  constructor(
    operation: ProtectedOperation,
    state: SubscriptionLifecycleState,
    reason: string,
    pharmacyId?: string,
  ) {
    const code = state === 'UNKNOWN'
      ? 'ENTITLEMENT_UNKNOWN'
      : state === 'SUSPENDED'
      ? 'ENTITLEMENT_SUSPENDED'
      : 'ENTITLEMENT_EXPIRED';
    super(`Entitlement violation for operation ${operation}: Pharmacy subscription is ${state} (${reason}). New mutations are blocked.`);
    this.name = 'EntitlementViolationError';
    this.code = code;
    this.state = state;
    this.operation = operation;
    this.pharmacyId = pharmacyId;
  }
}

export interface EntitlementEvaluation {
  readonly allowed: boolean;
  readonly state: SubscriptionLifecycleState;
  readonly reason: string;
  readonly bypassApplied: boolean;
}

const NON_REPLAYABLE_MUTATIONS = new Set<ProtectedMutationOperation>([
  'STAFF_MUTATION',
  'STAFF_INVITE',
  'STAFF_ROLE',
  'STAFF_REACTIVATE',
  'STAFF_SUSPEND',
]);

/**
 * Evaluates whether a protected operation is entitled to execute under the given subscription lifecycle.
 * Invariant 1: Read and recovery operations are ALWAYS permitted across all states.
 * Invariant 2: Legitimate previously accepted offline operations (isPreviouslyAcceptedReplay = true)
 *              pass through unblocked to ensure safe eventual consistency without split-brain commits.
 *              Online staff mutations can never be bypassed via offline replay.
 * Invariant 3: New mutations require an active state (TRIAL, ACTIVE, or GRACE).
 */
export interface ReplayConsumption {
  readonly authorization?: ReplayAuthorization | unknown;
  readonly currentRequest?: ReplayRequest;
}

export function evaluateOperationEntitlement(
  lifecycle: SubscriptionLifecycle,
  operation: ProtectedOperation,
  replay?: ReplayConsumption,
): EntitlementEvaluation {
  // Invariant 1: Unconditional preservation of historical reads and recovery actions
  if (!isMutationOperation(operation)) {
    return {
      allowed: true,
      state: lifecycle.state,
      reason: 'Read and recovery operations are unconditionally permitted across all entitlement states.',
      bypassApplied: false,
    };
  }

  // Invariant 2: Legitimate offline replay preservation
  // Requires matching operation kind, tenant identity, and a valid 64-char SHA-256 payload fingerprint.
  // Missing or mismatched payload hashes and online staff mutations CANNOT bypass entitlement.
  const isAuthorizedReplay = !NON_REPLAYABLE_MUTATIONS.has(operation) &&
    replay?.currentRequest?.operationKind === operation &&
    replay.currentRequest.pharmacyId === lifecycle.pharmacyId &&
    consumeReplayAuthorization(replay.currentRequest, replay.authorization);

  if (isAuthorizedReplay) {
    return {
      allowed: true,
      state: lifecycle.state,
      reason: 'Previously accepted offline operation reconciliation bypasses subscription expiry.',
      bypassApplied: true,
    };
  }

  // Invariant 3: Active entitlement requirement for new mutations
  if (lifecycle.mutationAllowed) {
    return {
      allowed: true,
      state: lifecycle.state,
      reason: lifecycle.reason,
      bypassApplied: false,
    };
  }

  return {
    allowed: false,
    state: lifecycle.state,
    reason: lifecycle.reason,
    bypassApplied: false,
  };
}

/**
 * Asserts entitlement for an operation, throwing an EntitlementViolationError if blocked.
 */
export function assertOperationEntitlement(
  lifecycle: SubscriptionLifecycle,
  operation: ProtectedOperation,
  options: { replay?: ReplayConsumption; pharmacyId?: string } = {},
): void {
  const evaluation = evaluateOperationEntitlement(
    lifecycle,
    operation,
    options.replay,
  );

  if (!evaluation.allowed) {
    throw new EntitlementViolationError(
      operation,
      evaluation.state,
      evaluation.reason,
      options.pharmacyId,
    );
  }
}
