export const ISSUER_CONTRACT_VERSION = 'owner-eligibility-issuer-v1' as const;
export const OWNER_CONTRACT_VERSION = 'owner-onboarding-v1' as const;
export type EligibilityState =
  | 'RESERVED'
  | 'AUTH_CREATE_PENDING'
  | 'EMAIL_CONFIRMATION_PENDING'
  | 'ACTIVE'
  | 'CONSUMED'
  | 'REVOKED'
  | 'CONFLICTED';

export interface OwnerEligibilityIntent {
  requestId: string;
  email: string;
  pharmacyName: string;
  currency: string;
}

export interface OwnerEligibilityRequest extends OwnerEligibilityIntent {
  password: string;
  fullName: string;
}

export interface OwnerEligibilityReservation {
  contractVersion: typeof ISSUER_CONTRACT_VERSION;
  ownerContractVersion: typeof OWNER_CONTRACT_VERSION;
  requestId: string;
  providerOperationId: string;
  intendedInputFingerprint: string;
  admissionPolicyVersion: 'closed-manual-v1';
  admissionEvidenceId: string;
  state: EligibilityState;
  subjectId?: string;
  consumedResponse?: Readonly<Record<string, unknown>>;
}

export interface TrustedOwnerMarker {
  pharmacyflow_identity_class: 'OWNER_ONBOARDING_V1';
  pharmacyflow_owner_eligibility_v1: {
    issuer_contract_version: typeof ISSUER_CONTRACT_VERSION;
    owner_contract_version: typeof OWNER_CONTRACT_VERSION;
    request_id: string;
    provider_operation_id: string;
    intended_input_fingerprint: string;
  };
}

export interface OwnerAuthIdentity {
  id: string;
  email: string;
  emailConfirmed: boolean;
  identityClass: 'OWNER_ONBOARDING_V1' | 'STAFF_INVITATION_BOOTSTRAP_V1' | 'UNCLASSIFIED';
  providerOperationId?: string;
  trustedMarker?: unknown;
}

export interface ReservationBinding {
  requestId: string;
  providerOperationId: string;
  intendedInputFingerprint: string;
}

export interface OwnerEligibilityRepository {
  reserveIfManuallyAdmitted(input: {
    requestId: string;
    normalizedEmail: string;
    pharmacyName: string;
    currency: string;
    intendedInputFingerprint: string;
  }): Promise<OwnerEligibilityReservation>;
  getExactReservation(binding: Pick<ReservationBinding, 'requestId' | 'intendedInputFingerprint'>): Promise<OwnerEligibilityReservation>;
  markAuthCreatePending(binding: ReservationBinding): Promise<OwnerEligibilityReservation>;
  correlateSubject(binding: ReservationBinding & { subjectId: string }): Promise<OwnerEligibilityReservation>;
  activate(binding: ReservationBinding & { subjectId: string }): Promise<OwnerEligibilityReservation>;
}

export interface OwnerIssuerAuthProvider {
  findExistingByEmail(normalizedEmail: string): Promise<OwnerAuthIdentity | null>;
  createUnconfirmedOwner(input: {
    normalizedEmail: string;
    password: string;
    fullName: string;
    providerOperationId: string;
    trustedMarker: TrustedOwnerMarker;
  }): Promise<OwnerAuthIdentity>;
  recoverByProviderOperation(providerOperationId: string): Promise<OwnerAuthIdentity | null>;
  recoverAuthenticatedByProviderOperation(input: {
    authenticatedSubjectId: string;
    providerOperationId: string;
  }): Promise<OwnerAuthIdentity | null>;
  putExactTrustedMarker(subjectId: string, providerOperationId: string, marker: TrustedOwnerMarker): Promise<void>;
}

export interface OwnerIssuerDependencies {
  repository: OwnerEligibilityRepository;
  auth: OwnerIssuerAuthProvider;
}

