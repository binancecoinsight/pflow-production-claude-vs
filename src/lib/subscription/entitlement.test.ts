import type { Subscription } from '../../types/database';
import {
  SubscriptionLifecycle,
  AuthoritativeEntitlementPayload,
  resolveSubscriptionLifecycle,
  resolveAuthoritativeEntitlement,
  resolveCapabilities,
} from './lifecycle';
import {
  ProtectedMutationOperation,
  ProtectedReadOrRecoveryOperation,
  ProtectedOperation,
  isMutationOperation,
  EntitlementViolationError,
  evaluateOperationEntitlement,
  assertOperationEntitlement,
} from './entitlementEnforcement';
import { CapabilityAsyncBoundary, runCapabilityBoundTask } from './capabilityBoundary';
import {
  createRpcEntitlementAdapter,
  createOfflineFallbackEntitlementAdapter,
  RpcExecutor,
} from './entitlementAdapter';
import { authorizeExactReplay, type ReplayRequest } from './foundationSecurity';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
}

const PHARMACY_ID = '11111111-1111-4111-8111-111111111111';

// Base subscription fixture: 14-day trial ending 2026-10-15T00:00:00.000Z
const baseTrial: Subscription = {
  id: 'sub-test-1',
  pharmacy_id: PHARMACY_ID,
  plan_code: 'TRIAL',
  status: 'TRIAL',
  current_period_start: '2026-10-01T00:00:00.000Z',
  current_period_end: '2026-10-15T00:00:00.000Z',
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
};

// ----------------------------------------------------------------------------
// SUITE 1: UTC Millisecond Boundary Tests (Trial, Active, Grace, Expiry)
// ----------------------------------------------------------------------------
// 1.1 Trial active before exact UTC period end
const trialActive = resolveSubscriptionLifecycle(baseTrial, new Date('2026-10-14T23:59:59.999Z'));
assert(trialActive.state === 'TRIAL', 'Trial remains active 1ms before UTC period end');
assert(trialActive.mutationAllowed === true, 'Trial permits mutations within its period');

// 1.2 Grace begins at exact UTC period end
const graceStart = resolveSubscriptionLifecycle(baseTrial, new Date('2026-10-15T00:00:00.000Z'));
assert(graceStart.state === 'GRACE', 'Seven-day grace window begins at exact UTC period end');
assert(graceStart.mutationAllowed === true, 'Grace permits mutations during the 7-day window');

// 1.3 Grace remains active at 7 days minus 1ms
const graceActive = resolveSubscriptionLifecycle(baseTrial, new Date('2026-10-21T23:59:59.999Z'));
assert(graceActive.state === 'GRACE', 'Grace remains active 1ms before 7-day boundary');
assert(graceActive.mutationAllowed === true, 'Grace permits mutations up to the last millisecond');

// 1.4 Expiry at exact 7-day UTC boundary
const trialExpired = resolveSubscriptionLifecycle(baseTrial, new Date('2026-10-22T00:00:00.000Z'));
assert(trialExpired.state === 'EXPIRED', 'Subscription transitions to EXPIRED at exact 7-day boundary');
assert(trialExpired.mutationAllowed === false, 'Mutations are blocked once grace expires');
assert(trialExpired.historicalReadAllowed === true, 'Historical reads remain unconditionally authorized after expiry');

// 1.5 Paid active subscription within period
const baseActive: Subscription = {
  ...baseTrial,
  plan_code: 'PROFESSIONAL',
  status: 'ACTIVE',
  current_period_start: '2026-10-01T00:00:00.000Z',
  current_period_end: '2026-11-01T00:00:00.000Z',
};
const activePeriod = resolveSubscriptionLifecycle(baseActive, new Date('2026-10-20T12:00:00.000Z'));
assert(activePeriod.state === 'ACTIVE', 'Paid subscription is ACTIVE within period');
assert(activePeriod.mutationAllowed === true, 'Active subscription permits mutations');

// 1.6 Paid subscription past period enters 7-day grace
const activeInGrace = resolveSubscriptionLifecycle(baseActive, new Date('2026-11-04T00:00:00.000Z'));
assert(activeInGrace.state === 'GRACE', 'Paid subscription past period end enters 7-day grace');
assert(activeInGrace.mutationAllowed === true, 'Grace permits mutations for paid accounts');

// 1.7 Paid subscription past grace expires
const activeExpired = resolveSubscriptionLifecycle(baseActive, new Date('2026-11-08T00:00:00.001Z'));
assert(activeExpired.state === 'EXPIRED', 'Paid subscription past grace expires');
assert(activeExpired.mutationAllowed === false, 'Mutations blocked after paid grace ends');

// 1.8 PAST_DUE status within grace
const pastDueInGrace = resolveSubscriptionLifecycle({ ...baseActive, status: 'PAST_DUE' }, new Date('2026-11-05T00:00:00.000Z'));
assert(pastDueInGrace.state === 'GRACE', 'PAST_DUE subscription within grace window maps to GRACE');
assert(pastDueInGrace.mutationAllowed === true, 'PAST_DUE within grace permits mutations');

