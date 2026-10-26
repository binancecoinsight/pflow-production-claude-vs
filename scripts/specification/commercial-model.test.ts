import {
  COMMERCIAL_LOCK_PATHS,
  CreditSpecificationModel,
  ReferralSpecificationModel,
  SETTLEMENT_TRANSITIONS,
  SettlementSpecificationModel,
  validateCommercialLockPaths,
  type SettlementEvidence,
} from './commercial-model';

let passed = 0;
function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
}

const baseSettlement: SettlementEvidence = {
  provider: 'PAYSTACK',
  deliveryId: 'evt-1',
  deliveryDigest: 'digest-1',
  transactionId: 'txn-canonical-1',
  invoiceId: 'invoice-1',
  tenantId: 'tenant-a',
  currency: 'NGN',
  amountMinor: 10_000,
  state: 'SETTLED',
  channel: 'WEBHOOK',
};

// SPEC-SETTLEMENT-01: distinct deliveries and polling converge on one transaction/fulfillment.
const settlements = new SettlementSpecificationModel();
assert(settlements.process(baseSettlement).outcome === 'FULFILLED', 'first verified settlement fulfills once');
assert(settlements.process({ ...baseSettlement, deliveryId: 'evt-2', deliveryDigest: 'digest-2' }).outcome === 'REPLAY', 'second event for same transaction replays');
assert(settlements.process({ ...baseSettlement, deliveryId: null, deliveryDigest: null, channel: 'POLL' }).outcome === 'REPLAY', 'polling evidence for same transaction replays');
assert(settlements.process({ ...baseSettlement, deliveryId: 'evt-1', deliveryDigest: 'changed' }).outcome === 'EVIDENCE_CONFLICT', 'same delivery ID with changed digest conflicts');
assert(settlements.process({ ...baseSettlement, transactionId: 'txn-canonical-2' }).outcome === 'EVIDENCE_CONFLICT', 'second transaction cannot fulfill the same invoice');

// SPEC-SETTLEMENT-02: terminal evidence is monotonic, idempotent and cumulatively bounded.
const reversedFirst = new SettlementSpecificationModel();
const reversedFirstEvidence: SettlementEvidence = { ...baseSettlement, state: 'REFUNDED', compensationId: 'refund-first', compensationDigest: 'refund-first-v1', reversalAmountMinor: 10_000 };
assert(reversedFirst.process(reversedFirstEvidence).outcome === 'COMPENSATED', 'reversed-first evidence records compensation without fulfillment');
assert(reversedFirst.process({ ...baseSettlement, deliveryId: 'evt-late-settled', deliveryDigest: 'late-settled' }).outcome === 'REPLAY', 'late settled evidence cannot revive a refunded transaction');
assert(reversedFirst.process({ ...baseSettlement, state: 'PENDING', deliveryId: 'evt-late-pending', deliveryDigest: 'late-pending' }).outcome === 'REPLAY', 'late pending evidence cannot revive a refunded transaction');
assert(reversedFirst.process(reversedFirstEvidence).outcome === 'REPLAY', 'exact terminal compensation replay is effect-free');
assert(reversedFirst.process({ ...reversedFirstEvidence, compensationDigest: 'changed' }).outcome === 'EVIDENCE_CONFLICT', 'changed compensation evidence conflicts');

