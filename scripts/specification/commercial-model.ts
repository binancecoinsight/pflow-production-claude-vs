/**
 * Executable specification model for COM-01/02/03 review.
 * This is not runtime billing code, a persistence adapter, or server authority.
 */

export type EvidenceChannel = 'WEBHOOK' | 'POLL' | 'RECONCILIATION';
export type SettlementState = 'PENDING' | 'SETTLED' | 'REFUNDED' | 'CHARGEBACK';

export interface SettlementEvidence {
  provider: string;
  deliveryId: string | null;
  deliveryDigest: string | null;
  transactionId: string;
  invoiceId: string;
  tenantId: string;
  currency: string;
  amountMinor: number;
  state: SettlementState;
  channel: EvidenceChannel;
  compensationId?: string;
  compensationDigest?: string;
  reversalAmountMinor?: number;
}

export interface FulfillmentResult {
  outcome: 'PENDING' | 'FULFILLED' | 'REPLAY' | 'EVIDENCE_CONFLICT' | 'COMPENSATED';
  transactionKey: string;
  entitlementApplications: number;
}

interface CanonicalTransaction {
  fingerprint: string;
  state: SettlementState;
  invoiceId: string;
}

export const SETTLEMENT_TRANSITIONS: Readonly<Record<SettlementState, Readonly<Record<SettlementState, SettlementState>>>> = {
  PENDING: { PENDING: 'PENDING', SETTLED: 'SETTLED', REFUNDED: 'REFUNDED', CHARGEBACK: 'CHARGEBACK' },
  SETTLED: { PENDING: 'SETTLED', SETTLED: 'SETTLED', REFUNDED: 'REFUNDED', CHARGEBACK: 'CHARGEBACK' },
  REFUNDED: { PENDING: 'REFUNDED', SETTLED: 'REFUNDED', REFUNDED: 'REFUNDED', CHARGEBACK: 'CHARGEBACK' },
  CHARGEBACK: { PENDING: 'CHARGEBACK', SETTLED: 'CHARGEBACK', REFUNDED: 'CHARGEBACK', CHARGEBACK: 'CHARGEBACK' },
};

function assertMinor(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
}

function transactionFingerprint(e: SettlementEvidence): string {
  return [e.provider, e.transactionId, e.invoiceId, e.tenantId, e.currency, e.amountMinor].join('|');
}

export class SettlementSpecificationModel {
  private deliveries = new Map<string, string>();
  private transactions = new Map<string, CanonicalTransaction>();
  private invoiceFulfillments = new Map<string, string>();
  private entitlementSources = new Set<string>();
  private compensationFingerprints = new Map<string, string>();
  readonly compensations: Array<{ compensationKey: string; fingerprint: string; transactionKey: string; state: 'REFUNDED' | 'CHARGEBACK'; amountMinor: number }> = [];