// 1.9 PAST_DUE status past grace
const pastDueExpired = resolveSubscriptionLifecycle({ ...baseActive, status: 'PAST_DUE' }, new Date('2026-11-08T00:00:00.000Z'));
assert(pastDueExpired.state === 'EXPIRED', 'PAST_DUE past grace window maps to EXPIRED');
assert(pastDueExpired.mutationAllowed === false, 'PAST_DUE past grace blocks mutations');

// 1.10 Explicit CANCELLED status fails closed
const cancelledSub = resolveSubscriptionLifecycle({ ...baseActive, status: 'CANCELLED' }, new Date('2026-10-15T00:00:00.000Z'));
assert(cancelledSub.state === 'EXPIRED', 'CANCELLED subscription maps to EXPIRED');
assert(cancelledSub.mutationAllowed === false, 'CANCELLED subscription blocks mutations immediately');

// 1.11 Explicit SUSPENDED status fails closed
const suspendedSub = resolveSubscriptionLifecycle({ ...baseActive, status: 'SUSPENDED' as any }, new Date('2026-10-15T00:00:00.000Z'));
assert(suspendedSub.state === 'SUSPENDED', 'SUSPENDED subscription maps to SUSPENDED');
assert(suspendedSub.mutationAllowed === false, 'SUSPENDED subscription blocks mutations immediately');

// 1.12 Missing subscription record fails closed to UNKNOWN
const nullSub = resolveSubscriptionLifecycle(null);
assert(nullSub.state === 'UNKNOWN', 'Null subscription record fails closed to UNKNOWN');
assert(nullSub.mutationAllowed === false, 'UNKNOWN state blocks mutations');
assert(nullSub.historicalReadAllowed === true, 'UNKNOWN state preserves historical reads');

// 1.13 Malformed timestamp string fails closed to UNKNOWN
const malformedDateSub = resolveSubscriptionLifecycle({ ...baseTrial, current_period_end: 'invalid-date' });
assert(malformedDateSub.state === 'UNKNOWN', 'Malformed period end date fails closed to UNKNOWN');
assert(malformedDateSub.mutationAllowed === false, 'Malformed timing blocks mutations');

// ----------------------------------------------------------------------------
// SUITE 2: Authoritative Server Entitlement Parsing (rpc_get_effective_entitlement_v1)
// ----------------------------------------------------------------------------
// 2.1 Valid authoritative ACTIVE payload
const serverActivePayload: AuthoritativeEntitlementPayload = {
  pharmacy_id: PHARMACY_ID,
  state: 'ACTIVE',
  plan_code: 'PROFESSIONAL',
  features: { max_branches: 3, max_staff: 15 },
  current_period_start: '2026-10-01T00:00:00.000Z',
  current_period_end: '2026-11-01T00:00:00.000Z',
  grace_period_end: '2026-11-08T00:00:00.000Z',
  mutations_allowed: true,
  historical_reads_allowed: true,
  server_time: '2026-10-20T12:00:00.000Z',
  reason: 'Subscription is active within its recorded period.',
};
const parsedActive = resolveAuthoritativeEntitlement(serverActivePayload, PHARMACY_ID);
assert(parsedActive.authoritative === true, 'Authoritative flag is set on server entitlement resolution');
assert(parsedActive.state === 'ACTIVE', 'Authoritative ACTIVE state is preserved');
assert(parsedActive.mutationAllowed === true, 'Authoritative ACTIVE permits mutations');
assert(parsedActive.periodEnd === '2026-11-01T00:00:00.000Z', 'Period end matches server evidence');
assert(parsedActive.graceEnd === '2026-11-08T00:00:00.000Z', 'Grace end matches server evidence');

// 2.2 Valid authoritative GRACE payload
const serverGracePayload: AuthoritativeEntitlementPayload = {
  ...serverActivePayload,
  state: 'GRACE',
  mutations_allowed: true,
  server_time: '2026-11-03T12:00:00.000Z',
  reason: 'Payment is past due; seven-day grace window is currently active.',
};
const parsedGrace = resolveAuthoritativeEntitlement(serverGracePayload, PHARMACY_ID);
assert(parsedGrace.state === 'GRACE', 'Authoritative GRACE state is preserved');
assert(parsedGrace.mutationAllowed === true, 'Authoritative GRACE permits mutations');

// 2.3 Valid authoritative EXPIRED payload
const serverExpiredPayload: AuthoritativeEntitlementPayload = {
  ...serverActivePayload,
  state: 'EXPIRED',
  mutations_allowed: false,
  server_time: '2026-11-08T00:00:00.000Z',
  reason: 'The recorded period and approved grace window have ended.',
};
const parsedExpired = resolveAuthoritativeEntitlement(serverExpiredPayload, PHARMACY_ID);
assert(parsedExpired.state === 'EXPIRED', 'Authoritative EXPIRED state is preserved');
assert(parsedExpired.mutationAllowed === false, 'Authoritative EXPIRED blocks mutations');
assert(parsedExpired.historicalReadAllowed === true, 'Authoritative EXPIRED preserves historical reads');