export interface OwnerEligibilityIssueResult {
  state: 'EMAIL_CONFIRMATION_PENDING' | 'ACTIVE' | 'CONSUMED';
  requestId: string;
  providerOperationId: string;
  subjectId: string;
  intendedInputFingerprint: string;
  consumedResponse?: Readonly<Record<string, unknown>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const EMAIL = /^[^@\s]+@[^@\s]+$/;

const sha256 = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

const normalizeOwnerIntent = (request: OwnerEligibilityIntent) => ({
  requestId: request.requestId.trim().toLowerCase(),
  normalizedEmail: request.email.trim().toLowerCase(),
  pharmacyName: request.pharmacyName.trim(),
  currency: request.currency.trim().toUpperCase(),
});

export const normalizeOwnerEligibilityInput = (request: OwnerEligibilityRequest) => ({
  ...normalizeOwnerIntent(request),
  fullName: request.fullName.trim(),
});

export const buildOwnerIntentFingerprint = async (request: OwnerEligibilityIntent): Promise<string> => {
  const normalized = normalizeOwnerIntent(request);
  return sha256([
    'PF-OWNER-INTENT-V1',
    normalized.requestId,
    normalized.normalizedEmail,
    normalized.pharmacyName,
    normalized.currency,
  ].join('\n'));
};

const buildMarker = (reservation: OwnerEligibilityReservation): TrustedOwnerMarker => ({
  pharmacyflow_identity_class: 'OWNER_ONBOARDING_V1',
  pharmacyflow_owner_eligibility_v1: {
    issuer_contract_version: ISSUER_CONTRACT_VERSION,
    owner_contract_version: OWNER_CONTRACT_VERSION,
    request_id: reservation.requestId,
    provider_operation_id: reservation.providerOperationId,
    intended_input_fingerprint: reservation.intendedInputFingerprint,
  },
});

const record = (value: unknown): Record<string, unknown> | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

/** Compare authority-bearing fields explicitly; object key order and unrelated metadata are irrelevant. */
export const hasExactTrustedOwnerAuthority = (actual: unknown, expected: TrustedOwnerMarker): boolean => {
  const outer = record(actual);
  const inner = record(outer?.pharmacyflow_owner_eligibility_v1);
  const wanted = expected.pharmacyflow_owner_eligibility_v1;
  return outer?.pharmacyflow_identity_class === expected.pharmacyflow_identity_class &&
    inner?.issuer_contract_version === wanted.issuer_contract_version &&
    inner?.owner_contract_version === wanted.owner_contract_version &&
    inner?.request_id === wanted.request_id &&
    inner?.provider_operation_id === wanted.provider_operation_id &&
    inner?.intended_input_fingerprint === wanted.intended_input_fingerprint;
};

const bindingOf = (reservation: OwnerEligibilityReservation): ReservationBinding => ({
  requestId: reservation.requestId,
  providerOperationId: reservation.providerOperationId,
  intendedInputFingerprint: reservation.intendedInputFingerprint,
});

const validateReservation = (
  reservation: OwnerEligibilityReservation,
  requestId: string,
  fingerprint: string,
) => {
  const validState = ['RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING', 'ACTIVE', 'CONSUMED', 'REVOKED', 'CONFLICTED'].includes(reservation.state);
  const subjectRequired = ['EMAIL_CONFIRMATION_PENDING', 'ACTIVE', 'CONSUMED'].includes(reservation.state);
  const subjectForbidden = ['RESERVED', 'AUTH_CREATE_PENDING'].includes(reservation.state);
  if (reservation.contractVersion !== ISSUER_CONTRACT_VERSION ||
      reservation.ownerContractVersion !== OWNER_CONTRACT_VERSION ||
      reservation.admissionPolicyVersion !== 'closed-manual-v1' ||
      !reservation.admissionEvidenceId.trim() ||
      reservation.requestId !== requestId ||
      !UUID.test(reservation.providerOperationId) ||
      !SHA256.test(reservation.intendedInputFingerprint) ||
      reservation.intendedInputFingerprint !== fingerprint ||
      !validState ||
      (subjectRequired && (!reservation.subjectId || !UUID.test(reservation.subjectId))) ||
      (subjectForbidden && reservation.subjectId !== undefined) ||
      (reservation.state === 'CONSUMED' && !reservation.consumedResponse)) {
    throw new Error('Authoritative eligibility reservation does not match its immutable request/state binding.');
  }
};

const validateIdentityAuthority = (
  identity: OwnerAuthIdentity,
  normalizedEmail: string,
  reservation: OwnerEligibilityReservation,
  marker: TrustedOwnerMarker,
) => {
  if (identity.email.trim().toLowerCase() !== normalizedEmail ||
      identity.identityClass !== 'OWNER_ONBOARDING_V1' ||
      identity.providerOperationId !== reservation.providerOperationId ||
      !hasExactTrustedOwnerAuthority(identity.trustedMarker, marker)) {
    throw new Error('Auth identity is not correlated to the authoritative issuer operation.');
  }
};

const resultOf = (reservation: OwnerEligibilityReservation): OwnerEligibilityIssueResult => {
  if (!['EMAIL_CONFIRMATION_PENDING', 'ACTIVE', 'CONSUMED'].includes(reservation.state) || !reservation.subjectId) {
    throw new Error('Eligibility is not ready for a client-visible continuation state.');
  }
  return {
    state: reservation.state as OwnerEligibilityIssueResult['state'],
    requestId: reservation.requestId,
    providerOperationId: reservation.providerOperationId,
    subjectId: reservation.subjectId,
    intendedInputFingerprint: reservation.intendedInputFingerprint,
    ...(reservation.consumedResponse ? { consumedResponse: reservation.consumedResponse } : {}),
  };
};

const validateRequest = (request: OwnerEligibilityRequest) => {
  const normalized = normalizeOwnerEligibilityInput(request);
  if (!UUID.test(normalized.requestId) || !EMAIL.test(normalized.normalizedEmail) ||
      normalized.pharmacyName.length < 2 || normalized.pharmacyName.length > 120 ||
      !/^[A-Z]{3}$/.test(normalized.currency) || normalized.fullName.length < 1 || request.password.length < 6) {
    throw new Error('Invalid owner eligibility request.');
  }
  return normalized;
};

const validateRecoveryIntent = (request: OwnerEligibilityIntent) => {
  const normalized = normalizeOwnerIntent(request);
  if (!UUID.test(normalized.requestId) || !EMAIL.test(normalized.normalizedEmail) ||
      normalized.pharmacyName.length < 2 || normalized.pharmacyName.length > 120 ||
      !/^[A-Z]{3}$/.test(normalized.currency)) {
    throw new Error('Invalid owner eligibility recovery intent.');
  }
  return normalized;
};

/**
 * Injected contract only. There is no server entry point, network client, environment adapter,
 * service-role fallback, or production provider in BLK-002-I1.
 */
export async function issueOwnerEligibility(
  request: OwnerEligibilityRequest,
  dependencies: OwnerIssuerDependencies,
): Promise<OwnerEligibilityIssueResult> {
  const normalized = validateRequest(request);
  const fingerprint = await buildOwnerIntentFingerprint(request);
  let reservation = await dependencies.repository.reserveIfManuallyAdmitted({
    requestId: normalized.requestId,
    normalizedEmail: normalized.normalizedEmail,
    pharmacyName: normalized.pharmacyName,
    currency: normalized.currency,
    intendedInputFingerprint: fingerprint,
  });
  validateReservation(reservation, normalized.requestId, fingerprint);

  if (['REVOKED', 'CONFLICTED'].includes(reservation.state)) throw new Error(`Eligibility is terminal: ${reservation.state}.`);
  if (reservation.state === 'EMAIL_CONFIRMATION_PENDING') return resultOf(reservation);
  if (['ACTIVE', 'CONSUMED'].includes(reservation.state)) throw new Error('ACTIVE/CONSUMED state requires explicit authenticated recovery.');

  const marker = buildMarker(reservation);
  let identity: OwnerAuthIdentity | null;
  if (reservation.state === 'RESERVED') {
    identity = await dependencies.auth.findExistingByEmail(normalized.normalizedEmail);
    if (identity?.emailConfirmed) throw new Error('Existing confirmed identity must sign in; it is not reclassified.');
    if (identity?.identityClass === 'STAFF_INVITATION_BOOTSTRAP_V1') throw new Error('Staff-bootstrap identity cannot receive OWNER eligibility.');
    if (identity && (identity.providerOperationId !== reservation.providerOperationId ||
        !hasExactTrustedOwnerAuthority(identity.trustedMarker, marker))) {
      throw new Error('Existing unconfirmed identity belongs to a different provider operation.');
    }
    reservation = await dependencies.repository.markAuthCreatePending(bindingOf(reservation));
    validateReservation(reservation, normalized.requestId, fingerprint);
    if (reservation.state !== 'AUTH_CREATE_PENDING') throw new Error('Repository returned an invalid Auth-pending transition.');
  } else {
    identity = null;
  }

  if (!identity) {
    if (reservation.state === 'AUTH_CREATE_PENDING') {
      identity = await dependencies.auth.recoverByProviderOperation(reservation.providerOperationId);
    }
    if (!identity) {
      try {
        identity = await dependencies.auth.createUnconfirmedOwner({
          normalizedEmail: normalized.normalizedEmail,
          password: request.password,
          fullName: normalized.fullName,
          providerOperationId: reservation.providerOperationId,
          trustedMarker: marker,
        });
      } catch {
        identity = await dependencies.auth.recoverByProviderOperation(reservation.providerOperationId);
        if (!identity) throw new Error('Auth creation is ambiguous and exact-operation recovery failed.');
      }
    }
  }
  validateIdentityAuthority(identity, normalized.normalizedEmail, reservation, marker);
  if (identity.emailConfirmed) throw new Error('Confirmed operation requires explicit authenticated recovery.');
  await dependencies.auth.putExactTrustedMarker(identity.id, reservation.providerOperationId, marker);
  reservation = await dependencies.repository.correlateSubject({ ...bindingOf(reservation), subjectId: identity.id });
  validateReservation(reservation, normalized.requestId, fingerprint);
  return resultOf(reservation);
}

/** Explicit post-confirmation continuation. The provider must authenticate this exact subject/operation. */
export async function recoverAuthenticatedOwnerEligibility(
  request: OwnerEligibilityIntent,
  authenticatedSubjectId: string,
  dependencies: OwnerIssuerDependencies,
): Promise<OwnerEligibilityIssueResult> {
  const normalized = validateRecoveryIntent(request);
  if (!UUID.test(authenticatedSubjectId)) throw new Error('Valid authenticated Auth subject is required.');
  const fingerprint = await buildOwnerIntentFingerprint(request);
  let reservation = await dependencies.repository.getExactReservation({
    requestId: normalized.requestId,
    intendedInputFingerprint: fingerprint,
  });
  validateReservation(reservation, normalized.requestId, fingerprint);
  if (['RESERVED', 'REVOKED', 'CONFLICTED'].includes(reservation.state)) {
    throw new Error(`Eligibility cannot be recovered from state ${reservation.state}.`);
  }
  if (reservation.subjectId && reservation.subjectId !== authenticatedSubjectId) {
    throw new Error('Authenticated subject does not match immutable eligibility subject.');
  }

  const identity = await dependencies.auth.recoverAuthenticatedByProviderOperation({
    authenticatedSubjectId,
    providerOperationId: reservation.providerOperationId,
  });
  const marker = buildMarker(reservation);
  if (!identity || identity.id !== authenticatedSubjectId || !identity.emailConfirmed) {
    throw new Error('Confirmed exact-operation Auth recovery failed.');
  }
  validateIdentityAuthority(identity, normalized.normalizedEmail, reservation, marker);

  if (reservation.state === 'AUTH_CREATE_PENDING') {
    reservation = await dependencies.repository.correlateSubject({ ...bindingOf(reservation), subjectId: authenticatedSubjectId });
    validateReservation(reservation, normalized.requestId, fingerprint);
  }
  if (reservation.state === 'EMAIL_CONFIRMATION_PENDING') {
    reservation = await dependencies.repository.activate({ ...bindingOf(reservation), subjectId: authenticatedSubjectId });
    validateReservation(reservation, normalized.requestId, fingerprint);
  }
  return resultOf(reservation);
}