  process(evidence: SettlementEvidence): FulfillmentResult {
    assertMinor(evidence.amountMinor, 'amountMinor');
    if (evidence.state === 'REFUNDED' || evidence.state === 'CHARGEBACK') {
      if (!evidence.compensationId || !evidence.compensationDigest || evidence.reversalAmountMinor === undefined) throw new Error('terminal evidence requires compensation identity, digest and amount');
      assertMinor(evidence.reversalAmountMinor, 'reversalAmountMinor');
    }
    const transactionKey = `${evidence.provider}:${evidence.transactionId}`;
    const fingerprint = transactionFingerprint(evidence);

    if (evidence.deliveryId !== null) {
      if (!evidence.deliveryDigest) throw new Error('deliveryDigest is required with deliveryId');
      const deliveryKey = `${evidence.provider}:${evidence.deliveryId}`;
      const seenDigest = this.deliveries.get(deliveryKey);
      if (seenDigest && seenDigest !== evidence.deliveryDigest) {
        return { outcome: 'EVIDENCE_CONFLICT', transactionKey, entitlementApplications: this.entitlementSources.size };
      }
      this.deliveries.set(deliveryKey, evidence.deliveryDigest);
    }

    const existing = this.transactions.get(transactionKey);
    if (existing && existing.fingerprint !== fingerprint) {
      return { outcome: 'EVIDENCE_CONFLICT', transactionKey, entitlementApplications: this.entitlementSources.size };
    }

    const priorState = existing?.state;
    const transaction = existing ?? { fingerprint, state: evidence.state, invoiceId: evidence.invoiceId };
    const nextState = priorState ? SETTLEMENT_TRANSITIONS[priorState][evidence.state] : evidence.state;

    if (evidence.state === 'PENDING') {
      transaction.state = nextState;
      if (!existing) this.transactions.set(transactionKey, transaction);
      return { outcome: nextState === 'PENDING' ? 'PENDING' : 'REPLAY', transactionKey, entitlementApplications: this.entitlementSources.size };
    }

    if (evidence.state === 'REFUNDED' || evidence.state === 'CHARGEBACK') {
      const compensationKey = `${evidence.provider}:${evidence.compensationId}`;
      const compensationFingerprint = [transactionKey, evidence.state, evidence.reversalAmountMinor, evidence.compensationDigest].join('|');
      const priorCompensation = this.compensationFingerprints.get(compensationKey);
      if (priorCompensation) return { outcome: priorCompensation === compensationFingerprint ? 'REPLAY' : 'EVIDENCE_CONFLICT', transactionKey, entitlementApplications: this.entitlementSources.size };
      const cumulative = this.compensations.filter((row) => row.transactionKey === transactionKey).reduce((sum, row) => sum + row.amountMinor, 0);
      if (cumulative + evidence.reversalAmountMinor > evidence.amountMinor) return { outcome: 'EVIDENCE_CONFLICT', transactionKey, entitlementApplications: this.entitlementSources.size };
      transaction.state = nextState;
      if (!existing) this.transactions.set(transactionKey, transaction);
      this.compensationFingerprints.set(compensationKey, compensationFingerprint);
      this.compensations.push({ compensationKey, fingerprint: compensationFingerprint, transactionKey, state: evidence.state, amountMinor: evidence.reversalAmountMinor });
      return { outcome: 'COMPENSATED', transactionKey, entitlementApplications: this.entitlementSources.size };
    }

    if (nextState === 'REFUNDED' || nextState === 'CHARGEBACK') {
      return { outcome: 'REPLAY', transactionKey, entitlementApplications: this.entitlementSources.size };
    }
    transaction.state = nextState;
    if (!existing) this.transactions.set(transactionKey, transaction);

    const fulfilledBy = this.invoiceFulfillments.get(evidence.invoiceId);
    if (fulfilledBy && fulfilledBy !== transactionKey) {
      return { outcome: 'EVIDENCE_CONFLICT', transactionKey, entitlementApplications: this.entitlementSources.size };
    }

    this.invoiceFulfillments.set(evidence.invoiceId, transactionKey);
    const before = this.entitlementSources.size;
    this.entitlementSources.add(transactionKey);
    return {
      outcome: before === this.entitlementSources.size ? 'REPLAY' : 'FULFILLED',
      transactionKey,
      entitlementApplications: this.entitlementSources.size,
    };
  }
}

export type CreditAsset =
  | { kind: 'CURRENCY'; code: string }
  | { kind: 'ENTITLEMENT_UNIT'; code: string };

interface CreditAccount {
  tenantId: string;
  assetKey: string;
  granted: number;
  available: number;
  reserved: number;
  consumed: number;
  reversed: number;
  recoveryDue: number;
}

interface CreditReservation {
  id: string;
  fingerprint: string;
  accountKey: string;
  invoiceId: string;
  amount: number;
  expiresAt: number;
  state: 'ACTIVE' | 'HELD_FOR_RECONCILIATION' | 'CONSUMED' | 'EXPIRED';
  ambiguityKey: string | null;
  ambiguityFingerprint: string | null;
}