// 2.4 Server payload with null or non-record fails closed to UNKNOWN
for (const malformed of [null, undefined, 'not-an-object', 42, []]) {
  const parsed = resolveAuthoritativeEntitlement(malformed, PHARMACY_ID);
  assert(parsed.state === 'UNKNOWN', 'Non-record server payload fails closed to UNKNOWN');
  assert(parsed.mutationAllowed === false, 'Malformed server payload blocks mutations');
  assert(parsed.authoritative === false, 'Malformed server payload is not authoritative');
}

// 2.5 Server payload with unrecognized state fails closed to UNKNOWN
const unrecognizedStatePayload = {
  ...serverActivePayload,
  state: 'SUPER_ACTIVE_TIER_INVALID',
};
const parsedUnrecognized = resolveAuthoritativeEntitlement(unrecognizedStatePayload, PHARMACY_ID);
assert(parsedUnrecognized.state === 'UNKNOWN', 'Unrecognized server state fails closed to UNKNOWN');
assert(parsedUnrecognized.mutationAllowed === false, 'Unrecognized server state blocks mutations');

// 2.6 Server payload with invalid pharmacy_id fails closed to UNKNOWN
const invalidPharmacyPayload = { ...serverActivePayload, pharmacy_id: 'invalid-not-uuid' };
const parsedInvalidPharmacy = resolveAuthoritativeEntitlement(invalidPharmacyPayload, PHARMACY_ID);
assert(parsedInvalidPharmacy.state === 'UNKNOWN', 'Invalid pharmacy_id fails closed to UNKNOWN');
assert(parsedInvalidPharmacy.mutationAllowed === false, 'Invalid pharmacy_id blocks mutations');

// 2.7 Server payload with non-boolean mutations_allowed fails closed to UNKNOWN
const invalidMutationsPayload = { ...serverActivePayload, mutations_allowed: 'true' as any };
const parsedInvalidMutations = resolveAuthoritativeEntitlement(invalidMutationsPayload, PHARMACY_ID);
assert(parsedInvalidMutations.state === 'UNKNOWN', 'Non-boolean mutations_allowed fails closed to UNKNOWN');
assert(parsedInvalidMutations.mutationAllowed === false, 'Non-boolean mutations_allowed blocks mutations');

// 2.8 Server payload with historical_reads_allowed !== true fails closed to UNKNOWN
const invalidReadsPayload = { ...serverActivePayload, historical_reads_allowed: false as any };
const parsedInvalidReads = resolveAuthoritativeEntitlement(invalidReadsPayload, PHARMACY_ID);
assert(parsedInvalidReads.state === 'UNKNOWN', 'historical_reads_allowed !== true fails closed to UNKNOWN');

// 2.9 Server payload with invalid server_time fails closed to UNKNOWN
const invalidServerTimePayload = { ...serverActivePayload, server_time: 'not-a-timestamp' };
const parsedInvalidServerTime = resolveAuthoritativeEntitlement(invalidServerTimePayload, PHARMACY_ID);
assert(parsedInvalidServerTime.state === 'UNKNOWN', 'Invalid server_time fails closed to UNKNOWN');

// ----------------------------------------------------------------------------
// SUITE 3: Operation-Level Enforcement & Protected Mutation Classification
// ----------------------------------------------------------------------------
const MUTATION_OPS: ProtectedMutationOperation[] = [
  'SALE_COMMIT',
  'INVENTORY_MUTATION',
  'STOCK_INTAKE',
  'STOCK_ADJUSTMENT',
  'STOCK_TRANSFER',
  'REFUND_RESTOCK',
  'CUSTOMER_MUTATION',
  'SUPPLIER_MUTATION',
  'CASH_SHIFT_OPEN',
  'DEVICE_ENROLLMENT',
  'STAFF_MUTATION',
];

const READ_RECOVERY_OPS: ProtectedReadOrRecoveryOperation[] = [
  'HISTORICAL_READ',
  'DURABLE_CHECKOUT_REVIEW',
  'DURABLE_CHECKOUT_ACKNOWLEDGE',
  'OFFLINE_REPLAY_RECONCILE',
  'CASH_SHIFT_RECONCILE',
  'DEVICE_SECURITY_MANAGE',
  'READ_MODEL_REFRESH',
  'SUBSCRIPTION_RENEW',
];

// 3.1 Verify classification helper
for (const op of MUTATION_OPS) {
  assert(isMutationOperation(op) === true, `Operation ${op} is classified as a mutation`);
}
for (const op of READ_RECOVERY_OPS) {
  assert(isMutationOperation(op) === false, `Operation ${op} is classified as a read/recovery`);
}

