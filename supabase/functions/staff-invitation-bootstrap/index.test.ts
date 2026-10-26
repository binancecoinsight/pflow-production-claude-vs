import {
  AuthIdentity,
  bootstrapStaffIdentity,
  buildStaffBootstrapFingerprint,
  InvitationReservationProvider,
  ReservedInvitation,
  STAFF_BOOTSTRAP_CONTRACT_VERSION,
  StaffAuthProvider,
  StaffBootstrapRequest,
} from './index';

let passed = 0;
function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
  passed += 1;
}

const request: StaffBootstrapRequest = {
  requestId: '550e8400-e29b-41d4-a716-446655440000',
  invitationId: '660e8400-e29b-41d4-a716-446655440001',
  rawToken: 'correct-token',
  email: 'staff@example.test',
  password: 'secret-password',
  fullName: 'Staff Person',
};

class MemoryReservations implements InvitationReservationProvider {
  completed: Array<{ reservationId: string; authUserId: string; providerOperationId: string }> = [];
  deferred: Array<{ reservationId: string; authUserId: string }> = [];
  failCompletionOnce = false;
  invitation!: ReservedInvitation;
  async reserve(input: Parameters<InvitationReservationProvider['reserve']>[0]) {
    if (input.rawToken !== request.rawToken) throw new Error('invalid token');
    return { ...this.invitation };
  }
  async complete(reservationId: string, authUserId: string, providerOperationId: string) {
    if (this.failCompletionOnce) {
      this.failCompletionOnce = false;
      throw new Error('synthetic completion failure');
    }
    this.completed.push({ reservationId, authUserId, providerOperationId });
  }
  async deferToExistingIdentity(reservationId: string, authUserId: string) {
    this.deferred.push({ reservationId, authUserId });
  }
}

const makeReservations = async () => {
  const reservations = new MemoryReservations();
  reservations.invitation = {
    contractVersion: STAFF_BOOTSTRAP_CONTRACT_VERSION,
    requestId: request.requestId,
    reservationId: '770e8400-e29b-41d4-a716-446655440002',
    providerOperationId: '780e8400-e29b-41d4-a716-446655440002',
    invitationId: request.invitationId,
    pharmacyId: '880e8400-e29b-41d4-a716-446655440003',
    email: request.email,
    role: 'PHARMACIST',
    status: 'PENDING',
    requestFingerprint: await buildStaffBootstrapFingerprint(request),
  };
  return reservations;
};

class MemoryAuth implements StaffAuthProvider {
  identities = new Map<string, AuthIdentity>();
  operations = new Map<string, AuthIdentity>();
  metadata = new Map<string, Record<string, unknown>>();
  ambiguousCreate = false;
  recoverWrongOperation = false;
  createCalls = 0;
  lookupCalls = 0;
  markerWrites = 0;
  async findExistingByEmail(email: string) { this.lookupCalls += 1; return this.identities.get(email) || null; }
  async createUnconfirmedUser(input: { email: string; password: string; fullName: string; providerOperationId: string }) {
    this.createCalls += 1;
    const identity = { id: `auth-${this.createCalls}`, email: input.email, emailConfirmed: false, bootstrapOperationId: input.providerOperationId };
    this.identities.set(input.email, identity);
    this.operations.set(input.providerOperationId, identity);
    if (this.ambiguousCreate) throw new Error('ambiguous provider response');
    return identity;
  }
  async recoverByOperation(providerOperationId: string) {
    if (this.recoverWrongOperation) return { id: 'wrong', email: request.email, emailConfirmed: false, bootstrapOperationId: '990e8400-e29b-41d4-a716-446655440004' };
    return this.operations.get(providerOperationId) || null;
  }
  async putTrustedBootstrapMarker(userId: string, providerOperationId: string, metadata: Record<string, unknown>) {
    const identity = Array.from(this.identities.values()).find((item) => item.id === userId);
    if (!identity || identity.bootstrapOperationId !== providerOperationId) throw new Error('marker correlation failure');
    const existing = this.metadata.get(userId);
    if (existing && JSON.stringify(existing) !== JSON.stringify(metadata)) throw new Error('immutable marker conflict');
    this.metadata.set(userId, metadata);
    this.markerWrites += 1;
  }
}

const reservations = await makeReservations();
const auth = new MemoryAuth();
const created = await bootstrapStaffIdentity(request, { reservations, auth });
assert(created.status === 'AUTH_RESERVED' && created.emailConfirmed === false, 'new-user path creates an unconfirmed Auth identity only');
assert(reservations.completed.length === 1, 'reservation completes after the trusted marker');
assert(auth.markerWrites === 1, 'trusted marker is written exactly before completion');
assert(auth.metadata.get(created.authUserId)?.pharmacyflow_identity_class === 'STAFF_INVITATION_BOOTSTRAP_V1', 'trusted marker distinguishes staff identity class');

