import { AmbiguousOutcomeError, I3_CONTRACT_VERSION, commandFingerprint, commandIdentity, sha256Text, type GatewayAuthority, type GatewayCapability, type OperationIdentity, type PresentedCredential, type VerifiedPrincipal } from '../_shared/owner-security-i3';
import { issueOwnerIdentity, recoverIssuedIdentity, recoverReservedEligibility, reserveOwnerEligibility, type IdentityResult, type IssuanceAttempt, type IssueIdentityCommand, type OwnerGatewayRepository, type OwnerIdentityProvider, type ProviderIdentity, type ProviderRecovery, type ReservationResult, type ReserveEligibilityCommand } from './index';

let passed = 0;
const ok = (v: unknown, m: string) => { if (!v) throw new Error(`FAIL: ${m}`); passed++; };
const rejects = async (f: () => Promise<unknown>, p: RegExp, m: string) => { try { await f(); } catch (e) { ok(p.test(e instanceof Error ? e.message : String(e)), m); return; } throw new Error(`FAIL: ${m}`); };
const U = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const same = (a: OperationIdentity, b: OperationIdentity) => JSON.stringify(a) === JSON.stringify(b);

class Authority implements GatewayAuthority {
  rows = new Map<string, { p: VerifiedPrincipal; active: boolean; version: number; caps: Set<GatewayCapability> }>();
  async requireGateway(c: PresentedCredential, cap: GatewayCapability) { const r = this.rows.get(c.opaque); if (!r?.active || r.p.credentialVersion !== r.version || !r.caps.has(cap)) throw new Error('GATEWAY_AUTHORITY_DENIED'); return { ...r.p }; }
}
class Repo implements OwnerGatewayRepository {
  operations = new Map<string, { i: OperationIdentity; result: unknown }>(); attempts = new Map<string, IssuanceAttempt>(); reservations = new Map<string, ReservationResult>(); events: string[] = [];
  failCompleteResponse = false; revoked = false; beginCalls = 0;
  prior<T>(i: OperationIdentity): T | null { const r = this.operations.get(i.operationId); if (!r) return null; if (!same(r.i, i)) throw new Error(r.i.action === i.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH'); return r.result as T; }
  rejectPending(i: OperationIdentity): void { const a = this.attempts.get(i.operationId); if (a) throw new Error(a.identity.action === i.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH'); }
  async reserveAtomic(i: OperationIdentity, c: ReserveEligibilityCommand) { this.rejectPending(i); const p = this.prior<ReservationResult>(i); if (p) return { outcome: 'REPLAY' as const, result: p }; if (this.reservations.has(c.requestId)) throw new Error('REQUEST_ALREADY_BOUND'); const result = { requestId: c.requestId, eligibilityId: c.requestId, providerOperationId: U(600 + this.reservations.size), applicantKey: c.context.applicantKey, pharmacyContextId: c.context.pharmacyContextId, state: 'RESERVED' as const, admissionDecisionId: c.admissionDecisionId, intendedInputFingerprint: await commandFingerprint([c.requestId, c.normalizedEmail.trim().toLowerCase(), c.pharmacyName.trim(), c.currency.trim().toUpperCase()]) }; this.reservations.set(c.requestId, result); this.operations.set(i.operationId, { i: { ...i }, result }); return { outcome: 'APPLIED' as const, result }; }
  async beginIssuanceAtomic(i: OperationIdentity, c: IssueIdentityCommand) { this.events.push('begin'); this.beginCalls++; const completed = this.operations.get(i.operationId); if (completed) { if (!same(completed.i, i)) throw new Error(completed.i.action === i.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH'); return { outcome: 'REPLAY' as const, result: { state: 'COMPLETED' as const, identity: { ...i }, providerOperationId: c.providerOperationId, result: completed.result as IdentityResult } }; } const old = this.attempts.get(i.operationId); if (old) { if (!same(old.identity, i)) throw new Error(old.identity.action === i.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH'); return { outcome: 'REPLAY' as const, result: old }; } const r = this.reservations.get(c.requestId); if (!r || this.revoked || r.state !== 'RESERVED' || r.eligibilityId !== c.eligibilityId || r.providerOperationId !== c.providerOperationId || r.applicantKey !== c.context.applicantKey || r.pharmacyContextId !== c.context.pharmacyContextId || r.intendedInputFingerprint !== c.intendedInputFingerprint) throw new Error('AUTHORITATIVE_RESERVATION_CONFLICT'); const a: IssuanceAttempt = { state: 'PROVIDER_PENDING', identity: { ...i }, providerOperationId: c.providerOperationId }; this.attempts.set(i.operationId, a); return { outcome: 'APPLIED' as const, result: a }; }
  async completeIssuanceAtomic(i: OperationIdentity, c: IssueIdentityCommand, p: ProviderIdentity) { this.events.push('complete'); const old = this.prior<IdentityResult>(i); if (old) return { outcome: 'REPLAY' as const, result: old }; const a = this.attempts.get(i.operationId); if (!a || this.revoked || a.state !== 'PROVIDER_PENDING') throw new Error('ATTEMPT_NOT_COMPLETABLE'); const result: IdentityResult = { requestId: c.requestId, eligibilityId: c.eligibilityId, providerOperationId: p.providerOperationId, subjectId: p.subjectId, applicantKey: c.context.applicantKey, pharmacyContextId: c.context.pharmacyContextId, state: 'EMAIL_CONFIRMATION_PENDING' }; this.operations.set(i.operationId, { i: { ...i }, result }); this.attempts.set(i.operationId, { ...a, state: 'COMPLETED', result }); if (this.failCompleteResponse) { this.failCompleteResponse = false; throw new AmbiguousOutcomeError(); } return { outcome: 'APPLIED' as const, result }; }
  async completeIssuanceRecoveryAtomic(i: OperationIdentity, c: IssueIdentityCommand, p: ProviderIdentity) { this.events.push('complete-recovery'); return this.completeIssuanceAtomic(i, c, p); }
  async recoverExact<T>(i: OperationIdentity) { return this.prior<T>(i); }
  async recoverIssuanceAttempt(i: OperationIdentity) { const a = this.attempts.get(i.operationId); if (a && !same(a.identity, i)) throw new Error('OPERATION_CONFLICT'); return a ?? null; }
}
class Provider implements OwnerIdentityProvider {
  rows = new Map<string, ProviderIdentity>(); events: string[]; creates = 0; recovery: 'AUTO'|'UNKNOWN'|'ABSENT' = 'AUTO'; loseCreate = false; existing: ProviderIdentity|null = null;
  constructor(events: string[]) { this.events = events; }
  marker(input: Parameters<OwnerIdentityProvider['createUnconfirmedOwner']>[0]): ProviderIdentity { return { subjectId: U(7), providerOperationId: input.providerOperationId, normalizedEmail: input.normalizedEmail, emailConfirmed: false, identityClass: 'OWNER_ONBOARDING_V1', trustedOwnerMarker: input.trustedOwnerMarker }; }
  async inspectExistingByEmail() { this.events.push('inspect'); return this.existing; }
  async createUnconfirmedOwner(input: Parameters<OwnerIdentityProvider['createUnconfirmedOwner']>[0]) { this.events.push('create'); this.creates++; const p = this.marker(input); this.rows.set(input.providerOperationId, p); if (this.loseCreate) { this.loseCreate = false; throw new AmbiguousOutcomeError(); } return p; }
  async recoverExact(id: string): Promise<ProviderRecovery> { this.events.push('recover'); if (this.recovery === 'UNKNOWN') return { outcome: 'UNKNOWN' }; if (this.recovery === 'ABSENT') return { outcome: 'PROVEN_ABSENT' }; const p = this.rows.get(id); return p ? { outcome: 'FOUND', identity: p } : { outcome: 'UNKNOWN' }; }
}

const authority = new Authority(); const caps = new Set<GatewayCapability>(['ELIGIBILITY_RESERVE','IDENTITY_ISSUE','IDENTITY_RECOVER']);
authority.rows.set('v1', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps });
authority.rows.set('issue-only', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps: new Set(['IDENTITY_ISSUE']) });
authority.rows.set('recovery-only', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps: new Set(['IDENTITY_RECOVER']) });
authority.rows.set('underprivileged', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps: new Set() });
authority.rows.set('revoked', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: false, version: 1, caps });
authority.rows.set('other-principal', { p: { principalId: 'gateway-2', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps });
const repo = new Repo(); const provider = new Provider(repo.events); const d = { authority, repository: repo, provider };
const key = await sha256Text('owner@example.com'); const ctx = (op: number) => ({ operationId: U(op), applicantKey: key, pharmacyContextId: U(3), contractVersion: I3_CONTRACT_VERSION });
const reserve: ReserveEligibilityCommand = { context: ctx(1), requestId: U(2), normalizedEmail: ' Owner@Example.com ', pharmacyName: 'Main Pharmacy', currency: 'ngn', admissionDecisionId: U(4) };
const rr = await reserveOwnerEligibility({ opaque: 'v1' }, reserve, d); ok(rr.outcome === 'APPLIED', 'reservation applies');
const freshIssue = async (n: number): Promise<IssueIdentityCommand> => {
  const rc: ReserveEligibilityCommand = { ...reserve, context: ctx(100 + n), requestId: U(200 + n) };
  const result = (await reserveOwnerEligibility({ opaque: authority.rows.has('v2') ? 'v2' : 'v1' }, rc, d)).result;
  return { context: ctx(n), requestId: result.requestId, eligibilityId: result.eligibilityId, providerOperationId: result.providerOperationId, intendedInputFingerprint: result.intendedInputFingerprint, normalizedEmail: 'owner@example.com', fullName: 'Owner One' };
};
const issue: IssueIdentityCommand = { context: ctx(10), requestId: rr.result.requestId, eligibilityId: rr.result.eligibilityId, providerOperationId: rr.result.providerOperationId, intendedInputFingerprint: rr.result.intendedInputFingerprint, normalizedEmail: 'owner@example.com', fullName: 'Owner One' };
const issued = await issueOwnerIdentity({ opaque: 'v1' }, issue, d); ok(issued.outcome === 'APPLIED' && repo.events.join(',') === 'begin,inspect,create,complete', 'durable attempt precedes every provider effect');
ok((await issueOwnerIdentity({ opaque: 'v1' }, issue, d)).outcome === 'REPLAY' && provider.creates === 1, 'completed exact replay is effect-free');
await rejects(() => issueOwnerIdentity({ opaque: 'v1' }, { ...issue, fullName: 'Changed' }, d), /OPERATION_CONFLICT/, 'changed typed argument conflicts despite same operation');

const issue2 = await freshIssue(11); repo.failCompleteResponse = true; const lostDb = await issueOwnerIdentity({ opaque: 'v1' }, issue2, d); ok(lostDb.outcome === 'REPLAY', 'lost database response recovers committed canonical result');
const issue3 = await freshIssue(12); provider.loseCreate = true; const lostProvider = await issueOwnerIdentity({ opaque: 'v1' }, issue3, d); ok(lostProvider.result.subjectId === U(7), 'lost provider response resolves exact original operation');
const issue4 = await freshIssue(13); provider.recovery = 'UNKNOWN'; repo.attempts.set(issue4.context.operationId, { state: 'PROVIDER_PENDING', identity: await commandIdentity({ principalId:'gateway-1',kind:'GATEWAY',credentialVersion:1 }, 'IDENTITY_ISSUE', issue4.context, [issue4.requestId,issue4.eligibilityId,issue4.providerOperationId,issue4.intendedInputFingerprint,'owner@example.com','Owner One']), providerOperationId: issue4.providerOperationId }); const before = provider.creates; await rejects(() => issueOwnerIdentity({ opaque:'v1' }, issue4, d), /ISSUANCE_RECOVERY_PENDING/, 'restart with uncertain outcome never blind creates'); ok(provider.creates === before, 'uncertain restart made no create');
await rejects(() => recoverIssuedIdentity({ opaque:'v1' }, issue4, d), /ISSUANCE_RECOVERY_PENDING/, 'explicit recovery also fails closed on uncertainty');
const pendingCalls = provider.creates;
await rejects(() => issueOwnerIdentity({ opaque:'v1' }, { ...issue4, fullName:'Changed Pending' }, d), /OPERATION_CONFLICT/, 'changed command collides with pending attempt before provider work');
await rejects(() => issueOwnerIdentity({ opaque:'other-principal' }, issue4, d), /OPERATION_CONFLICT/, 'cross-principal pending collision fails before provider work');
ok(provider.creates === pendingCalls, 'pending command and principal collisions make no provider calls');

const completedCollision = await freshIssue(20); const completedCollisionCalls = provider.creates;
await rejects(() => issueOwnerIdentity({ opaque:'v1' }, { ...completedCollision, context: ctx(1) }, d), /ACTION_MISMATCH/, 'completed non-issuance operation claims ID before issuance');
ok(provider.creates === completedCollisionCalls, 'completed-operation collision is rejected before provider work');
const pendingCollision = await freshIssue(21); repo.attempts.set(pendingCollision.context.operationId, { state:'PROVIDER_PENDING', identity: await commandIdentity({ principalId:'gateway-1',kind:'GATEWAY',credentialVersion:1 }, 'IDENTITY_ISSUE', pendingCollision.context, [pendingCollision.requestId,pendingCollision.eligibilityId,pendingCollision.providerOperationId,pendingCollision.intendedInputFingerprint,'owner@example.com','Owner One']), providerOperationId:pendingCollision.providerOperationId });
await rejects(() => reserveOwnerEligibility({ opaque:'v1' }, { ...reserve, context:{ ...reserve.context, operationId:pendingCollision.context.operationId }, requestId:U(888) }, d), /ACTION_MISMATCH/, 'pending issuance operation ID cannot be claimed by another command');

const recoveryIssue = await freshIssue(18); provider.existing = null; provider.loseCreate = true; provider.recovery = 'UNKNOWN';
await rejects(() => issueOwnerIdentity({ opaque:'issue-only' }, recoveryIssue, d), /ISSUANCE_RECOVERY_PENDING/, 'issue-only authority may leave a durable pending attempt after response loss');
const recoveryCreateCount = provider.creates;
await rejects(() => issueOwnerIdentity({ opaque:'recovery-only' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'recovery-only authority cannot invoke issuance or create');
await rejects(() => recoverIssuedIdentity({ opaque:'issue-only' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'issue-only authority cannot recover pending issuance');
await rejects(() => recoverIssuedIdentity({ opaque:'underprivileged' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'underprivileged credential cannot recover pending issuance');
await rejects(() => recoverIssuedIdentity({ opaque:'revoked' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'revoked credential cannot recover pending issuance');
provider.recovery = 'AUTO'; const recoveredByRecoveryOnly = await recoverIssuedIdentity({ opaque:'recovery-only' }, recoveryIssue, d);
ok(recoveredByRecoveryOnly.providerOperationId === recoveryIssue.providerOperationId && provider.creates === recoveryCreateCount, 'recovery-only authority finalizes exact pending attempt without creation');
const recoverCallsBeforeReplay = provider.events.filter((event) => event === 'recover').length;
ok((await recoverIssuedIdentity({ opaque:'recovery-only' }, recoveryIssue, d)).subjectId === recoveredByRecoveryOnly.subjectId && provider.events.filter((event) => event === 'recover').length === recoverCallsBeforeReplay, 'recovery-only exact completed replay is provider-effect free');

provider.recovery = 'AUTO'; const concurrentIssue = await freshIssue(17); const createsBeforeRace = provider.creates;
const concurrent = await Promise.allSettled([issueOwnerIdentity({ opaque:'v1' }, concurrentIssue, d), issueOwnerIdentity({ opaque:'v1' }, concurrentIssue, d)]);
ok(concurrent.some((x) => x.status === 'fulfilled') && concurrent.every((x) => x.status === 'fulfilled' || /ISSUANCE_RECOVERY_PENDING/.test(String(x.reason))), 'concurrent duplicate either exactly recovers or remains pending');
ok(provider.creates === createsBeforeRace + 1, 'concurrent duplicate performs exactly one provider create');

const rotatedPending = await freshIssue(22); provider.loseCreate = true; provider.recovery = 'UNKNOWN';
await rejects(() => issueOwnerIdentity({ opaque:'v1' }, rotatedPending, d), /ISSUANCE_RECOVERY_PENDING/, 'pending attempt survives credential rotation boundary');

authority.rows.set('v1', { p: { principalId:'gateway-1',kind:'GATEWAY',credentialVersion:1 }, active:false,version:2,caps }); authority.rows.set('v2', { p: { principalId:'gateway-1',kind:'GATEWAY',credentialVersion:2 }, active:true,version:2,caps });
ok((await recoverReservedEligibility({ opaque:'v2' }, reserve, d)).requestId === reserve.requestId, 'rotation preserves stable operation identity');
await rejects(() => recoverReservedEligibility({ opaque:'v1' }, reserve, d), /GATEWAY_AUTHORITY_DENIED/, 'stale credential cannot recover');
provider.recovery = 'AUTO'; ok((await recoverIssuedIdentity({ opaque:'v2' }, rotatedPending, d)).providerOperationId === rotatedPending.providerOperationId, 'rotated current credential finalizes stable-principal pending attempt');
await rejects(() => issueOwnerIdentity({ opaque:'v2' }, { ...issue, context: { ...issue.context, operationId:'bad' } }, d), /INVALID_OPERATION_ID/, 'malformed id rejected before effects');
const issue5 = await freshIssue(14); repo.revoked = true; await rejects(() => issueOwnerIdentity({ opaque:'v2' }, issue5, d), /AUTHORITATIVE_RESERVATION_CONFLICT/, 'revoked reservation rejected before provider');
repo.revoked = false; const staffIssue = await freshIssue(15); provider.existing = { ...provider.marker({ providerOperationId: staffIssue.providerOperationId, normalizedEmail:'owner@example.com', fullName:'Owner One', trustedOwnerMarker:{ contractVersion:'owner-onboarding-v1',requestId:staffIssue.requestId,providerOperationId:staffIssue.providerOperationId,intendedInputFingerprint:staffIssue.intendedInputFingerprint } }), identityClass:'STAFF_INVITATION_BOOTSTRAP_V1' }; await rejects(() => issueOwnerIdentity({ opaque:'v2' }, staffIssue, d), /STAFF_IDENTITY_PROTECTED/, 'staff identity is never adopted');
const confirmedIssue = await freshIssue(16); provider.existing = { ...provider.marker({ providerOperationId: confirmedIssue.providerOperationId, normalizedEmail:'owner@example.com', fullName:'Owner One', trustedOwnerMarker:{ contractVersion:'owner-onboarding-v1',requestId:confirmedIssue.requestId,providerOperationId:confirmedIssue.providerOperationId,intendedInputFingerprint:confirmedIssue.intendedInputFingerprint } }), emailConfirmed:true }; await rejects(() => issueOwnerIdentity({ opaque:'v2' }, confirmedIssue, d), /AUTHENTICATED_CONTINUATION_REQUIRED/, 'confirmed account requires authenticated continuation');
ok(Object.isFrozen(issued.result), 'canonical result is immutable');
console.log(`BLK-002-I3 corrected gateway injected tests: ${passed} passed`);