// 3.2 Active states allow all mutations
for (const state of ['TRIAL', 'ACTIVE', 'GRACE'] as const) {
  const lifecycle: SubscriptionLifecycle = {
    state,
    mutationAllowed: true,
    historicalReadAllowed: true,
    periodEnd: '2026-11-01T00:00:00.000Z',
    graceEnd: '2026-11-08T00:00:00.000Z',
    authoritative: true,
    pharmacyId: PHARMACY_ID,
    serverTime: '2026-10-20T00:00:00Z',
    reason: `State is ${state}`,
    capabilities: resolveCapabilities(state),
  };

  for (const op of MUTATION_OPS) {
    const evalResult = evaluateOperationEntitlement(lifecycle, op);
    assert(evalResult.allowed === true, `${state} permits mutation operation ${op}`);
    assert(evalResult.bypassApplied === false, 'No bypass needed for active entitlement');
  }
}

// 3.3 Inactive states block all mutations
for (const state of ['EXPIRED', 'SUSPENDED', 'UNKNOWN'] as const) {
  const lifecycle: SubscriptionLifecycle = {
    state,
    mutationAllowed: false,
    historicalReadAllowed: true,
    periodEnd: null,
    graceEnd: null,
    authoritative: true,
    pharmacyId: PHARMACY_ID,
    serverTime: '2026-10-20T00:00:00Z',
    reason: `State is ${state}`,
    capabilities: resolveCapabilities(state),
  };

  for (const op of MUTATION_OPS) {
    const evalResult = evaluateOperationEntitlement(lifecycle, op);
    assert(evalResult.allowed === false, `${state} blocks mutation operation ${op}`);
    assert(evalResult.bypassApplied === false, 'No bypass applied to unaccepted mutation');

    // assertOperationEntitlement throws typed error
    let threw = false;
    try {
      assertOperationEntitlement(lifecycle, op, { pharmacyId: PHARMACY_ID });
    } catch (err: unknown) {
      threw = true;
      assert(err instanceof EntitlementViolationError, 'Throws EntitlementViolationError');
      const violation = err as EntitlementViolationError;
      assert(violation.operation === op, 'Error records operation name');
      assert(violation.state === state, 'Error records lifecycle state');
      assert(violation.pharmacyId === PHARMACY_ID, 'Error records pharmacy ID');
      if (state === 'UNKNOWN') {
        assert(violation.code === 'ENTITLEMENT_UNKNOWN', 'UNKNOWN state produces ENTITLEMENT_UNKNOWN code');
      } else if (state === 'SUSPENDED') {
        assert(violation.code === 'ENTITLEMENT_SUSPENDED', 'SUSPENDED state produces ENTITLEMENT_SUSPENDED code');
      } else {
        assert(violation.code === 'ENTITLEMENT_EXPIRED', 'EXPIRED state produces ENTITLEMENT_EXPIRED code');
      }
    }
    assert(threw, `assertOperationEntitlement threw for ${op} under ${state}`);
  }
}

// ----------------------------------------------------------------------------
// SUITE 4: Unconditional Preservation of Historical Reads & Recovery
// ----------------------------------------------------------------------------
// 4.1 Read and recovery operations are unconditionally permitted across ALL states
for (const state of ['TRIAL', 'ACTIVE', 'GRACE', 'EXPIRED', 'SUSPENDED', 'UNKNOWN'] as const) {
  const lifecycle: SubscriptionLifecycle = {
    state,
    mutationAllowed: state === 'TRIAL' || state === 'ACTIVE' || state === 'GRACE',
    historicalReadAllowed: true,
    periodEnd: null,
    graceEnd: null,
    authoritative: false,
    pharmacyId: null,
    serverTime: null,
    reason: `Testing state ${state}`,
    capabilities: resolveCapabilities(state),
  };

  for (const op of READ_RECOVERY_OPS) {
    const evalResult = evaluateOperationEntitlement(lifecycle, op);
    assert(evalResult.allowed === true, `Operation ${op} is allowed under state ${state}`);
    // assertOperationEntitlement does not throw
    assertOperationEntitlement(lifecycle, op);
  }
}

// 4.2 Legitimate offline replay preservation under EXPIRED subscription
const expiredLifecycle: SubscriptionLifecycle = {
  state: 'EXPIRED',
  mutationAllowed: false,
  historicalReadAllowed: true,
  periodEnd: '2026-10-01T00:00:00.000Z',
  graceEnd: '2026-10-08T00:00:00.000Z',
  authoritative: true,
  pharmacyId: PHARMACY_ID,
  serverTime: '2026-10-09T00:00:00.000Z',
  reason: 'Subscription expired on 2026-10-08',
  capabilities: resolveCapabilities('EXPIRED'),
};

for (const mutationOp of MUTATION_OPS) {
  // Without replay flag: blocked
  const normalEval = evaluateOperationEntitlement(expiredLifecycle, mutationOp);
  assert(normalEval.allowed === false, `Normal ${mutationOp} blocked when expired`);

  const unrelatedReplay = evaluateOperationEntitlement(expiredLifecycle, mutationOp, { authorization: { allowed: true }, currentRequest: undefined });
  assert(unrelatedReplay.allowed === false, `Malformed replay evidence cannot authorize ${mutationOp}`);
}