export interface CreditSnapshot {
  granted: number;
  available: number;
  reserved: number;
  consumed: number;
  reversed: number;
  recoveryDue: number;
}

function assetKey(asset: CreditAsset): string {
  return `${asset.kind}:${asset.code.toUpperCase()}`;
}

export class CreditSpecificationModel {
  private accounts = new Map<string, CreditAccount>();
  private reservations = new Map<string, CreditReservation>();
  private reversalFingerprints = new Map<string, string>();
  private ambiguityResolutionFingerprints = new Map<string, string>();

  private key(tenantId: string, asset: CreditAsset): string {
    return `${tenantId}|${assetKey(asset)}`;
  }

  grant(tenantId: string, asset: CreditAsset, amount: number): void {
    assertMinor(amount, 'credit grant');
    const key = this.key(tenantId, asset);
    const account = this.accounts.get(key) ?? {
      tenantId, assetKey: assetKey(asset), granted: 0, available: 0,
      reserved: 0, consumed: 0, reversed: 0, recoveryDue: 0,
    };
    account.granted += amount;
    account.available += amount;
    this.accounts.set(key, account);
  }

  reserve(input: {
    reservationId: string;
    tenantId: string;
    asset: CreditAsset;
    invoiceId: string;
    amount: number;
    expiresAt: number;
  }): 'RESERVED' | 'REPLAY' | 'INSUFFICIENT' | 'CONFLICT' {
    assertMinor(input.amount, 'credit reservation');
    const key = this.key(input.tenantId, input.asset);
    const fingerprint = [key, input.invoiceId, input.amount, input.expiresAt].join('|');
    const prior = this.reservations.get(input.reservationId);
    if (prior) return prior.fingerprint === fingerprint ? 'REPLAY' : 'CONFLICT';
    const account = this.accounts.get(key);
    if (!account || account.available < input.amount) return 'INSUFFICIENT';
    account.available -= input.amount;
    account.reserved += input.amount;
    this.reservations.set(input.reservationId, {
      id: input.reservationId,
      fingerprint,
      accountKey: key,
      invoiceId: input.invoiceId,
      amount: input.amount,
      expiresAt: input.expiresAt,
      state: 'ACTIVE',
      ambiguityKey: null,
      ambiguityFingerprint: null,
    });
    return 'RESERVED';
  }