const existingReservations = await makeReservations();
const existingAuth = new MemoryAuth();
existingAuth.identities.set(request.email, { id: 'existing-auth', email: request.email, emailConfirmed: true });
existingAuth.metadata.set('existing-auth', { existing: 'preserved' });
const existing = await bootstrapStaffIdentity(request, { reservations: existingReservations, auth: existingAuth });
assert(existing.status === 'SIGN_IN_REQUIRED' && existingAuth.createCalls === 0, 'confirmed existing identity must sign in and use M-16');
assert(JSON.stringify(existingAuth.metadata.get('existing-auth')) === JSON.stringify({ existing: 'preserved' }), 'existing confirmed identity metadata is not overwritten');
assert(existingReservations.deferred.length === 1 && existingReservations.completed.length === 0, 'existing identity reservation is deferred without invitation consumption');

const ambiguousReservations = await makeReservations();
const ambiguousAuth = new MemoryAuth();
ambiguousAuth.ambiguousCreate = true;
const recovered = await bootstrapStaffIdentity(request, { reservations: ambiguousReservations, auth: ambiguousAuth });
assert(recovered.status === 'AUTH_RESERVED' && recovered.authUserId === 'auth-1', 'ambiguous create recovers by exact provider operation');

const wrongCorrelationReservations = await makeReservations();
const wrongCorrelationAuth = new MemoryAuth();
wrongCorrelationAuth.ambiguousCreate = true;
wrongCorrelationAuth.recoverWrongOperation = true;
let correlationRejected = false;
try { await bootstrapStaffIdentity(request, { reservations: wrongCorrelationReservations, auth: wrongCorrelationAuth }); } catch { correlationRejected = true; }
assert(correlationRejected && wrongCorrelationReservations.completed.length === 0 && wrongCorrelationAuth.markerWrites === 0, 'ambiguous recovery with wrong operation correlation fails before marker/completion');

for (const mutate of [
  (row: ReservedInvitation) => { row.requestId = '990e8400-e29b-41d4-a716-446655440004'; },
  (row: ReservedInvitation) => { row.invitationId = '990e8400-e29b-41d4-a716-446655440004'; },
  (row: ReservedInvitation) => { row.pharmacyId = 'not-a-tenant'; },
  (row: ReservedInvitation) => { row.requestFingerprint = 'b'.repeat(64); },
  (row: ReservedInvitation) => { row.email = 'other@example.test'; },
] as const) {
  const mismatchedReservations = await makeReservations();
  mutate(mismatchedReservations.invitation);
  const mismatchedAuth = new MemoryAuth();
  let rejected = false;
  try { await bootstrapStaffIdentity(request, { reservations: mismatchedReservations, auth: mismatchedAuth }); } catch { rejected = true; }
  assert(rejected && mismatchedAuth.lookupCalls === 0 && mismatchedAuth.createCalls === 0, 'mismatched reservation evidence fails before all Auth work');
}

for (const status of ['EXPIRED', 'REVOKED', 'ACCEPTED'] as const) {
  const rejectedReservations = await makeReservations();
  rejectedReservations.invitation.status = status;
  const rejectedAuth = new MemoryAuth();
  let rejected = false;
  try { await bootstrapStaffIdentity(request, { reservations: rejectedReservations, auth: rejectedAuth }); } catch { rejected = true; }
  assert(rejected && rejectedAuth.lookupCalls === 0, `${status} invitation fails closed before Auth work`);
}

const ownerReservations = await makeReservations();
ownerReservations.invitation.role = 'OWNER';
const ownerAuth = new MemoryAuth();
let ownerRejected = false;
try { await bootstrapStaffIdentity(request, { reservations: ownerReservations, auth: ownerAuth }); } catch { ownerRejected = true; }
assert(ownerRejected && ownerAuth.lookupCalls === 0, 'OWNER invitation is rejected before Auth work');

const partialReservations = await makeReservations();
partialReservations.failCompletionOnce = true;
const partialAuth = new MemoryAuth();
let partialFailed = false;
try { await bootstrapStaffIdentity(request, { reservations: partialReservations, auth: partialAuth }); } catch { partialFailed = true; }
assert(partialFailed && partialAuth.metadata.size === 1 && partialReservations.completed.length === 0, 'partial failure preserves correlated marker and incomplete reservation for retry');
const partialRetry = await bootstrapStaffIdentity(request, { reservations: partialReservations, auth: partialAuth });
assert(partialRetry.status === 'AUTH_RESERVED' && partialAuth.createCalls === 1 && partialReservations.completed.length === 1, 'partial failure retries the same identity and operation without duplicate Auth creation');

console.log(`Staff invitation bootstrap tests: ${passed} passed`);
