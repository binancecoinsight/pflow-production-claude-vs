import { parseStrictTimestamp, parseStrictTimestampMicros, resolveCapabilities } from './lifecycle';
import type { SubscriptionLifecycle } from './capabilities';
import type { ProtectedMutationOperation } from './entitlementEnforcement';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/i;
const OPERATION_KINDS = new Set<ProtectedMutationOperation>(['SALE_COMMIT','SALE_CREATE','SALE_REFUND','INVENTORY_MUTATION','STOCK_INTAKE','STOCK_ADJUSTMENT','STOCK_ADJUST','STOCK_TRANSFER','TRANSFER_DISPATCH','TRANSFER_RECEIVE','REFUND_RESTOCK','CUSTOMER_MUTATION','SUPPLIER_MUTATION','CASH_SHIFT_OPEN','DEVICE_ENROLLMENT','STAFF_MUTATION','STAFF_INVITE','STAFF_ROLE','STAFF_REACTIVATE','STAFF_SUSPEND']);
const DECISION_KINDS = new Set<AdministrativeDecisionKind>(['SUSPEND','REINSTATE','DENY_MUTATIONS','ALLOW_MUTATIONS']);

export interface ReplayRequest {
  pharmacyId: string;
  branchId: string | null;
  operationKind: ProtectedMutationOperation;
  clientOperationId: string;
  actorId: string;
  deviceId: string | null;
  payloadFingerprint: string;
}

export interface ReplayEvidence extends ReplayRequest {
  outcome: 'COMMITTED' | 'PENDING' | 'REJECTED';
  committedAt: string | null;
  domainEntityId: string | null;
}

export interface ReplayAuthorization {
  readonly allowed: boolean;
  readonly scope: Readonly<ReplayRequest> | null;
  readonly reason: string;
}

export function authorizeExactReplay(request: ReplayRequest, evidence: unknown): ReplayAuthorization {
  const denied = (reason: string): ReplayAuthorization => ({ allowed: false, scope: null, reason });
  if (!OPERATION_KINDS.has(request.operationKind) || !UUID.test(request.pharmacyId) ||
      (request.branchId !== null && !UUID.test(request.branchId)) || !UUID.test(request.clientOperationId) || !UUID.test(request.actorId) ||
      (request.deviceId !== null && !UUID.test(request.deviceId)) || !SHA256.test(request.payloadFingerprint)) {
    return denied('Replay request identity or fingerprint is invalid.');
  }
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) return denied('Committed replay evidence is missing.');
  const row = evidence as Partial<ReplayEvidence>;
  if (row.outcome !== 'COMMITTED' || parseStrictTimestamp(row.committedAt) === null) return denied('Replay evidence is not an authoritative committed outcome.');
  if (!row.domainEntityId || !UUID.test(row.domainEntityId) || row.domainEntityId === request.clientOperationId) return denied('Replay evidence uses an invalid or substituted domain identity.');
  if (row.pharmacyId !== request.pharmacyId || row.branchId !== request.branchId || row.operationKind !== request.operationKind || row.clientOperationId !== request.clientOperationId ||
      row.actorId !== request.actorId || row.deviceId !== request.deviceId || row.payloadFingerprint?.toLowerCase() !== request.payloadFingerprint.toLowerCase()) {
    return denied('Replay evidence does not exactly match the requested operation and scope.');
  }
  return { allowed: true, scope: { ...request }, reason: 'Exact committed operation evidence matched.' };
}

