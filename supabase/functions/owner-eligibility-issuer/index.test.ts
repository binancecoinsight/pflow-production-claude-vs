import {
  buildOwnerIntentFingerprint,
  hasExactTrustedOwnerAuthority,
  issueOwnerEligibility,
  OwnerAuthIdentity,
  OwnerEligibilityRepository,
  OwnerEligibilityRequest,
  OwnerEligibilityReservation,
  OwnerIssuerAuthProvider,
  recoverAuthenticatedOwnerEligibility,
  ReservationBinding,
  TrustedOwnerMarker,
} from './index';

let passed = 0;
const assert = (condition: boolean, message: string) => { if (!condition) throw new Error(message); passed += 1; };
const rejects = async (work: () => Promise<unknown>, pattern: RegExp, message: string) => {
  try { await work(); } catch (error) { assert(pattern.test(String(error)), message); return; }
  throw new Error(`Expected rejection: ${message}`);
};

const base: OwnerEligibilityRequest = {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  email: 'owner@example.test',
  password: 'secret-password',
  fullName: 'Owner Person',
  pharmacyName: 'Alpha Pharmacy',
  currency: 'NGN',
};
const subjectId = '660e8400-e29b-41d4-a716-446655440001';
const otherSubjectId = '660e8400-e29b-41d4-a716-446655440009';
const operationId = '770e8400-e29b-41d4-a716-446655440002';
const recoveryIntent = { requestId: base.requestId, email: base.email, pharmacyName: base.pharmacyName, currency: base.currency };
const clone = (row: OwnerEligibilityReservation): OwnerEligibilityReservation => ({ ...row });
const bind = (row: OwnerEligibilityReservation): ReservationBinding => ({
  requestId: row.requestId,
  providerOperationId: row.providerOperationId,
  intendedInputFingerprint: row.intendedInputFingerprint,
});

class SqlFaithfulRepository implements OwnerEligibilityRepository {
  admitted = true;
  rows = new Map<string, OwnerEligibilityReservation>();
  rowEmails = new Map<string, string>();
  transitionCalls = 0;
  correlateCalls = 0;
  activateCalls = 0;
  reserveResponseLossOnce = false;
  correlateFailure: 'before' | 'after' | null = null;

  private exact(binding: Pick<ReservationBinding, 'requestId' | 'intendedInputFingerprint'> & Partial<ReservationBinding>) {
    const row = this.rows.get(binding.requestId);
    if (!row || row.intendedInputFingerprint !== binding.intendedInputFingerprint ||
        (binding.providerOperationId && row.providerOperationId !== binding.providerOperationId)) throw new Error('REQUEST_CONFLICT');
    return row;
  }
  async reserveIfManuallyAdmitted(input: Parameters<OwnerEligibilityRepository['reserveIfManuallyAdmitted']>[0]) {
    const existing = this.rows.get(input.requestId);
    if (existing) {
      if (existing.intendedInputFingerprint !== input.intendedInputFingerprint || this.rowEmails.get(input.requestId) !== input.normalizedEmail) {
        throw new Error('REQUEST_CONFLICT');
      }
      return clone(existing);
    }
    if (!this.admitted) throw new Error('ISSUANCE_DISABLED');
    const open = Array.from(this.rows.values()).find((row) => this.rowEmails.get(row.requestId) === input.normalizedEmail &&
      ['RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING', 'ACTIVE'].includes(row.state));
    if (open) throw new Error('OPEN_EMAIL_CONFLICT');
    const row: OwnerEligibilityReservation = {
      contractVersion: 'owner-eligibility-issuer-v1', ownerContractVersion: 'owner-onboarding-v1',
      requestId: input.requestId, providerOperationId: operationId,
      intendedInputFingerprint: input.intendedInputFingerprint,
      admissionPolicyVersion: 'closed-manual-v1', admissionEvidenceId: 'manual-ticket-1', state: 'RESERVED',
    };
    this.rows.set(input.requestId, row); this.rowEmails.set(input.requestId, input.normalizedEmail);
    if (this.reserveResponseLossOnce) { this.reserveResponseLossOnce = false; throw new Error('synthetic reservation response loss'); }
    return clone(row);
  }
  async getExactReservation(binding: Pick<ReservationBinding, 'requestId' | 'intendedInputFingerprint'>) { return clone(this.exact(binding)); }
  async markAuthCreatePending(binding: ReservationBinding) {
    this.transitionCalls += 1;
    const row = this.exact(binding);
    if (row.state === 'AUTH_CREATE_PENDING') return clone(row);
    if (row.state !== 'RESERVED') throw new Error('INVALID_AUTH_PENDING_TRANSITION');
    row.state = 'AUTH_CREATE_PENDING'; return clone(row);
  }
  async correlateSubject(binding: ReservationBinding & { subjectId: string }) {
    this.correlateCalls += 1;
    const row = this.exact(binding);
    if (row.state === 'EMAIL_CONFIRMATION_PENDING' && row.subjectId === binding.subjectId) return clone(row);
    if (row.state !== 'AUTH_CREATE_PENDING' || row.subjectId) throw new Error('SUBJECT_OPERATION_CONFLICT');
    if (this.correlateFailure === 'before') { this.correlateFailure = null; throw new Error('synthetic correlation failure before commit'); }
    row.subjectId = binding.subjectId; row.state = 'EMAIL_CONFIRMATION_PENDING';
    if (this.correlateFailure === 'after') { this.correlateFailure = null; throw new Error('synthetic correlation response loss'); }
    return clone(row);
  }
  async activate(binding: ReservationBinding & { subjectId: string }) {
    this.activateCalls += 1;
    const row = this.exact(binding);
    if (row.subjectId !== binding.subjectId) throw new Error('SUBJECT_OPERATION_CONFLICT');
    if (row.state === 'ACTIVE') return clone(row);
    if (row.state !== 'EMAIL_CONFIRMATION_PENDING') throw new Error('INVALID_ACTIVATION_TRANSITION');
    row.state = 'ACTIVE'; return clone(row);
  }
}