// ----------------------------------------------------------------------------
// SUITE 5: CapabilityAsyncBoundary Coordination with Entitlements
// ----------------------------------------------------------------------------
// 5.1 Async boundary accepts tasks when entitlement is active
const boundary = new CapabilityAsyncBoundary(`pharmacy:${PHARMACY_ID}`, true);
let taskRan: boolean = false;
const taskResult = await runCapabilityBoundTask(boundary, async () => {
  taskRan = true;
  return 'success';
});
assert(taskRan, 'Task executed under allowed boundary');
assert(taskResult.accepted === true && 'value' in taskResult && taskResult.value === 'success', 'Task accepted by boundary');

// 5.2 Async boundary rejects task when entitlement expires mid-flight
const boundaryExpiring = new CapabilityAsyncBoundary(`pharmacy:${PHARMACY_ID}`, true);
const midFlightTask = runCapabilityBoundTask(boundaryExpiring, async () => {
  // Simulate delay where subscription expires
  boundaryExpiring.update(`pharmacy:${PHARMACY_ID}`, false);
  return 'mutated_data';
});
const midFlightResult = await midFlightTask;
assert(midFlightResult.accepted === false, 'Mid-flight entitlement expiration causes task rejection');

// 5.3 Boundary rejects new tasks when mutations are not allowed
const blockedBoundary = new CapabilityAsyncBoundary(`pharmacy:${PHARMACY_ID}`, false);
let blockedTaskRan = false;
const blockedResult = await runCapabilityBoundTask(blockedBoundary, async () => {
  blockedTaskRan = true;
  return 'should_not_run';
});
assert(blockedTaskRan === false, 'Blocked boundary prevents task execution');
assert(blockedResult.accepted === false, 'Blocked boundary reports accepted: false');

// ----------------------------------------------------------------------------
// SUITE 6: Injected Entitlement Adapter, Tenant Isolation & Anti-Spoofing
// ----------------------------------------------------------------------------
// 6.1 Injected RPC adapter returns authoritative entitlement on valid server response
const mockValidExecutor: RpcExecutor = {
  async rpc(fn: string, args: Record<string, unknown>) {
    assert(fn === 'rpc_get_effective_entitlement_v2', 'Calls corrected effective-entitlement RPC name');
    assert(args.p_pharmacy_id === PHARMACY_ID, 'Passes pharmacy ID argument');
    return { data: serverActivePayload, error: null };
  },
};
const rpcAdapter = createRpcEntitlementAdapter(mockValidExecutor);
const rpcResult = await rpcAdapter.getEffectiveEntitlement(PHARMACY_ID);
assert(rpcResult.authoritative === true, 'RPC adapter yields authoritative: true on server confirmation');
assert(rpcResult.state === 'ACTIVE', 'RPC adapter yields active state');
assert(rpcResult.mutationAllowed === true, 'RPC adapter allows mutations on active');

// 6.2 Injected RPC adapter fails closed to UNKNOWN on network error or server error
const mockErrorExecutor: RpcExecutor = {
  async rpc() {
    return { data: null, error: { message: 'Network connection timeout (synthetic)' } };
  },
};
const errorAdapter = createRpcEntitlementAdapter(mockErrorExecutor);
const errorResult = await errorAdapter.getEffectiveEntitlement(PHARMACY_ID);
assert(errorResult.authoritative === false, 'RPC error yields authoritative: false');
assert(errorResult.state === 'UNKNOWN', 'RPC error maps to UNKNOWN state');
assert(errorResult.mutationAllowed === false, 'RPC error blocks mutations');
assert(errorResult.historicalReadAllowed === true, 'RPC error preserves historical reads');

// 6.3 Injected RPC adapter fails closed on thrown network exception
const mockThrowingExecutor: RpcExecutor = {
  async rpc() {
    throw new Error('ECONNREFUSED');
  },
};
const throwingAdapter = createRpcEntitlementAdapter(mockThrowingExecutor);
const throwingResult = await throwingAdapter.getEffectiveEntitlement(PHARMACY_ID);
assert(throwingResult.authoritative === false, 'Network exception yields authoritative: false');
assert(throwingResult.state === 'UNKNOWN', 'Network exception maps to UNKNOWN state');
assert(throwingResult.mutationAllowed === false, 'Network exception blocks mutations');

// 6.4 Offline fallback adapter yields advisory state only (authoritative: false)
const fallbackAdapter = createOfflineFallbackEntitlementAdapter(baseActive);
const fallbackResult = await fallbackAdapter.getEffectiveEntitlement(PHARMACY_ID);
assert(fallbackResult.authoritative === false, 'Offline fallback is advisory, not authoritative');
assert(fallbackResult.state === 'ACTIVE', 'Offline fallback reflects cached active status');