const partial = new SettlementSpecificationModel();
assert(partial.process(baseSettlement).outcome === 'FULFILLED', 'partial reversal fixture fulfills once');
const partialRefund = { ...baseSettlement, state: 'REFUNDED' as const, deliveryId: 'evt-refund-1', deliveryDigest: 'evt-refund-1-digest', compensationId: 'refund-1', compensationDigest: 'refund-1-digest', reversalAmountMinor: 3_000 };
assert(partial.process(partialRefund).outcome === 'COMPENSATED', 'first partial refund appends compensation');
assert(partial.process({ ...partialRefund, deliveryId: 'evt-refund-1-retry', deliveryDigest: 'retry-digest' }).outcome === 'REPLAY', 'same compensation through another delivery is effect-free');
assert(partial.process({ ...baseSettlement, state: 'CHARGEBACK', deliveryId: 'evt-chargeback', deliveryDigest: 'chargeback-event', compensationId: 'chargeback-1', compensationDigest: 'chargeback-proof', reversalAmountMinor: 7_000 }).outcome === 'COMPENSATED', 'competing terminal evidence may consume only remaining reversible amount');
assert(partial.process({ ...baseSettlement, state: 'REFUNDED', deliveryId: 'evt-over', deliveryDigest: 'over-event', compensationId: 'refund-over', compensationDigest: 'over-proof', reversalAmountMinor: 1 }).outcome === 'EVIDENCE_CONFLICT', 'cumulative compensation cannot exceed settlement amount');
assert(SETTLEMENT_TRANSITIONS.CHARGEBACK.SETTLED === 'CHARGEBACK' && SETTLEMENT_TRANSITIONS.REFUNDED.PENDING === 'REFUNDED', 'explicit transition table makes terminal states non-revivable');

// SPEC-CREDIT-01: aggregate balance, not per-invoice caps, serializes concurrent reservations.
const credits = new CreditSpecificationModel();
const ngn = { kind: 'CURRENCY' as const, code: 'NGN' };
credits.grant('tenant-a', ngn, 1_000);
assert(credits.reserve({ reservationId: 'r1', tenantId: 'tenant-a', asset: ngn, invoiceId: 'i1', amount: 700, expiresAt: 100 }) === 'RESERVED', 'first reservation wins available balance');
assert(credits.reserve({ reservationId: 'r2', tenantId: 'tenant-a', asset: ngn, invoiceId: 'i2', amount: 700, expiresAt: 100 }) === 'INSUFFICIENT', 'competing invoice cannot over-reserve aggregate balance');
assert(credits.snapshot('tenant-a', ngn).reserved === 700 && credits.snapshot('tenant-a', ngn).available === 300, 'reservation moves aggregate balance atomically');

// SPEC-CREDIT-02: timeout releases; late settlement cannot silently consume released credit.
assert(credits.expire('r1', 100) === 'RELEASED', 'reservation expiry releases balance');
assert(credits.consume('r1', 'i1') === 'RECONCILIATION_REQUIRED', 'late settlement after release requires reconciliation');
assert(credits.snapshot('tenant-a', ngn).available === 1_000, 'late settlement does not reconsume released credit');

// SPEC-CREDIT-03: tenant/currency ownership and partial consumed-credit reversal.
assert(credits.reserve({ reservationId: 'r3', tenantId: 'tenant-a', asset: ngn, invoiceId: 'i3', amount: 400, expiresAt: 200 }) === 'RESERVED', 'new reservation can use released balance');
assert(credits.consume('r3', 'i3') === 'CONSUMED', 'active reservation is consumed once');
assert(credits.reverseConsumed({ compensationId: 'credit-reversal-1', compensationDigest: 'credit-reversal-v1', tenantId: 'tenant-a', asset: ngn, amount: 150 }) === 'APPLIED', 'credit reversal applies once by stable compensation identity');
assert(credits.reverseConsumed({ compensationId: 'credit-reversal-1', compensationDigest: 'credit-reversal-v1', tenantId: 'tenant-a', asset: ngn, amount: 150 }) === 'REPLAY', 'exact credit reversal replay is effect-free');
assert(credits.reverseConsumed({ compensationId: 'credit-reversal-1', compensationDigest: 'changed', tenantId: 'tenant-a', asset: ngn, amount: 150 }) === 'CONFLICT', 'changed credit reversal evidence conflicts');
const afterReversal = credits.snapshot('tenant-a', ngn);
assert(afterReversal.consumed === 400 && afterReversal.reversed === 150 && afterReversal.recoveryDue === 150, 'partial reversal appends recovery without rewriting consumption');
assert(credits.reserve({ reservationId: 'r4', tenantId: 'tenant-b', asset: ngn, invoiceId: 'i4', amount: 1, expiresAt: 200 }) === 'INSUFFICIENT', 'credit cannot cross tenants');
assert(credits.reserve({ reservationId: 'r5', tenantId: 'tenant-a', asset: { kind: 'CURRENCY', code: 'USD' }, invoiceId: 'i5', amount: 1, expiresAt: 200 }) === 'INSUFFICIENT', 'credit cannot cross currency or imply FX');

