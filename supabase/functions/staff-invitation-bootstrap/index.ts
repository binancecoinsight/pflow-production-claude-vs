export const STAFF_BOOTSTRAP_CONTRACT_VERSION = 'staff-invitation-bootstrap-v1' as const;
export type StaffRole = 'MANAGER' | 'PHARMACIST' | 'CASHIER';
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'REVOKED' | 'EXPIRED';

export interface StaffBootstrapRequest {
  requestId: string;
  invitationId: string;
  rawToken: string;
  email: string;
  password: string;
  fullName: string;
}

export interface ReservedInvitation {
  contractVersion: typeof STAFF_BOOTSTRAP_CONTRACT_VERSION;
  requestId: string;
  reservationId: string;
  providerOperationId: string;
  invitationId: string;
  pharmacyId: string;
  email: string;
  role: StaffRole | 'OWNER';
  status: InvitationStatus;
  requestFingerprint: string;
}

export interface AuthIdentity {
  id: string;
  email: string;
  emailConfirmed: boolean;
  bootstrapOperationId?: string;
}

export interface InvitationReservationProvider {
  reserve(input: Pick<StaffBootstrapRequest, 'requestId' | 'invitationId' | 'rawToken' | 'email'> & { requestFingerprint: string; contractVersion: typeof STAFF_BOOTSTRAP_CONTRACT_VERSION }): Promise<ReservedInvitation>;
  complete(reservationId: string, authUserId: string, providerOperationId: string): Promise<void>;
  deferToExistingIdentity(reservationId: string, authUserId: string): Promise<void>;
}

export interface StaffAuthProvider {
  findExistingByEmail(email: string): Promise<AuthIdentity | null>;
  createUnconfirmedUser(input: { email: string; password: string; fullName: string; providerOperationId: string }): Promise<AuthIdentity>;
  recoverByOperation(providerOperationId: string): Promise<AuthIdentity | null>;
  putTrustedBootstrapMarker(userId: string, providerOperationId: string, metadata: Record<string, unknown>): Promise<void>;
}

export interface StaffBootstrapDependencies {
  reservations: InvitationReservationProvider;
  auth: StaffAuthProvider;
}

export type StaffBootstrapResult =
  | {
      status: 'AUTH_RESERVED';
      authUserId: string;
      invitationId: string;
      pharmacyId: string;
      role: StaffRole;
      emailConfirmed: false;
    }
  | {
      status: 'SIGN_IN_REQUIRED';
      authUserId: string;
      invitationId: string;
      pharmacyId: string;
      role: StaffRole;
      emailConfirmed: true;
    };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const STAFF_ROLES: readonly string[] = ['MANAGER', 'PHARMACIST', 'CASHIER'];
const normalizedEmail = (value: string) => value.trim().toLowerCase();