// 6.5 Client clock spoofing resistance: manipulating local clock produces advisory output only
const spoofedFutureDate = new Date('2030-01-01T00:00:00.000Z');
const spoofedResult = resolveSubscriptionLifecycle(baseTrial, spoofedFutureDate);
assert(spoofedResult.authoritative === false, 'Client clock projection is always authoritative: false');
assert(spoofedResult.state === 'EXPIRED', 'Manipulating client clock to future correctly expires local projection');

// 6.6 Client spoofing local periodEnd: changing local record never grants authoritative status
const tamperedSub: Subscription = {
  ...baseTrial,
  current_period_end: '2099-01-01T00:00:00.000Z',
};
const tamperedResult = resolveSubscriptionLifecycle(tamperedSub);
assert(tamperedResult.authoritative === false, 'Local timestamp extension remains non-authoritative');

// 6.7 Tenant isolation: mismatching pharmacy ID in assertion
let tenantMismatchThrew = false;
try {
  const otherPharmacyId = '22222222-2222-4222-8222-222222222222';
  assertOperationEntitlement(expiredLifecycle, 'SALE_COMMIT', { pharmacyId: otherPharmacyId });
} catch (err) {
  tenantMismatchThrew = true;
  assert(err instanceof EntitlementViolationError, 'Throws violation error for mismatched tenant');
  assert((err as EntitlementViolationError).pharmacyId === '22222222-2222-4222-8222-222222222222', 'Preserves distinct tenant identity');
}
assert(tenantMismatchThrew, 'Tenant isolation throws for unentitled tenant');

// 6.8 Feature inheritance during GRACE: features match ACTIVE tier exactly
assert(JSON.stringify(serverActivePayload.features) === JSON.stringify(serverGracePayload.features), 'GRACE inherits identical features from active plan');

// ----------------------------------------------------------------------------
// SUITE 7: Operational RPC Preludes, State Matrix & Replay Hardening
// ----------------------------------------------------------------------------
const suspendedLifecycle: SubscriptionLifecycle = {
  state: 'SUSPENDED',
  mutationAllowed: false,
  historicalReadAllowed: true,
  periodEnd: null,
  graceEnd: null,
  authoritative: true,
  pharmacyId: PHARMACY_ID,
  serverTime: '2026-10-29T12:00:00Z',
  reason: 'Suspended by platform administration',
  capabilities: resolveCapabilities('SUSPENDED'),
};

const unknownLifecycle: SubscriptionLifecycle = {
  state: 'UNKNOWN',
  mutationAllowed: false,
  historicalReadAllowed: true,
  periodEnd: null,
  graceEnd: null,
  authoritative: false,
  pharmacyId: PHARMACY_ID,
  serverTime: null,
  reason: 'Missing or corrupt subscription entitlement',
  capabilities: resolveCapabilities('UNKNOWN'),
};

const allOperationalRpcKinds: ProtectedMutationOperation[] = [
  'SALE_CREATE',
  'SALE_COMMIT',
  'SALE_REFUND',
  'STOCK_INTAKE',
  'STOCK_ADJUST',
  'TRANSFER_DISPATCH',
  'TRANSFER_RECEIVE',
  'STAFF_INVITE',
  'STAFF_ROLE',
  'STAFF_REACTIVATE',
  'STAFF_SUSPEND',
];

const permittedStates = [activePeriod, trialActive, graceActive];
const blockedStates = [expiredLifecycle, suspendedLifecycle, unknownLifecycle];

// 7.1 Verify all 8 operational RPC mutation kinds are permitted under ACTIVE, TRIAL, GRACE
for (const state of permittedStates) {
  for (const op of allOperationalRpcKinds) {
    const evalResult = evaluateOperationEntitlement(state, op);
    assert(evalResult.allowed === true, `Operation ${op} is permitted in ${state.state} state`);

    // assertOperationEntitlement does not throw
    let didThrow = false;
    try {
      assertOperationEntitlement(state, op, { pharmacyId: PHARMACY_ID });
    } catch {
      didThrow = true;
    }
    assert(!didThrow, `assertOperationEntitlement for ${op} succeeds in ${state.state} state`);
  }
}

// 7.2 Verify all 8 operational RPC mutation kinds are BLOCKED under EXPIRED, SUSPENDED, UNKNOWN
for (const state of blockedStates) {
  for (const op of allOperationalRpcKinds) {
    const evalResult = evaluateOperationEntitlement(state, op);
    assert(evalResult.allowed === false, `Operation ${op} is blocked in ${state.state} state`);

    let caughtError: unknown = null;
    try {
      assertOperationEntitlement(state, op, { pharmacyId: PHARMACY_ID });
    } catch (err) {
      caughtError = err;
    }
    assert(caughtError instanceof EntitlementViolationError, `Throws EntitlementViolationError for ${op} in ${state.state}`);
    const violation = caughtError as EntitlementViolationError;
    assert(violation.operation === op, `Violation records correct operation ${op}`);
    assert(violation.state === state.state, `Violation records correct state ${state.state}`);
    if (state.state === 'EXPIRED') {
      assert(violation.code === 'ENTITLEMENT_EXPIRED', `Violation code is ENTITLEMENT_EXPIRED for ${op}`);
    } else if (state.state === 'SUSPENDED') {
      assert(violation.code === 'ENTITLEMENT_SUSPENDED', `Violation code is ENTITLEMENT_SUSPENDED for ${op}`);
    } else {
      assert(violation.code === 'ENTITLEMENT_UNKNOWN', `Violation code is ENTITLEMENT_UNKNOWN for ${op}`);
    }
  }
}