  holdForProviderAmbiguity(reservationId: string, evidenceId: string, evidenceDigest: string): 'HELD' | 'REPLAY' | 'CONFLICT' | 'TERMINAL' {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || !['ACTIVE', 'HELD_FOR_RECONCILIATION'].includes(reservation.state)) return 'TERMINAL';
    const key = `${reservationId}|${evidenceId}`;
    const fingerprint = `${key}|${evidenceDigest}`;
    if (reservation.ambiguityKey) return reservation.ambiguityKey === key && reservation.ambiguityFingerprint === fingerprint ? 'REPLAY' : 'CONFLICT';
    reservation.state = 'HELD_FOR_RECONCILIATION';
    reservation.ambiguityKey = key;
    reservation.ambiguityFingerprint = fingerprint;
    return 'HELD';
  }

  expire(reservationId: string, now: number): 'RELEASED' | 'NOT_DUE' | 'HELD_FOR_RECONCILIATION' | 'TERMINAL' {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || ['CONSUMED', 'EXPIRED'].includes(reservation.state)) return 'TERMINAL';
    if (now < reservation.expiresAt) return 'NOT_DUE';
    if (reservation.state === 'HELD_FOR_RECONCILIATION') return 'HELD_FOR_RECONCILIATION';
    const account = this.accounts.get(reservation.accountKey)!;
    account.reserved -= reservation.amount;
    account.available += reservation.amount;
    reservation.state = 'EXPIRED';
    return 'RELEASED';
  }

  releaseHeldAfterProvenAbsence(reservationId: string, resolutionId: string, resolutionDigest: string): 'RELEASED' | 'REPLAY' | 'CONFLICT' {
    const key = `${reservationId}|${resolutionId}`;
    const fingerprint = `${key}|${resolutionDigest}`;
    const prior = this.ambiguityResolutionFingerprints.get(key);
    if (prior) return prior === fingerprint ? 'REPLAY' : 'CONFLICT';
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.state !== 'HELD_FOR_RECONCILIATION') return 'CONFLICT';
    const account = this.accounts.get(reservation.accountKey)!;
    account.reserved -= reservation.amount;
    account.available += reservation.amount;
    reservation.state = 'EXPIRED';
    this.ambiguityResolutionFingerprints.set(key, fingerprint);
    return 'RELEASED';
  }

  consume(reservationId: string, invoiceId: string): 'CONSUMED' | 'REPLAY' | 'RECONCILIATION_REQUIRED' | 'CONFLICT' {
    const reservation = this.reservations.get(reservationId);
    if (!reservation || reservation.invoiceId !== invoiceId) return 'CONFLICT';
    if (reservation.state === 'CONSUMED') return 'REPLAY';
    if (reservation.state === 'EXPIRED' || reservation.state === 'HELD_FOR_RECONCILIATION') return 'RECONCILIATION_REQUIRED';
    const account = this.accounts.get(reservation.accountKey)!;
    account.reserved -= reservation.amount;
    account.consumed += reservation.amount;
    reservation.state = 'CONSUMED';
    return 'CONSUMED';
  }

  reverseConsumed(input: { compensationId: string; compensationDigest: string; tenantId: string; asset: CreditAsset; amount: number }): 'APPLIED' | 'REPLAY' | 'CONFLICT' {
    assertMinor(input.amount, 'credit reversal');
    const accountKey = this.key(input.tenantId, input.asset);
    const compensationKey = `${accountKey}|${input.compensationId}`;
    const fingerprint = `${compensationKey}|${input.compensationDigest}|${input.amount}`;
    const prior = this.reversalFingerprints.get(compensationKey);
    if (prior) return prior === fingerprint ? 'REPLAY' : 'CONFLICT';
    const account = this.accounts.get(accountKey);
    if (!account || input.amount > account.consumed - account.reversed) return 'CONFLICT';
    account.reversed += input.amount;
    account.recoveryDue += input.amount;
    this.reversalFingerprints.set(compensationKey, fingerprint);
    return 'APPLIED';
  }

  snapshot(tenantId: string, asset: CreditAsset): CreditSnapshot {
    const account = this.accounts.get(this.key(tenantId, asset));
    if (!account) return { granted: 0, available: 0, reserved: 0, consumed: 0, reversed: 0, recoveryDue: 0 };
    return { granted: account.granted, available: account.available, reserved: account.reserved, consumed: account.consumed, reversed: account.reversed, recoveryDue: account.recoveryDue };
  }
}

export interface ReferralCandidate {
  settlementKey: string;
  referredTenantId: string;
  settledAt: number;
  settlementPolicyVersion: string;
  eligible: boolean;
}