const sha256 = async (value: string): Promise<string> => {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const buildStaffBootstrapFingerprint = async (request: StaffBootstrapRequest): Promise<string> => sha256([
  STAFF_BOOTSTRAP_CONTRACT_VERSION,
  request.requestId.trim().toLowerCase(),
  request.invitationId.trim().toLowerCase(),
  normalizedEmail(request.email),
  request.rawToken,
].join('\n'));

const validateReservation = (
  request: StaffBootstrapRequest,
  reservation: ReservedInvitation,
  expectedFingerprint: string,
) => {
  if (reservation.contractVersion !== STAFF_BOOTSTRAP_CONTRACT_VERSION ||
      reservation.requestId !== request.requestId.toLowerCase() ||
      reservation.invitationId !== request.invitationId.toLowerCase() ||
      !UUID_PATTERN.test(reservation.reservationId) ||
      !UUID_PATTERN.test(reservation.providerOperationId) ||
      !UUID_PATTERN.test(reservation.pharmacyId) ||
      !SHA256_PATTERN.test(reservation.requestFingerprint) ||
      reservation.requestFingerprint !== expectedFingerprint) {
    throw new Error('Reservation evidence does not match the immutable bootstrap request.');
  }
  if (reservation.status !== 'PENDING') throw new Error(`Invitation is not pending (${reservation.status}).`);
  if (!STAFF_ROLES.includes(reservation.role)) throw new Error('OWNER invitation bootstrap is prohibited.');
  if (normalizedEmail(reservation.email) !== normalizedEmail(request.email)) {
    throw new Error('Reservation recipient does not match the bootstrap request.');
  }
};

/**
 * Trusted contract only. No production providers are installed by this batch.
 * M-16 alone consumes invitations and assigns memberships. The marker is written
 * only after exact provider-operation correlation and before reservation completion;
 * both writes must be idempotent so a partial failure can retry the same operation.
 */
export async function bootstrapStaffIdentity(
  request: StaffBootstrapRequest,
  dependencies: StaffBootstrapDependencies,
): Promise<StaffBootstrapResult> {
  const normalizedRequest = {
    ...request,
    requestId: request.requestId.trim().toLowerCase(),
    invitationId: request.invitationId.trim().toLowerCase(),
    email: normalizedEmail(request.email),
  };
  if (!UUID_PATTERN.test(normalizedRequest.requestId) || !UUID_PATTERN.test(normalizedRequest.invitationId)) {
    throw new Error('Valid request and invitation IDs are required.');
  }
  if (!normalizedRequest.email || !request.rawToken || request.password.length < 6 || !request.fullName.trim()) {
    throw new Error('Complete staff bootstrap credentials are required.');
  }

  const requestFingerprint = await buildStaffBootstrapFingerprint(normalizedRequest);
  const reservation = await dependencies.reservations.reserve({
    requestId: normalizedRequest.requestId,
    invitationId: normalizedRequest.invitationId,
    rawToken: request.rawToken,
    email: normalizedRequest.email,
    requestFingerprint,
    contractVersion: STAFF_BOOTSTRAP_CONTRACT_VERSION,
  });
  validateReservation(normalizedRequest, reservation, requestFingerprint);

  let identity = await dependencies.auth.findExistingByEmail(normalizedRequest.email);
  if (identity?.emailConfirmed) {
    if (normalizedEmail(identity.email) !== normalizedRequest.email) throw new Error('Existing Auth identity is ambiguous.');
    await dependencies.reservations.deferToExistingIdentity(reservation.reservationId, identity.id);
    return {
      status: 'SIGN_IN_REQUIRED',
      authUserId: identity.id,
      invitationId: reservation.invitationId,
      pharmacyId: reservation.pharmacyId,
      role: reservation.role as StaffRole,
      emailConfirmed: true,
    };
  }

  if (identity && identity.bootstrapOperationId !== reservation.providerOperationId) {
    throw new Error('Existing unconfirmed identity is not correlated to this reservation operation.');
  }
  if (!identity) {
    try {
      identity = await dependencies.auth.createUnconfirmedUser({
        email: normalizedRequest.email,
        password: request.password,
        fullName: request.fullName.trim(),
        providerOperationId: reservation.providerOperationId,
      });
    } catch {
      identity = await dependencies.auth.recoverByOperation(reservation.providerOperationId);
      if (!identity) throw new Error('Auth identity creation is unavailable; bootstrap failed closed.');
    }
  }

  if (identity.emailConfirmed || normalizedEmail(identity.email) !== normalizedRequest.email ||
      identity.bootstrapOperationId !== reservation.providerOperationId) {
    throw new Error('Auth provider returned identity evidence not bound to this reservation operation.');
  }

  await dependencies.auth.putTrustedBootstrapMarker(identity.id, reservation.providerOperationId, {
    pharmacyflow_identity_class: 'STAFF_INVITATION_BOOTSTRAP_V1',
    pharmacyflow_staff_bootstrap_v1: {
      contract_version: STAFF_BOOTSTRAP_CONTRACT_VERSION,
      request_id: reservation.requestId,
      reservation_id: reservation.reservationId,
      provider_operation_id: reservation.providerOperationId,
      invitation_id: reservation.invitationId,
      pharmacy_id: reservation.pharmacyId,
      role: reservation.role,
      request_fingerprint: reservation.requestFingerprint,
    },
  });
  await dependencies.reservations.complete(
    reservation.reservationId,
    identity.id,
    reservation.providerOperationId,
  );

  return {
    status: 'AUTH_RESERVED',
    authUserId: identity.id,
    invitationId: reservation.invitationId,
    pharmacyId: reservation.pharmacyId,
    role: reservation.role as StaffRole,
    emailConfirmed: false,
  };
}