class MemoryAuth implements OwnerIssuerAuthProvider {
  identity: OwnerAuthIdentity | null = null;
  operations = new Map<string, OwnerAuthIdentity>();
  lookupCalls = 0;
  createCalls = 0;
  recoveryCalls = 0;
  authenticatedRecoveryCalls = 0;
  markerWrites = 0;
  createResponseLoss = false;
  recoverWrongOperation = false;
  async findExistingByEmail() { this.lookupCalls += 1; return this.identity; }
  async createUnconfirmedOwner(input: Parameters<OwnerIssuerAuthProvider['createUnconfirmedOwner']>[0]) {
    this.createCalls += 1;
    const identity: OwnerAuthIdentity = {
      id: subjectId, email: input.normalizedEmail, emailConfirmed: false,
      identityClass: 'OWNER_ONBOARDING_V1', providerOperationId: input.providerOperationId, trustedMarker: input.trustedMarker,
    };
    this.identity = identity; this.operations.set(input.providerOperationId, identity);
    if (this.createResponseLoss) { this.createResponseLoss = false; throw new Error('provider response lost'); }
    return identity;
  }
  async recoverByProviderOperation(id: string) {
    this.recoveryCalls += 1;
    if (this.recoverWrongOperation && this.identity) return { ...this.identity, providerOperationId: '880e8400-e29b-41d4-a716-446655440003' };
    return this.operations.get(id) || null;
  }
  async recoverAuthenticatedByProviderOperation(input: { authenticatedSubjectId: string; providerOperationId: string }) {
    this.authenticatedRecoveryCalls += 1;
    const identity = this.operations.get(input.providerOperationId);
    return identity?.id === input.authenticatedSubjectId ? identity : null;
  }
  async putExactTrustedMarker(id: string, operation: string, marker: TrustedOwnerMarker) {
    if (!this.identity || this.identity.id !== id || operation !== this.identity.providerOperationId) throw new Error('marker correlation failure');
    if (this.identity.trustedMarker && !hasExactTrustedOwnerAuthority(this.identity.trustedMarker, marker)) throw new Error('immutable marker conflict');
    this.identity.trustedMarker = marker; this.markerWrites += 1;
  }
}

const issue = (repository = new SqlFaithfulRepository(), auth = new MemoryAuth()) => ({ repository, auth, run: () => issueOwnerEligibility(base, { repository, auth }) });

// Admission denial is authoritative and precedes every provider call.
{
  const x = issue(); x.repository.admitted = false;
  await rejects(x.run, /ISSUANCE_DISABLED/, 'manual admission denial is fail-closed');
  assert(x.auth.lookupCalls + x.auth.createCalls + x.auth.recoveryCalls + x.auth.markerWrites === 0, 'admission denial makes zero provider calls');
}

// A completed correlation retry is state-aware: no regression and no provider work.
{
  const x = issue(); const first = await x.run();
  const counters = [x.repository.transitionCalls, x.auth.lookupCalls, x.auth.createCalls, x.auth.recoveryCalls, x.auth.markerWrites];
  const retry = await x.run();
  assert(first.state === 'EMAIL_CONFIRMATION_PENDING' && retry.state === first.state, 'exact pending retry returns authoritative state');
  assert([x.repository.transitionCalls, x.auth.lookupCalls, x.auth.createCalls, x.auth.recoveryCalls, x.auth.markerWrites].every((value, index) => value === counters[index]), 'pending retry makes no backward transition or provider call');
}