// 7.3 Offline Replay Hardening: Legitimate replay is permitted for replayable operational RPCs
const replayableOps: ProtectedMutationOperation[] = [
  'SALE_CREATE',
  'SALE_COMMIT',
  'SALE_REFUND',
  'STOCK_INTAKE',
  'STOCK_ADJUST',
  'TRANSFER_DISPATCH',
  'TRANSFER_RECEIVE',
];

const replayContext = (operationKind: ProtectedMutationOperation, currentOverrides: Partial<ReplayRequest> = {}) => {
  const proofRequest: ReplayRequest = {
    pharmacyId: PHARMACY_ID,
    branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    operationKind,
    clientOperationId: '44444444-4444-4444-8444-444444444444',
    actorId: '22222222-2222-4222-8222-222222222222',
    deviceId: '33333333-3333-4333-8333-333333333333',
    payloadFingerprint: 'a'.repeat(64),
  };
  return {
    authorization: authorizeExactReplay(proofRequest, {
      ...proofRequest,
      outcome: 'COMMITTED',
      committedAt: '2026-10-29T12:00:00.000001Z',
      domainEntityId: '55555555-5555-4555-8555-555555555555',
    }),
    currentRequest: { ...proofRequest, ...currentOverrides },
  };
};

for (const op of replayableOps) {
  const matchingReplayAuth = replayContext(op);

  // Under EXPIRED subscription, matching replay is accepted
  const replayEval = evaluateOperationEntitlement(expiredLifecycle, op, matchingReplayAuth);
  assert(replayEval.allowed === true, `Matching idempotent replay for ${op} is permitted even when expired`);

  let didThrow = false;
  try {
    assertOperationEntitlement(expiredLifecycle, op, { replay: matchingReplayAuth, pharmacyId: PHARMACY_ID });
  } catch {
    didThrow = true;
  }
  assert(!didThrow, `assertOperationEntitlement succeeds for matching replay of ${op} when expired`);
}

// 7.4 Cross-Operation Replay Forgery is strictly REJECTED
for (let i = 0; i < replayableOps.length; i++) {
  const currentOp = replayableOps[i];
  const differentOp = replayableOps[(i + 1) % replayableOps.length];

  const forgedReplayAuth = replayContext(differentOp, { operationKind: currentOp });

  const evalResult = evaluateOperationEntitlement(expiredLifecycle, currentOp, forgedReplayAuth);
  assert(evalResult.allowed === false, `Cross-operation replay from ${differentOp} to ${currentOp} is rejected`);

  let didThrow = false;
  try {
    assertOperationEntitlement(expiredLifecycle, currentOp, { replay: forgedReplayAuth, pharmacyId: PHARMACY_ID });
  } catch (err) {
    didThrow = true;
    assert(err instanceof EntitlementViolationError, 'Throws EntitlementViolationError on cross-operation replay forgery');
  }
  assert(didThrow, `Throws for cross-operation replay from ${differentOp} to ${currentOp}`);
}

// 7.5 Online Staff Operations CANNOT be replayed offline
const staffOps: ProtectedMutationOperation[] = [
  'STAFF_INVITE',
  'STAFF_ROLE',
  'STAFF_REACTIVATE',
  'STAFF_SUSPEND',
];

for (const op of staffOps) {
  const staffReplayAuth = replayContext(op);

  // Replay should NOT bypass entitlement for staff management operations
  const evalResult = evaluateOperationEntitlement(expiredLifecycle, op, staffReplayAuth);
  assert(evalResult.allowed === false, `Staff management operation ${op} cannot bypass expired entitlement via replay`);
}

// 7.6 Cross-Tenant Replay is strictly REJECTED
const otherTenantId = '99999999-9999-4999-8999-999999999999';
for (const op of replayableOps) {
  const crossTenantReplayAuth = replayContext(op, { pharmacyId: otherTenantId });

  const evalResult = evaluateOperationEntitlement(expiredLifecycle, op, crossTenantReplayAuth);
  assert(evalResult.allowed === false, `Cross-tenant replay for ${op} is rejected`);

  let didThrow = false;
  try {
    assertOperationEntitlement(expiredLifecycle, op, { replay: crossTenantReplayAuth, pharmacyId: PHARMACY_ID });
  } catch (err) {
    didThrow = true;
    assert(err instanceof EntitlementViolationError, 'Throws EntitlementViolationError on cross-tenant replay');
  }
  assert(didThrow, `Throws for cross-tenant replay on ${op}`);
}

