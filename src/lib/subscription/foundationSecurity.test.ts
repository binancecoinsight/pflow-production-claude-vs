import { resolveAuthoritativeEntitlement, resolveCapabilities } from './lifecycle';
import { createRpcEntitlementAdapter } from './entitlementAdapter';
import { authorizeExactReplay, consumeReplayAuthorization, latestEffectiveDecision, administrativeMutationDecision, evaluateEffectiveEntitlement, type ReplayRequest } from './foundationSecurity';
import { evaluateOperationEntitlement } from './entitlementEnforcement';

let passed = 0;
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(`FAIL: ${message}`); passed += 1; };
const pharmacyId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const deviceId = '33333333-3333-4333-8333-333333333333';
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const clientOperationId = '44444444-4444-4444-8444-444444444444';
const domainEntityId = '55555555-5555-4555-8555-555555555555';
const fingerprint = 'a'.repeat(64);
const payload = {
  pharmacy_id: pharmacyId, state: 'ACTIVE', plan_code: 'PRO', features: {},
  current_period_start: '2026-10-01T00:00:00Z', current_period_end: '2026-11-01T00:00:00Z',
  grace_period_end: '2026-11-08T00:00:00Z', mutations_allowed: true,
  historical_reads_allowed: true, server_time: '2026-10-29T12:00:00Z', reason: 'Active',
};

assert(resolveAuthoritativeEntitlement(payload, pharmacyId).authoritative, 'complete request-bound evidence is authoritative');
for (const malformed of [
  { ...payload, pharmacy_id: actorId },
  { ...payload, mutations_allowed: false },
  { ...payload, current_period_start: null },
  { ...payload, current_period_end: '2026-10-29 12:00:00' },
  { ...payload, grace_period_end: '2026-10-01T00:00:00Z' },
  { ...payload, server_time: '2026-11-02T00:00:00Z' },
]) assert(!resolveAuthoritativeEntitlement(malformed, pharmacyId).authoritative, 'contradictory, incomplete, malformed, or cross-tenant evidence fails closed');