// Required marker fields compare independently of insertion order; every authority field is mandatory.
{
  const x = issue(); await x.run();
  const expected = x.auth.identity!.trustedMarker as TrustedOwnerMarker;
  const wanted = expected.pharmacyflow_owner_eligibility_v1;
  const reordered = {
    pharmacyflow_owner_eligibility_v1: {
      intended_input_fingerprint: wanted.intended_input_fingerprint,
      provider_operation_id: wanted.provider_operation_id,
      request_id: wanted.request_id,
      owner_contract_version: wanted.owner_contract_version,
      issuer_contract_version: wanted.issuer_contract_version,
    },
    unrelated_provider_field: 'preserved',
    pharmacyflow_identity_class: 'OWNER_ONBOARDING_V1',
  };
  assert(hasExactTrustedOwnerAuthority(reordered, expected), 'reordered equivalent trusted metadata is accepted');
  for (const altered of [
    { ...reordered, pharmacyflow_identity_class: 'STAFF_INVITATION_BOOTSTRAP_V1' },
    { ...reordered, pharmacyflow_owner_eligibility_v1: { ...reordered.pharmacyflow_owner_eligibility_v1, issuer_contract_version: 'wrong' } },
    { ...reordered, pharmacyflow_owner_eligibility_v1: { ...reordered.pharmacyflow_owner_eligibility_v1, owner_contract_version: 'wrong' } },
    { ...reordered, pharmacyflow_owner_eligibility_v1: { ...reordered.pharmacyflow_owner_eligibility_v1, request_id: 'wrong' } },
    { ...reordered, pharmacyflow_owner_eligibility_v1: { ...reordered.pharmacyflow_owner_eligibility_v1, provider_operation_id: 'wrong' } },
    { ...reordered, pharmacyflow_owner_eligibility_v1: { ...reordered.pharmacyflow_owner_eligibility_v1, intended_input_fingerprint: undefined } },
  ]) assert(!hasExactTrustedOwnerAuthority(altered, expected), 'altered or missing authority field is rejected');
}

// SQL-faithful first-reservation semantics: exact replay, typed changed-input and competing-email conflicts.
{
  const repository = new SqlFaithfulRepository();
  const fingerprint = await buildOwnerIntentFingerprint(base);
  const input = { requestId: base.requestId, normalizedEmail: base.email, pharmacyName: base.pharmacyName, currency: base.currency, intendedInputFingerprint: fingerprint };
  const first = await repository.reserveIfManuallyAdmitted(input);
  const exact = await repository.reserveIfManuallyAdmitted(input);
  assert(first.providerOperationId === exact.providerOperationId && exact.admissionEvidenceId === 'manual-ticket-1', 'exact reservation replay preserves operation and admission evidence');
  await rejects(() => repository.reserveIfManuallyAdmitted({ ...input, intendedInputFingerprint: 'f'.repeat(64) }), /REQUEST_CONFLICT/, 'same request with changed inputs conflicts');
  await rejects(() => repository.reserveIfManuallyAdmitted({ ...input, requestId: '550e8400-e29b-41d4-a716-446655440009' }), /OPEN_EMAIL_CONFLICT/, 'competing first request for open email has typed conflict');
}

// Lost reservation and provider responses restart through the same immutable operation.
{
  const x = issue(); x.repository.reserveResponseLossOnce = true;
  await rejects(x.run, /reservation response loss/, 'reservation response loss is observable');
  const recovered = await x.run();
  assert(recovered.providerOperationId === operationId && x.auth.createCalls === 1, 'restart after reservation response loss uses original operation');
}
{
  const x = issue(); x.auth.createResponseLoss = true;
  const recovered = await x.run();
  assert(recovered.providerOperationId === operationId && x.auth.createCalls === 1 && x.auth.recoveryCalls >= 1, 'provider response loss recovers only by operation ID');
}

// Correlation failure before commit can cross email confirmation only through authenticated recovery.
{
  const x = issue(); x.repository.correlateFailure = 'before';
  await rejects(x.run, /before commit/, 'post-provider correlation failure is preserved');
  x.auth.identity!.emailConfirmed = true;
  await rejects(x.run, /explicit authenticated recovery/, 'normal retry cannot continue a now-confirmed operation');
  assert(x.auth.lookupCalls === 1 && x.auth.createCalls === 1, 'restart does not recover confirmed identity by email or recreate it');
  const active = await recoverAuthenticatedOwnerEligibility(recoveryIntent, subjectId, { repository: x.repository, auth: x.auth });
  assert(active.state === 'ACTIVE' && x.repository.rows.get(base.requestId)?.subjectId === subjectId, 'authenticated exact-operation recovery correlates then activates');
}