// 7.7a Missing Payload Hash in Replay is strictly REJECTED (No Replay Authorization Bypass)
for (const op of replayableOps) {
  const missingHashReplayAuth = replayContext(op, { payloadFingerprint: undefined as never });

  const evalResult = evaluateOperationEntitlement(expiredLifecycle, op, missingHashReplayAuth);
  assert(evalResult.allowed === false, `Replay with missing payload fingerprint for ${op} is strictly rejected`);

  let didThrow = false;
  try {
    assertOperationEntitlement(expiredLifecycle, op, { replay: missingHashReplayAuth, pharmacyId: PHARMACY_ID });
  } catch (err) {
    didThrow = true;
    assert(err instanceof EntitlementViolationError, 'Throws EntitlementViolationError on missing payload fingerprint');
  }
  assert(didThrow, `assertOperationEntitlement throws for missing payload fingerprint on ${op}`);
}

// 7.7b Malformed Payload Hash in Replay is strictly REJECTED
for (const op of replayableOps) {
  const malformedHashReplayAuth = replayContext(op, { payloadFingerprint: 'not-a-valid-64-character-sha256-hash' });

  const evalResult = evaluateOperationEntitlement(expiredLifecycle, op, malformedHashReplayAuth);
  assert(evalResult.allowed === false, `Replay with malformed payload fingerprint for ${op} is strictly rejected`);

  let didThrow = false;
  try {
    assertOperationEntitlement(expiredLifecycle, op, { replay: malformedHashReplayAuth, pharmacyId: PHARMACY_ID });
  } catch (err) {
    didThrow = true;
    assert(err instanceof EntitlementViolationError, 'Throws EntitlementViolationError on malformed payload fingerprint');
  }
  assert(didThrow, `assertOperationEntitlement throws for malformed payload fingerprint on ${op}`);
}

// 7.7c Missing Tenant in Replay is strictly REJECTED
for (const op of replayableOps) {
  const missingTenantReplayAuth = replayContext(op, { pharmacyId: undefined as never });

  const evalResult = evaluateOperationEntitlement(expiredLifecycle, op, missingTenantReplayAuth);
  assert(evalResult.allowed === false, `Replay with missing tenant for ${op} is strictly rejected`);

  let didThrow = false;
  try {
    assertOperationEntitlement(expiredLifecycle, op, { replay: missingTenantReplayAuth, pharmacyId: PHARMACY_ID });
  } catch (err) {
    didThrow = true;
    assert(err instanceof EntitlementViolationError, 'Throws EntitlementViolationError on missing tenant');
  }
  assert(didThrow, `assertOperationEntitlement throws for missing tenant on ${op}`);
}

// 7.8 Historical Reads & Recovery Queries are unconditionally permitted across ALL states
const readAndRecoveryOperations: ProtectedReadOrRecoveryOperation[] = [
  'HISTORICAL_READ',
  'DURABLE_CHECKOUT_REVIEW',
  'DURABLE_CHECKOUT_ACKNOWLEDGE',
  'OFFLINE_REPLAY_RECONCILE',
  'CASH_SHIFT_RECONCILE',
  'DEVICE_SECURITY_MANAGE',
  'READ_MODEL_REFRESH',
  'SUBSCRIPTION_RENEW',
];

const allLifecycles = [
  activePeriod,
  trialActive,
  graceActive,
  expiredLifecycle,
  suspendedLifecycle,
  unknownLifecycle,
];

for (const state of allLifecycles) {
  for (const readOp of readAndRecoveryOperations) {
    const evalResult = evaluateOperationEntitlement(state, readOp);
    assert(evalResult.allowed === true, `Read/recovery operation ${readOp} is permitted in ${state.state} state`);

    let didThrow = false;
    try {
      assertOperationEntitlement(state, readOp);
    } catch {
      didThrow = true;
    }
    assert(!didThrow, `assertOperationEntitlement never throws for read/recovery op ${readOp} in ${state.state}`);
  }

  // Capability flags on state.capabilities
  assert(state.capabilities.viewHistoricalRecords === true, `viewHistoricalRecords is true in ${state.state}`);
  assert(state.capabilities.reviewDurableCheckout === true, `reviewDurableCheckout is true in ${state.state}`);
  assert(state.capabilities.acknowledgeDurableCheckout === true, `acknowledgeDurableCheckout is true in ${state.state}`);
  assert(state.capabilities.reconcileExistingCashShift === true, `reconcileExistingCashShift is true in ${state.state}`);
  assert(state.capabilities.reconcilePreviouslyAcceptedOperations === true, `reconcilePreviouslyAcceptedOperations is true in ${state.state}`);
  assert(state.capabilities.refreshReadModels === true, `refreshReadModels is true in ${state.state}`);
  assert(state.capabilities.renewSubscription === true, `renewSubscription is true in ${state.state}`);
  assert(state.capabilities.manageDeviceSecurity === true, `manageDeviceSecurity is true in ${state.state}`);
}

console.log(`Server-authoritative entitlement tests: ${passed} passed`);