export function consumeReplayAuthorization(
  current: ReplayRequest,
  authorization: unknown,
): boolean {
  if (!authorization || typeof authorization !== 'object' || Array.isArray(authorization)) return false;
  const proof = authorization as Partial<ReplayAuthorization>;
  if (proof.allowed !== true || !proof.scope || typeof proof.scope !== 'object') return false;
  const scope = proof.scope as Partial<ReplayRequest>;
  return OPERATION_KINDS.has(current.operationKind) && UUID.test(current.pharmacyId) &&
    (current.branchId === null || UUID.test(current.branchId)) && UUID.test(current.clientOperationId) &&
    UUID.test(current.actorId) && (current.deviceId === null || UUID.test(current.deviceId)) && SHA256.test(current.payloadFingerprint) &&
    scope.pharmacyId === current.pharmacyId && scope.branchId === current.branchId && scope.operationKind === current.operationKind &&
    scope.clientOperationId === current.clientOperationId && scope.actorId === current.actorId &&
    scope.deviceId === current.deviceId && scope.payloadFingerprint?.toLowerCase() === current.payloadFingerprint.toLowerCase();
}

export type AdministrativeDecisionKind = 'SUSPEND' | 'REINSTATE' | 'DENY_MUTATIONS' | 'ALLOW_MUTATIONS';
export interface AdministrativeDecision {
  id: string;
  pharmacyId: string;
  kind: AdministrativeDecisionKind;
  effectiveAt: string;
  sequence: number;
}

export function latestEffectiveDecision(
  decisions: readonly AdministrativeDecision[],
  expectedPharmacyId: string,
  serverTime: string,
): AdministrativeDecision | null {
  const now = parseStrictTimestampMicros(serverTime);
  if (!UUID.test(expectedPharmacyId) || now === null) return null;
  const valid = decisions.filter((decision) => UUID.test(decision.id) && DECISION_KINDS.has(decision.kind) && decision.pharmacyId === expectedPharmacyId &&
    Number.isSafeInteger(decision.sequence) && decision.sequence >= 0 && parseStrictTimestampMicros(decision.effectiveAt) !== null &&
    (parseStrictTimestampMicros(decision.effectiveAt) as bigint) <= now);
  valid.sort((a, b) => {
    const aMicros = parseStrictTimestampMicros(a.effectiveAt) as bigint;
    const bMicros = parseStrictTimestampMicros(b.effectiveAt) as bigint;
    if (aMicros !== bMicros) return aMicros > bMicros ? -1 : 1;
    if (a.sequence !== b.sequence) return b.sequence - a.sequence;
    return b.id.localeCompare(a.id);
  });
  return valid[0] ?? null;
}

export function evaluateEffectiveEntitlement(
  commercial: SubscriptionLifecycle,
  decisions: readonly AdministrativeDecision[],
  expectedPharmacyId: string,
  serverTime: string,
): SubscriptionLifecycle {
  if (!commercial.authoritative || commercial.pharmacyId !== expectedPharmacyId || parseStrictTimestamp(serverTime) === null) {
    return { ...commercial, state: 'UNKNOWN', mutationAllowed: false, authoritative: false,
      pharmacyId: null, serverTime: null, reason: 'Effective entitlement evidence is incomplete or scope-mismatched.', capabilities: resolveCapabilities('UNKNOWN') };
  }
  const decision = latestEffectiveDecision(decisions, expectedPharmacyId, serverTime);
  if (administrativeMutationDecision(decision) === 'DENY') {
    return { ...commercial, state: 'SUSPENDED', mutationAllowed: false, serverTime,
      reason: 'An effective administrative decision blocks new mutations.', capabilities: resolveCapabilities('SUSPENDED') };
  }
  // REINSTATE/ALLOW removes only the administrative overlay. It never manufactures
  // an active commercial period; the validated commercial lifecycle still controls.
  return { ...commercial, serverTime };
}

export function administrativeMutationDecision(decision: AdministrativeDecision | null): 'ALLOW' | 'DENY' | 'UNCHANGED' {
  if (!decision) return 'UNCHANGED';
  if (decision.kind === 'SUSPEND' || decision.kind === 'DENY_MUTATIONS') return 'DENY';
  if (decision.kind === 'REINSTATE' || decision.kind === 'ALLOW_MUTATIONS') return 'ALLOW';
  return 'UNCHANGED';
}