export const COMMERCIAL_LOCK_ORDER = [
  'CANONICAL_TRANSACTION', 'PAYMENT_ATTEMPT', 'INVOICE', 'CREDIT_ACCOUNT',
  'CREDIT_RESERVATION', 'REFERRAL_AWARD', 'SUBSCRIPTION_TERM',
] as const;
export type CommercialLockResource = typeof COMMERCIAL_LOCK_ORDER[number];
export const COMMERCIAL_LOCK_PATHS: Readonly<Record<string, readonly CommercialLockResource[]>> = {
  settlement: ['CANONICAL_TRANSACTION', 'PAYMENT_ATTEMPT', 'INVOICE', 'CREDIT_ACCOUNT', 'CREDIT_RESERVATION', 'SUBSCRIPTION_TERM'],
  creditReservation: ['PAYMENT_ATTEMPT', 'INVOICE', 'CREDIT_ACCOUNT', 'CREDIT_RESERVATION'],
  reservationExpiry: ['PAYMENT_ATTEMPT', 'INVOICE', 'CREDIT_ACCOUNT', 'CREDIT_RESERVATION'],
  refund: ['CANONICAL_TRANSACTION', 'PAYMENT_ATTEMPT', 'INVOICE', 'CREDIT_ACCOUNT', 'CREDIT_RESERVATION', 'REFERRAL_AWARD', 'SUBSCRIPTION_TERM'],
  chargeback: ['CANONICAL_TRANSACTION', 'PAYMENT_ATTEMPT', 'INVOICE', 'CREDIT_ACCOUNT', 'CREDIT_RESERVATION', 'REFERRAL_AWARD', 'SUBSCRIPTION_TERM'],
  referralQualification: ['CANONICAL_TRANSACTION', 'INVOICE', 'CREDIT_ACCOUNT', 'REFERRAL_AWARD'],
};

export function validateCommercialLockPaths(paths = COMMERCIAL_LOCK_PATHS): boolean {
  const rank = new Map(COMMERCIAL_LOCK_ORDER.map((resource, index) => [resource, index]));
  return Object.values(paths).every((path) => path.every((resource, index) => index === 0 || rank.get(path[index - 1])! < rank.get(resource)!));
}

interface ReferralAttribution {
  programId: string;
  referredTenantId: string;
  referrerTenantId: string;
  policySnapshotId: string;
}

export interface ReferralAward {
  awardKey: string;
  settlementKey: string;
  policySnapshotId: string;
  reversedBy: string | null;
}

export class ReferralSpecificationModel {
  private attributions = new Map<string, ReferralAttribution>();
  private candidates: ReferralCandidate[] = [];
  private awards = new Map<string, ReferralAward>();

  attribute(row: ReferralAttribution): void {
    const key = `${row.programId}|${row.referredTenantId}`;
    if (this.attributions.has(key)) throw new Error('organization already attributed for program');
    if (row.referredTenantId === row.referrerTenantId) throw new Error('self referral denied');
    this.attributions.set(key, { ...row });
  }

  addCandidate(candidate: ReferralCandidate): void {
    if (!this.candidates.some((row) => row.settlementKey === candidate.settlementKey)) {
      this.candidates.push({ ...candidate });
    }
  }

  qualify(programId: string, referredTenantId: string): { outcome: 'AWARDED' | 'REPLAY' | 'NOT_ELIGIBLE'; award?: ReferralAward } {
    const awardKey = `${programId}|${referredTenantId}`;
    const existing = this.awards.get(awardKey);
    if (existing) return { outcome: 'REPLAY', award: { ...existing } };
    const attribution = this.attributions.get(awardKey);
    if (!attribution) return { outcome: 'NOT_ELIGIBLE' };
    const winner = this.candidates
      .filter((row) => row.referredTenantId === referredTenantId && row.eligible)
      .sort((a, b) => a.settledAt - b.settledAt || a.settlementKey.localeCompare(b.settlementKey))[0];
    if (!winner) return { outcome: 'NOT_ELIGIBLE' };
    const award: ReferralAward = {
      awardKey,
      settlementKey: winner.settlementKey,
      policySnapshotId: attribution.policySnapshotId,
      reversedBy: null,
    };
    this.awards.set(awardKey, award);
    return { outcome: 'AWARDED', award: { ...award } };
  }

  reverse(programId: string, referredTenantId: string, compensationId: string): ReferralAward {
    const award = this.awards.get(`${programId}|${referredTenantId}`);
    if (!award) throw new Error('award missing');
    if (award.reversedBy && award.reversedBy !== compensationId) throw new Error('award already reversed by different compensation');
    award.reversedBy = compensationId;
    return { ...award };
  }
}