// SPEC-CREDIT-04: provider ambiguity holds funds through timeout until proven absence.
assert(credits.reserve({ reservationId: 'r6', tenantId: 'tenant-a', asset: ngn, invoiceId: 'i6', amount: 300, expiresAt: 300 }) === 'RESERVED', 'ambiguity fixture reserves available credit');
assert(credits.holdForProviderAmbiguity('r6', 'provider-attempt-6', 'ambiguous-v1') === 'HELD', 'provider ambiguity moves reservation to reconciliation hold');
assert(credits.holdForProviderAmbiguity('r6', 'provider-attempt-6', 'ambiguous-v1') === 'REPLAY', 'exact ambiguity evidence replays');
assert(credits.holdForProviderAmbiguity('r6', 'provider-attempt-6', 'changed') === 'CONFLICT', 'changed ambiguity evidence conflicts');
assert(credits.expire('r6', 400) === 'HELD_FOR_RECONCILIATION', 'expiry cannot blindly release ambiguous credit');
assert(credits.releaseHeldAfterProvenAbsence('r6', 'absence-proof-6', 'absence-v1') === 'RELEASED', 'proved provider absence releases held credit');
assert(credits.releaseHeldAfterProvenAbsence('r6', 'absence-proof-6', 'absence-v1') === 'REPLAY', 'absence resolution exact replay is effect-free');
assert(credits.snapshot('tenant-a', ngn).available === 600, 'safe ambiguity release restores only its reservation amount');

// SPEC-REFERRAL-01: one organization/program award across versions and settlements.
const referrals = new ReferralSpecificationModel();
referrals.attribute({ programId: 'program-1', referredTenantId: 'tenant-new', referrerTenantId: 'tenant-referrer', policySnapshotId: 'policy-attribution-v1' });
referrals.addCandidate({ settlementKey: 'txn-later', referredTenantId: 'tenant-new', settledAt: 20, settlementPolicyVersion: 'policy-v3', eligible: true });
referrals.addCandidate({ settlementKey: 'txn-earlier-b', referredTenantId: 'tenant-new', settledAt: 10, settlementPolicyVersion: 'policy-v2', eligible: true });
referrals.addCandidate({ settlementKey: 'txn-earlier-a', referredTenantId: 'tenant-new', settledAt: 10, settlementPolicyVersion: 'policy-v4', eligible: true });
const award = referrals.qualify('program-1', 'tenant-new');
const competing = referrals.qualify('program-1', 'tenant-new');
assert(award.outcome === 'AWARDED', 'first serialized qualification creates one award');
assert(award.award?.settlementKey === 'txn-earlier-a', 'earliest settlement then stable transaction key selects deterministically');
assert(award.award?.policySnapshotId === 'policy-attribution-v1', 'award keeps immutable attribution policy snapshot despite settlement versions');
assert(competing.outcome === 'REPLAY' && competing.award?.awardKey === award.award?.awardKey, 'concurrent/retried qualification converges on organization/program award');
const reversed = referrals.reverse('program-1', 'tenant-new', 'chargeback-1');
assert(reversed.reversedBy === 'chargeback-1', 'qualification reversal links append-only compensation identity');

// SPEC-LOCK-01: all modeled paths are ordered subsequences of one hierarchy.
assert(validateCommercialLockPaths(), 'settlement, credit, expiry, refund, chargeback and referral paths share one lock hierarchy');
assert(!validateCommercialLockPaths({ ...COMMERCIAL_LOCK_PATHS, invalid: ['INVOICE', 'PAYMENT_ATTEMPT'] }), 'lock-order regression is detected by the specification check');

console.log(`Commercial specification-model tests: ${passed} passed`);