const request: ReplayRequest = { pharmacyId, branchId, operationKind: 'SALE_COMMIT', clientOperationId, actorId, deviceId, payloadFingerprint: fingerprint };
const evidence = { ...request, outcome: 'COMMITTED' as const, committedAt: '2026-10-29T12:00:00Z', domainEntityId };
assert(authorizeExactReplay(request, evidence).allowed, 'exact committed replay evidence is accepted');
assert(!authorizeExactReplay({ ...request, operationKind: 'UNKNOWN_KIND' as never }, evidence).allowed, 'unknown operation kinds are rejected');
for (const changed of [
  { ...evidence, operationKind: 'STOCK_INTAKE' },
  { ...evidence, branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  { ...evidence, clientOperationId: domainEntityId },
  { ...evidence, actorId: domainEntityId },
  { ...evidence, deviceId: null },
  { ...evidence, payloadFingerprint: 'b'.repeat(64) },
  { ...evidence, outcome: 'PENDING' },
  { ...evidence, domainEntityId: clientOperationId },
  null,
]) assert(!authorizeExactReplay(request, changed).allowed, 'changed scope, kind, hash, status, identity, or missing evidence is rejected');

const expired = { state: 'EXPIRED' as const, mutationAllowed: false, historicalReadAllowed: true as const,
  periodEnd: '2026-10-01T00:00:00Z', graceEnd: '2026-10-08T00:00:00Z', authoritative: true,
  pharmacyId, serverTime: '2026-10-29T12:00:00Z', reason: 'Expired', capabilities: { } as never };
const authorization = authorizeExactReplay(request, evidence);
const replay = { authorization, currentRequest: request };
assert(evaluateOperationEntitlement(expired, 'SALE_COMMIT', replay).allowed, 'matching replay authorization preserves exact financial replay');
assert(!evaluateOperationEntitlement(expired, 'STOCK_INTAKE', replay).allowed, 'replay authorization cannot cross operation kinds');
for (const changedRequest of [
  { ...request, pharmacyId: '99999999-9999-4999-8999-999999999999' },
  { ...request, branchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
  { ...request, clientOperationId: domainEntityId },
  { ...request, actorId: domainEntityId },
  { ...request, deviceId: null },
  { ...request, payloadFingerprint: 'b'.repeat(64) },
]) {
  assert(!consumeReplayAuthorization(changedRequest, authorization), 'authorization consumption rejects cross-scope proof reuse');
  assert(!evaluateOperationEntitlement({ ...expired, pharmacyId: changedRequest.pharmacyId }, 'SALE_COMMIT', { authorization, currentRequest: changedRequest }).allowed,
    'final entitlement decision rejects cross-pharmacy or same-kind cross-operation proof reuse');
}
for (const malformed of [null, true, 'proof', [], {}, { allowed: true }, { allowed: true, scope: null }, { allowed: true, scope: { ...request, actorId: 7 } }]) {
  assert(!consumeReplayAuthorization(request, malformed), 'malformed authorization is rejected without throwing');
}

const decisions = [
  { id: '66666666-6666-4666-8666-666666666666', pharmacyId, kind: 'SUSPEND' as const, effectiveAt: '2026-10-20T10:00:00+01:00', sequence: 1 },
  { id: '77777777-7777-4777-8777-777777777777', pharmacyId, kind: 'REINSTATE' as const, effectiveAt: '2026-10-20T09:00:00Z', sequence: 2 },
  { id: '88888888-8888-4888-8888-888888888888', pharmacyId, kind: 'DENY_MUTATIONS' as const, effectiveAt: '2026-11-01T00:00:00Z', sequence: 3 },
];
const latest = latestEffectiveDecision(decisions, pharmacyId, '2026-10-29T12:00:00Z');
assert(latest?.kind === 'REINSTATE', 'equal instants use deterministic sequence ordering and explicit reinstatement wins');
assert(administrativeMutationDecision(latest) === 'ALLOW', 'reinstatement explicitly permits commercial lifecycle evaluation');
assert(administrativeMutationDecision(latestEffectiveDecision(decisions, pharmacyId, '2026-11-02T00:00:00Z')) === 'DENY', 'later negative decision overrides renewal timing');

const precisionDecisions = [
  { id: '99999999-9999-4999-8999-999999999991', pharmacyId, kind: 'SUSPEND' as const, effectiveAt: '2026-10-29T12:00:00.000001Z', sequence: 9 },
  { id: '99999999-9999-4999-8999-999999999992', pharmacyId, kind: 'REINSTATE' as const, effectiveAt: '2026-10-29T12:00:00.000002Z', sequence: 1 },
  { id: '99999999-9999-4999-8999-999999999993', pharmacyId, kind: 'DENY_MUTATIONS' as const, effectiveAt: '2026-10-29T13:00:00.000002+01:00', sequence: 2 },
  { id: '99999999-9999-4999-8999-999999999994', pharmacyId, kind: 'ALLOW_MUTATIONS' as const, effectiveAt: '2026-10-29T12:00:00.000002Z', sequence: 2 },
  { id: '99999999-9999-4999-8999-999999999995', pharmacyId, kind: 'SUSPEND' as const, effectiveAt: '2026-10-30T00:00:00Z', sequence: 99 },
];
assert(latestEffectiveDecision(precisionDecisions.slice(0, 2), pharmacyId, '2026-10-29T12:00:00.000002Z')?.kind === 'REINSTATE', 'different microsecond instants are not truncated');
assert(latestEffectiveDecision(precisionDecisions.slice(0, 3), pharmacyId, '2026-10-29T12:00:00.000002Z')?.kind === 'DENY_MUTATIONS', 'timezone-equivalent instants use sequence tie-break');
assert(latestEffectiveDecision(precisionDecisions.slice(0, 4), pharmacyId, '2026-10-29T12:00:00.000002Z')?.kind === 'ALLOW_MUTATIONS', 'equal instant and sequence use UUID tie-break');
assert(latestEffectiveDecision(precisionDecisions, pharmacyId, '2026-10-29T12:00:00.000002Z')?.id !== precisionDecisions[4].id, 'future decisions are excluded');

const activeLifecycle = { ...expired, state: 'ACTIVE' as const, mutationAllowed: true,
  periodEnd: '2026-11-01T00:00:00Z', graceEnd: '2026-11-08T00:00:00Z', capabilities: resolveCapabilities('ACTIVE') };
const suspendedEffective = evaluateEffectiveEntitlement(activeLifecycle, [precisionDecisions[0]], pharmacyId, '2026-10-29T12:00:00.000001Z');
assert(suspendedEffective.state === 'SUSPENDED' && !suspendedEffective.mutationAllowed, 'suspension overrides an active or renewed commercial period');
const reinstatedEffective = evaluateEffectiveEntitlement(activeLifecycle, precisionDecisions.slice(0, 2), pharmacyId, '2026-10-29T12:00:00.000002Z');
assert(reinstatedEffective.state === 'ACTIVE' && reinstatedEffective.mutationAllowed, 'explicit reinstatement exposes the still-valid renewed commercial period');
const expiredReinstated = evaluateEffectiveEntitlement(expired, [{ ...precisionDecisions[1], kind: 'REINSTATE' as const }], pharmacyId, '2026-10-29T12:00:00.000002Z');
assert(expiredReinstated.state === 'EXPIRED' && !expiredReinstated.mutationAllowed, 'reinstatement never manufactures an active commercial entitlement');

let scheduledMs = 0;
const adapter = createRpcEntitlementAdapter({ rpc: () => new Promise(() => undefined) }, {
  timeoutMs: 1,
  scheduleTimeout: (callback, ms) => { scheduledMs = ms; queueMicrotask(callback); return 1; },
  cancelTimeout: () => undefined,
});
const timedOut = await adapter.getEffectiveEntitlement(pharmacyId);
assert(scheduledMs === 25 && timedOut.state === 'UNKNOWN' && !timedOut.reason.includes('Error'), 'bounded injected timeout fails closed with sanitized reason');

const secret = 'credential-secret';
const failed = await createRpcEntitlementAdapter({ rpc: async () => ({ data: null, error: secret }) }).getEffectiveEntitlement(pharmacyId);
assert(!failed.reason.includes(secret) && failed.state === 'UNKNOWN', 'executor errors are sanitized');

console.log(`Entitlement foundation security tests: ${passed} passed`);