// Correlation commit followed by response loss resumes from EMAIL_CONFIRMATION_PENDING without regression.
{
  const x = issue(); x.repository.correlateFailure = 'after';
  await rejects(x.run, /correlation response loss/, 'correlation response loss is observable');
  const transitionCalls = x.repository.transitionCalls; const providerCalls = x.auth.lookupCalls + x.auth.createCalls + x.auth.recoveryCalls + x.auth.markerWrites;
  const pending = await x.run();
  assert(pending.state === 'EMAIL_CONFIRMATION_PENDING' && x.repository.transitionCalls === transitionCalls, 'restart observes committed correlation without backward transition');
  assert(x.auth.lookupCalls + x.auth.createCalls + x.auth.recoveryCalls + x.auth.markerWrites === providerCalls, 'restart after correlation response loss makes no provider call');
}

// Existing confirmed/staff identities remain untouched; wrong operation recovery fails closed.
for (const identity of [
  { id: subjectId, email: base.email, emailConfirmed: true, identityClass: 'UNCLASSIFIED' as const },
  { id: subjectId, email: base.email, emailConfirmed: false, identityClass: 'STAFF_INVITATION_BOOTSTRAP_V1' as const },
]) {
  const x = issue(); x.auth.identity = identity;
  await rejects(x.run, /must sign in|Staff-bootstrap/, 'unrelated existing identity is not reclassified');
  assert(x.auth.createCalls === 0 && x.auth.markerWrites === 0, 'existing identity metadata is not overwritten');
}
{
  const x = issue(); x.auth.createResponseLoss = true; x.auth.recoverWrongOperation = true;
  await rejects(x.run, /not correlated/, 'wrong-operation ambiguity recovery fails closed');
}

// Stale snapshots and terminal states cannot revive or transition.
{
  const repository = new SqlFaithfulRepository(); const fingerprint = await buildOwnerIntentFingerprint(base);
  const stale = await repository.reserveIfManuallyAdmitted({ requestId: base.requestId, normalizedEmail: base.email, pharmacyName: base.pharmacyName, currency: base.currency, intendedInputFingerprint: fingerprint });
  repository.rows.get(base.requestId)!.state = 'REVOKED';
  await rejects(() => repository.markAuthCreatePending(bind(stale)), /INVALID_AUTH_PENDING_TRANSITION/, 'stale RESERVED snapshot cannot revive revoked row');
  const auth = new MemoryAuth();
  await rejects(() => issueOwnerEligibility(base, { repository, auth }), /terminal: REVOKED/, 'revoked retry is terminal without provider work');
  assert(auth.lookupCalls + auth.createCalls + auth.recoveryCalls === 0, 'terminal retry makes no provider calls');
}

// Exact ACTIVE and CONSUMED authenticated recovery are idempotent and subject-bound.
{
  const x = issue(); await x.run(); x.auth.identity!.emailConfirmed = true;
  const active = await recoverAuthenticatedOwnerEligibility(recoveryIntent, subjectId, { repository: x.repository, auth: x.auth });
  const providerCalls = x.auth.lookupCalls + x.auth.createCalls + x.auth.recoveryCalls + x.auth.authenticatedRecoveryCalls + x.auth.markerWrites;
  await rejects(x.run, /explicit authenticated recovery/, 'normal issue cannot disclose or continue ACTIVE state');
  assert(x.auth.lookupCalls + x.auth.createCalls + x.auth.recoveryCalls + x.auth.authenticatedRecoveryCalls + x.auth.markerWrites === providerCalls, 'unauthenticated ACTIVE retry makes no provider call');
  const activationCalls = x.repository.activateCalls;
  const activeReplay = await recoverAuthenticatedOwnerEligibility(recoveryIntent, subjectId, { repository: x.repository, auth: x.auth });
  assert(active.state === 'ACTIVE' && activeReplay.state === 'ACTIVE' && x.repository.activateCalls === activationCalls, 'exact ACTIVE recovery has no new transition');
  await rejects(() => recoverAuthenticatedOwnerEligibility(recoveryIntent, otherSubjectId, { repository: x.repository, auth: x.auth }), /immutable eligibility subject/, 'cross-subject authenticated recovery is denied');
  const row = x.repository.rows.get(base.requestId)!;
  row.state = 'CONSUMED'; row.consumedResponse = Object.freeze({ success: true, pharmacy_id: 'pharmacy-1' });
  await rejects(x.run, /explicit authenticated recovery/, 'normal issue cannot disclose or continue CONSUMED state');
  const consumed = await recoverAuthenticatedOwnerEligibility(recoveryIntent, subjectId, { repository: x.repository, auth: x.auth });
  assert(consumed.state === 'CONSUMED' && consumed.consumedResponse === row.consumedResponse, 'exact CONSUMED recovery returns immutable response without transition');
}

assert((await buildOwnerIntentFingerprint(base)).length === 64, 'canonical owner intent fingerprint is SHA-256');
console.log(`owner-eligibility-issuer correction injected tests: ${passed} passed`);
