import { AmbiguousOutcomeError, I3_CONTRACT_VERSION, commandFingerprint, commandIdentity, sha256Text, type GatewayAuthority, type GatewayAuthorizationScope, type GatewayCapability, type OperationIdentity, type PresentedCredential, type VerifiedPrincipal } from '../_shared/owner-security-i3';
import { issueOwnerIdentity, recoverIssuedIdentity, recoverReservedEligibility, reserveOwnerEligibility, type IdentityResult, type IssuanceAttempt, type IssuanceExecution, type IssuanceLookup, type IssueIdentityCommand, type OwnerGatewayRepository, type OwnerIdentityProvider, type ProviderIdentity, type ProviderRecovery, type ReservationResult, type ReserveEligibilityCommand } from './index';

let passed = 0;
const ok = (v: unknown, m: string) => { if (!v) throw new Error(`FAIL: ${m}`); passed++; };
const rejects = async (f: () => Promise<unknown>, p: RegExp, m: string) => { try { await f(); } catch (e) { ok(p.test(e instanceof Error ? e.message : String(e)), m); return; } throw new Error(`FAIL: ${m}`); };
const U = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const same = (a: OperationIdentity, b: OperationIdentity) => JSON.stringify(a) === JSON.stringify(b);

class Authority implements GatewayAuthority {
  rows = new Map<string, { p: VerifiedPrincipal; active: boolean; version: number; caps: Set<GatewayCapability>; scopes?: Map<string, boolean> }>();
  calls: Array<{ token: string; cap: GatewayCapability; scope: GatewayAuthorizationScope }> = [];
  scopeKey(cap: GatewayCapability, scope: GatewayAuthorizationScope) { return `${cap}:${scope.applicantKey}:${scope.pharmacyContextId}`; }
  row(c: PresentedCredential, cap: GatewayCapability) { const r=this.rows.get(c.opaque); if(!r?.active || r.p.credentialVersion!==r.version || !r.caps.has(cap))throw new Error('GATEWAY_AUTHORITY_DENIED'); return r; }
  async requireGateway(c: PresentedCredential, cap: GatewayCapability) { return {...this.row(c,cap).p}; }
  async requireGatewayForContext(c: PresentedCredential, cap: GatewayCapability, scope: GatewayAuthorizationScope) { const r=this.row(c,cap); this.calls.push({ token:c.opaque,cap,scope:{...scope} }); if (r.scopes?.get(this.scopeKey(cap,scope)) !== true) throw new Error('GATEWAY_AUTHORITY_DENIED'); return { ...r.p }; }
}
class Repo implements OwnerGatewayRepository {
  operations = new Map<string, { i: OperationIdentity; result: unknown }>(); attempts = new Map<string, IssuanceAttempt>(); reservations = new Map<string, ReservationResult>(); events: string[] = [];
  phaseAudit: Array<{ phase: string; actor: VerifiedPrincipal; original: OperationIdentity; originalCredentialVersion: number }> = [];
  failCompleteResponse = false; failAudit = false; revoked = false; beginCalls = 0; afterBegin?: () => void; duringComplete?: () => void;
  copyCommand(c: IssueIdentityCommand): IssueIdentityCommand { return { ...c, context: { ...c.context } }; }
  prior<T>(i: OperationIdentity): T | null { const r = this.operations.get(i.operationId); if (!r) return null; if (!same(r.i, i)) throw new Error(r.i.action === i.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH'); return r.result as T; }
  rejectPending(i: OperationIdentity): void { const a = this.attempts.get(i.operationId); if (a) throw new Error(a.originalIdentity.action === i.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH'); }
  boundAttempt(l: IssuanceLookup): IssuanceAttempt | null { const a=this.attempts.get(l.operationId); if (!a) return null; if (!a.originalCredentialVersion || !a.authoritativeCommand || a.originalIdentity.action !== 'IDENTITY_ISSUE') throw new Error('LEGACY_ISSUANCE_PROVENANCE_INCOMPLETE'); if (a.originalIdentity.applicantKey !== l.applicantKey || a.originalIdentity.pharmacyContextId !== l.pharmacyContextId) throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND'); return a; }
  assertRoutePrincipal(execution: IssuanceExecution, attempt: IssuanceAttempt): void { if(execution.capability==='IDENTITY_ISSUE' && execution.actor.principalId!==attempt.originalIdentity.principalId)throw new Error('ORIGINAL_ISSUE_PRINCIPAL_REQUIRED'); }
  phase(execution: IssuanceExecution, lookup: IssuanceLookup, phase: string): IssuanceAttempt { const a=this.boundAttempt(lookup); if (!a) throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND'); this.assertRoutePrincipal(execution,a); this.phaseAudit.push({phase,actor:{...execution.actor},original:{...a.originalIdentity},originalCredentialVersion:a.originalCredentialVersion}); return a; }
  async reserveAtomic(i: OperationIdentity, c: ReserveEligibilityCommand) { this.rejectPending(i); const p = this.prior<ReservationResult>(i); if (p) return { outcome: 'REPLAY' as const, result: p }; if (this.reservations.has(c.requestId)) throw new Error('REQUEST_ALREADY_BOUND'); const result = { requestId: c.requestId, eligibilityId: c.requestId, providerOperationId: U(600 + this.reservations.size), applicantKey: c.context.applicantKey, pharmacyContextId: c.context.pharmacyContextId, state: 'RESERVED' as const, admissionDecisionId: c.admissionDecisionId, intendedInputFingerprint: await commandFingerprint([c.requestId, c.normalizedEmail.trim().toLowerCase(), c.pharmacyName.trim(), c.currency.trim().toUpperCase()]) }; this.reservations.set(c.requestId, result); this.operations.set(i.operationId, { i: { ...i }, result }); return { outcome: 'APPLIED' as const, result }; }
  async beginIssuanceAtomic(i: OperationIdentity, originalCredentialVersion: number, c: IssueIdentityCommand) { this.events.push('begin'); this.beginCalls++; const completed = this.operations.get(i.operationId); if (completed) { if (!same(completed.i, i)) throw new Error(completed.i.action === i.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH'); const a=this.boundAttempt({operationId:i.operationId,applicantKey:i.applicantKey,pharmacyContextId:i.pharmacyContextId}); if (!a) throw new Error('LEGACY_ISSUANCE_PROVENANCE_INCOMPLETE'); return { outcome: 'REPLAY' as const, result: { ...a, state: 'COMPLETED' as const, result: completed.result as IdentityResult } }; } const old = this.attempts.get(i.operationId); if (old) { if (!same(old.originalIdentity, i)) throw new Error(old.originalIdentity.action === i.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH'); return { outcome: 'REPLAY' as const, result: old }; } const r = this.reservations.get(c.requestId); if (!r || this.revoked || r.state !== 'RESERVED' || r.eligibilityId !== c.eligibilityId || r.providerOperationId !== c.providerOperationId || r.applicantKey !== c.context.applicantKey || r.pharmacyContextId !== c.context.pharmacyContextId || r.intendedInputFingerprint !== c.intendedInputFingerprint) throw new Error('AUTHORITATIVE_RESERVATION_CONFLICT'); const a: IssuanceAttempt = { state: 'PROVIDER_PENDING', originalIdentity: { ...i }, originalCredentialVersion, providerOperationId: c.providerOperationId, authoritativeCommand:this.copyCommand(c) }; this.attempts.set(i.operationId, a); this.afterBegin?.(); this.afterBegin=undefined; return { outcome: 'APPLIED' as const, result: a }; }
  async authorizeProviderDispatchAtomic(e: IssuanceExecution, l: IssuanceLookup) { if(e.capability!=='IDENTITY_ISSUE') throw new Error('GATEWAY_AUTHORITY_DENIED'); const a=this.boundAttempt(l); if(!a)throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND'); this.assertRoutePrincipal(e,a); if(a.state!=='PROVIDER_PENDING')throw new Error('ISSUANCE_NOT_PENDING'); return this.phase(e,l,'PROVIDER_DISPATCH'); }
  async authorizeProviderResolutionAtomic(e: IssuanceExecution, l: IssuanceLookup) { if(e.capability!=='IDENTITY_RECOVER') throw new Error('GATEWAY_AUTHORITY_DENIED'); const a=this.boundAttempt(l); if(!a)throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND'); if(a.state!=='PROVIDER_PENDING')throw new Error('ISSUANCE_NOT_PENDING'); return this.phase(e,l,'PROVIDER_RESOLUTION'); }
  async completeIssuanceAtomic(e: IssuanceExecution, l: IssuanceLookup, p: ProviderIdentity) { return this.complete(e,l,p,'COMPLETE_ISSUE'); }
  async completeIssuanceRecoveryAtomic(e: IssuanceExecution, l: IssuanceLookup, p: ProviderIdentity) { this.events.push('complete-recovery'); return this.complete(e,l,p,'COMPLETE_RECOVERY'); }
  async complete(e: IssuanceExecution, l: IssuanceLookup, p: ProviderIdentity, phase: string) { this.events.push('complete'); const a=this.boundAttempt(l); if (!a) throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND'); this.assertRoutePrincipal(e,a); const c=a.authoritativeCommand; if(p.providerOperationId!==a.providerOperationId)throw new Error('PROVIDER_OPERATION_CONFLICT'); const old = this.prior<IdentityResult>(a.originalIdentity); if (a.state==='COMPLETED') { if(!old || old.subjectId!==p.subjectId || old.providerOperationId!==p.providerOperationId)throw new Error('OPERATION_CONFLICT'); this.phase(e,l,`${phase}_REPLAY`); return { outcome: 'REPLAY' as const, result: old }; } if(this.revoked)throw new Error('ATTEMPT_NOT_COMPLETABLE'); this.duringComplete?.(); this.duringComplete=undefined; const result: IdentityResult = { requestId: c.requestId, eligibilityId: c.eligibilityId, providerOperationId: p.providerOperationId, subjectId: p.subjectId, applicantKey: c.context.applicantKey, pharmacyContextId: c.context.pharmacyContextId, state: 'EMAIL_CONFIRMATION_PENDING' }; if(this.failAudit){this.failAudit=false;throw new Error('AUDIT_WRITE_FAILED');} this.phaseAudit.push({phase,actor:{...e.actor},original:{...a.originalIdentity},originalCredentialVersion:a.originalCredentialVersion}); this.operations.set(l.operationId, { i: { ...a.originalIdentity }, result }); this.attempts.set(l.operationId, { ...a, state: 'COMPLETED', result }); if (this.failCompleteResponse) { this.failCompleteResponse = false; throw new AmbiguousOutcomeError(); } return { outcome: 'APPLIED' as const, result }; }
  async recoverCompletedIssuanceAtomic(e: IssuanceExecution, l: IssuanceLookup) { const a=this.boundAttempt(l); if(!a) return null; const result=this.prior<IdentityResult>(a.originalIdentity); if(result)this.phase(e,l,'RESULT_LOOKUP'); return result; }
  async recoverExact<T>(i: OperationIdentity) { return this.prior<T>(i); }
  async recoverIssuanceAttempt(e: IssuanceExecution, l: IssuanceLookup) { const a=this.boundAttempt(l); if(a)this.phase(e,l,'RECOVERY_LOOKUP'); return a; }
}
class Provider implements OwnerIdentityProvider {
  rows = new Map<string, ProviderIdentity>(); events: string[]; creates = 0; recovery: 'AUTO'|'UNKNOWN'|'ABSENT' = 'AUTO'; loseCreate = false; existing: ProviderIdentity|null = null; afterCreate?: () => void;
  constructor(events: string[]) { this.events = events; }
  marker(input: Parameters<OwnerIdentityProvider['createUnconfirmedOwner']>[0]): ProviderIdentity { return { subjectId: U(7), providerOperationId: input.providerOperationId, normalizedEmail: input.normalizedEmail, emailConfirmed: false, identityClass: 'OWNER_ONBOARDING_V1', trustedOwnerMarker: input.trustedOwnerMarker }; }
  async inspectExistingByEmail() { this.events.push('inspect'); return this.existing; }
  async createUnconfirmedOwner(input: Parameters<OwnerIdentityProvider['createUnconfirmedOwner']>[0]) { this.events.push('create'); this.creates++; const p = this.marker(input); this.rows.set(input.providerOperationId, p); this.afterCreate?.(); this.afterCreate=undefined; if (this.loseCreate) { this.loseCreate = false; throw new AmbiguousOutcomeError(); } return p; }
  async recoverExact(id: string): Promise<ProviderRecovery> { this.events.push('recover'); if (this.recovery === 'UNKNOWN') return { outcome: 'UNKNOWN' }; if (this.recovery === 'ABSENT') return { outcome: 'PROVEN_ABSENT' }; const p = this.rows.get(id); return p ? { outcome: 'FOUND', identity: p } : { outcome: 'UNKNOWN' }; }
}

const authority = new Authority(); const caps = new Set<GatewayCapability>(['ELIGIBILITY_RESERVE','IDENTITY_ISSUE','IDENTITY_RECOVER']);
authority.rows.set('v1', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps });
authority.rows.set('issue-only', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps: new Set(['IDENTITY_ISSUE']) });
authority.rows.set('recovery-only', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps: new Set(['IDENTITY_RECOVER']) });
authority.rows.set('underprivileged', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps: new Set() });
authority.rows.set('revoked', { p: { principalId: 'gateway-1', kind: 'GATEWAY', credentialVersion: 1 }, active: false, version: 1, caps });
authority.rows.set('other-principal', { p: { principalId: 'gateway-2', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps });
authority.rows.set('recovery-other', { p: { principalId: 'gateway-2', kind: 'GATEWAY', credentialVersion: 1 }, active: true, version: 1, caps: new Set(['IDENTITY_RECOVER']) });
const repo = new Repo(); const provider = new Provider(repo.events); const d = { authority, repository: repo, provider };
const key = await sha256Text('owner@example.com'); const ctx = (op: number) => ({ operationId: U(op), applicantKey: key, pharmacyContextId: U(3), contractVersion: I3_CONTRACT_VERSION });
const grant = (token: string, cap: Extract<GatewayCapability,'IDENTITY_ISSUE'|'IDENTITY_RECOVER'>, applicantKey=key, pharmacyContextId=U(3), active=true): void => {
  const row=authority.rows.get(token); if(!row)throw new Error(`unknown synthetic principal ${token}`);
  row.scopes ??= new Map(); row.scopes.set(authority.scopeKey(cap,{applicantKey,pharmacyContextId}),active);
};
for(const token of ['v1','revoked','other-principal'])for(const cap of ['IDENTITY_ISSUE','IDENTITY_RECOVER'] as const)grant(token,cap);
grant('issue-only','IDENTITY_ISSUE'); grant('recovery-only','IDENTITY_RECOVER'); grant('recovery-other','IDENTITY_RECOVER');
const reserve: ReserveEligibilityCommand = { context: ctx(1), requestId: U(2), normalizedEmail: ' Owner@Example.com ', pharmacyName: 'Main Pharmacy', currency: 'ngn', admissionDecisionId: U(4) };
const rr = await reserveOwnerEligibility({ opaque: 'v1' }, reserve, d); ok(rr.outcome === 'APPLIED', 'reservation applies');
const freshIssue = async (n: number): Promise<IssueIdentityCommand> => {
  const rc: ReserveEligibilityCommand = { ...reserve, context: ctx(100 + n), requestId: U(200 + n) };
  const result = (await reserveOwnerEligibility({ opaque: authority.rows.has('v2') ? 'v2' : 'v1' }, rc, d)).result;
  return { context: ctx(n), requestId: result.requestId, eligibilityId: result.eligibilityId, providerOperationId: result.providerOperationId, intendedInputFingerprint: result.intendedInputFingerprint, normalizedEmail: 'owner@example.com', fullName: 'Owner One' };
};
const pendingAttempt = async (command: IssueIdentityCommand, principalId='gateway-1', credentialVersion=1): Promise<IssuanceAttempt> => ({
  state:'PROVIDER_PENDING',
  originalIdentity:await commandIdentity({principalId,kind:'GATEWAY',credentialVersion},'IDENTITY_ISSUE',command.context,[command.requestId,command.eligibilityId,command.providerOperationId,command.intendedInputFingerprint,'owner@example.com','Owner One']),
  originalCredentialVersion:credentialVersion,
  providerOperationId:command.providerOperationId,
  authoritativeCommand:repo.copyCommand(command),
});
const issue: IssueIdentityCommand = { context: ctx(10), requestId: rr.result.requestId, eligibilityId: rr.result.eligibilityId, providerOperationId: rr.result.providerOperationId, intendedInputFingerprint: rr.result.intendedInputFingerprint, normalizedEmail: 'owner@example.com', fullName: 'Owner One' };
const issued = await issueOwnerIdentity({ opaque: 'v1' }, issue, d); ok(issued.outcome === 'APPLIED' && repo.events.join(',') === 'begin,inspect,create,complete', 'durable attempt precedes every provider effect');
ok((await issueOwnerIdentity({ opaque: 'v1' }, issue, d)).outcome === 'REPLAY' && provider.creates === 1, 'completed exact replay is effect-free');
await rejects(() => issueOwnerIdentity({ opaque: 'v1' }, { ...issue, fullName: 'Changed' }, d), /OPERATION_CONFLICT/, 'changed typed argument conflicts despite same operation');

const issue2 = await freshIssue(11); repo.failCompleteResponse = true; const lostDb = await issueOwnerIdentity({ opaque: 'v1' }, issue2, d); ok(lostDb.outcome === 'REPLAY', 'lost database response recovers committed canonical result');
const issue3 = await freshIssue(12); provider.loseCreate = true; const lostProvider = await issueOwnerIdentity({ opaque: 'v1' }, issue3, d); ok(lostProvider.result.subjectId === U(7), 'lost provider response resolves exact original operation');
const issue4 = await freshIssue(13); provider.recovery = 'UNKNOWN'; repo.attempts.set(issue4.context.operationId, await pendingAttempt(issue4)); const before = provider.creates; await rejects(() => issueOwnerIdentity({ opaque:'v1' }, issue4, d), /ISSUANCE_RECOVERY_PENDING/, 'restart with uncertain outcome never blind creates'); ok(provider.creates === before, 'uncertain restart made no create');
await rejects(() => recoverIssuedIdentity({ opaque:'v1' }, issue4, d), /ISSUANCE_RECOVERY_PENDING/, 'explicit recovery also fails closed on uncertainty');
const pendingCalls = provider.creates;
await rejects(() => issueOwnerIdentity({ opaque:'v1' }, { ...issue4, fullName:'Changed Pending' }, d), /OPERATION_CONFLICT/, 'changed command collides with pending attempt before provider work');
await rejects(() => issueOwnerIdentity({ opaque:'other-principal' }, issue4, d), /OPERATION_CONFLICT/, 'cross-principal pending collision fails before provider work');
ok(provider.creates === pendingCalls, 'pending command and principal collisions make no provider calls');

const completedCollision = await freshIssue(20); const completedCollisionCalls = provider.creates;
await rejects(() => issueOwnerIdentity({ opaque:'v1' }, { ...completedCollision, context: ctx(1) }, d), /ACTION_MISMATCH/, 'completed non-issuance operation claims ID before issuance');
ok(provider.creates === completedCollisionCalls, 'completed-operation collision is rejected before provider work');
const pendingCollision = await freshIssue(21); repo.attempts.set(pendingCollision.context.operationId, await pendingAttempt(pendingCollision));
await rejects(() => reserveOwnerEligibility({ opaque:'v1' }, { ...reserve, context:{ ...reserve.context, operationId:pendingCollision.context.operationId }, requestId:U(888) }, d), /ACTION_MISMATCH/, 'pending issuance operation ID cannot be claimed by another command');

const recoveryIssue = await freshIssue(18); provider.existing = null; provider.loseCreate = true; provider.recovery = 'UNKNOWN';
await rejects(() => issueOwnerIdentity({ opaque:'issue-only' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'issue-only authority may leave a durable pending attempt but cannot resolve response loss');
const recoveryCreateCount = provider.creates;
await rejects(() => issueOwnerIdentity({ opaque:'recovery-only' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'recovery-only authority cannot invoke issuance or create');
await rejects(() => recoverIssuedIdentity({ opaque:'issue-only' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'issue-only authority cannot recover pending issuance');
await rejects(() => recoverIssuedIdentity({ opaque:'underprivileged' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'underprivileged credential cannot recover pending issuance');
await rejects(() => recoverIssuedIdentity({ opaque:'revoked' }, recoveryIssue, d), /GATEWAY_AUTHORITY_DENIED/, 'revoked credential cannot recover pending issuance');
provider.recovery = 'AUTO'; const recoveredByRecoveryOnly = await recoverIssuedIdentity({ opaque:'recovery-other' }, recoveryIssue, d);
ok(recoveredByRecoveryOnly.providerOperationId === recoveryIssue.providerOperationId && provider.creates === recoveryCreateCount, 'different recovery-only principal finalizes exact pending attempt without creation');
const crossPrincipalAudit = repo.phaseAudit.filter((entry) => entry.original.operationId === recoveryIssue.context.operationId);
ok(crossPrincipalAudit.some((entry) => entry.actor.principalId === 'gateway-2' && entry.original.principalId === 'gateway-1' && entry.originalCredentialVersion===1), 'recovery actor is audited separately from immutable original principal/version');
const recoverCallsBeforeReplay = provider.events.filter((event) => event === 'recover').length;
ok((await recoverIssuedIdentity({ opaque:'recovery-other' }, recoveryIssue, d)).subjectId === recoveredByRecoveryOnly.subjectId && provider.events.filter((event) => event === 'recover').length === recoverCallsBeforeReplay, 'recovery-only exact completed replay is provider-effect free');
await rejects(() => recoverIssuedIdentity({opaque:'revoked'},recoveryIssue,d),/GATEWAY_AUTHORITY_DENIED/,'revoked credential cannot replay a completed privileged result');

provider.recovery = 'AUTO'; const concurrentIssue = await freshIssue(17); const createsBeforeRace = provider.creates;
const concurrent = await Promise.allSettled([issueOwnerIdentity({ opaque:'v1' }, concurrentIssue, d), issueOwnerIdentity({ opaque:'v1' }, concurrentIssue, d)]);
ok(concurrent.some((x) => x.status === 'fulfilled') && concurrent.every((x) => x.status === 'fulfilled' || /ISSUANCE_RECOVERY_PENDING/.test(String(x.reason))), 'concurrent duplicate either exactly recovers or remains pending');
ok(provider.creates === createsBeforeRace + 1, 'concurrent duplicate performs exactly one provider create');

const rotatedPending = await freshIssue(22); provider.loseCreate = true; provider.recovery = 'UNKNOWN';
await rejects(() => issueOwnerIdentity({ opaque:'v1' }, rotatedPending, d), /ISSUANCE_RECOVERY_PENDING/, 'pending attempt survives credential rotation boundary');

authority.rows.set('v1', { ...authority.rows.get('v1')!, p: { principalId:'gateway-1',kind:'GATEWAY',credentialVersion:1 }, active:false,version:2,caps }); authority.rows.set('v2', { p: { principalId:'gateway-1',kind:'GATEWAY',credentialVersion:2 }, active:true,version:2,caps }); grant('v2','IDENTITY_ISSUE'); grant('v2','IDENTITY_RECOVER');
ok((await recoverReservedEligibility({ opaque:'v2' }, reserve, d)).requestId === reserve.requestId, 'rotation preserves stable operation identity');
await rejects(() => recoverReservedEligibility({ opaque:'v1' }, reserve, d), /GATEWAY_AUTHORITY_DENIED/, 'stale credential cannot recover');
provider.recovery = 'AUTO'; ok((await recoverIssuedIdentity({ opaque:'v2' }, rotatedPending, d)).providerOperationId === rotatedPending.providerOperationId, 'rotated current credential finalizes stable-principal pending attempt');

const createsBeforeDispatchRevocation = provider.creates; const dispatchRevoked = await freshIssue(23);
repo.afterBegin=()=>{ const row=authority.rows.get('v2'); if(row)row.active=false; };
await rejects(() => issueOwnerIdentity({opaque:'v2'},dispatchRevoked,d),/GATEWAY_AUTHORITY_DENIED/,'revocation after begin but before delayed provider dispatch is enforced');
ok(provider.creates===createsBeforeDispatchRevocation,'dispatch denial performs no provider create');
authority.rows.get('v2')!.active=true;

const afterDispatch = await freshIssue(24); const createsBeforeAfterDispatch=provider.creates;
provider.afterCreate=()=>{ authority.rows.get('v2')!.active=false; };
await rejects(() => issueOwnerIdentity({opaque:'v2'},afterDispatch,d),/GATEWAY_AUTHORITY_DENIED/,'revocation after provider dispatch blocks separately invoked completion');
ok(provider.creates===createsBeforeAfterDispatch+1 && repo.attempts.get(afterDispatch.context.operationId)?.state==='PROVIDER_PENDING','dispatched effect remains correlated and pending after completion denial');
authority.rows.get('v2')!.active=true;
ok((await recoverIssuedIdentity({opaque:'recovery-other'},afterDispatch,d)).providerOperationId===afterDispatch.providerOperationId,'authorized different principal resolves effect without changing operation identity');

const responseLossRevoked = await freshIssue(25); const createsBeforeLoss=provider.creates; provider.loseCreate=true;
provider.afterCreate=()=>{ authority.rows.get('v2')!.active=false; };
await rejects(() => issueOwnerIdentity({opaque:'v2'},responseLossRevoked,d),/GATEWAY_AUTHORITY_DENIED/,'ambiguous provider response requires fresh authority before result resolution');
ok(provider.creates===createsBeforeLoss+1 && repo.attempts.get(responseLossRevoked.context.operationId)?.state==='PROVIDER_PENDING','ambiguous effect is retained without blind create or fabricated absence');
authority.rows.get('v2')!.active=true;
await recoverIssuedIdentity({opaque:'recovery-other'},responseLossRevoked,d);
ok(provider.creates===createsBeforeLoss+1,'recovery of response loss never creates again');

const inTransaction = await freshIssue(26);
repo.duringComplete=()=>{ authority.rows.get('v2')!.active=false; };
ok((await issueOwnerIdentity({opaque:'v2'},inTransaction,d)).outcome==='APPLIED','revocation after completion transaction entry does not retroactively abort accepted bounded transaction');
authority.rows.get('v2')!.active=true;

const auditRollback = await freshIssue(27); repo.failAudit=true;
await rejects(() => issueOwnerIdentity({opaque:'v2'},auditRollback,d),/AUDIT_WRITE_FAILED/,'required audit failure aborts completion');
ok(!repo.operations.has(auditRollback.context.operationId) && repo.attempts.get(auditRollback.context.operationId)?.state==='PROVIDER_PENDING','audit failure leaves no completed operation or false successful replay');
const auditRecovered=await recoverIssuedIdentity({opaque:'recovery-other'},auditRollback,d);
ok(auditRecovered.providerOperationId===auditRollback.providerOperationId && repo.operations.has(auditRollback.context.operationId),'authorized recovery completes the original correlated effect after audit rollback');

const auditLookup: IssuanceLookup={operationId:auditRollback.context.operationId,applicantKey:key,pharmacyContextId:U(3)};
const crossIssueExecution: IssuanceExecution={actor:await authority.requireGatewayForContext({opaque:'other-principal'},'IDENTITY_ISSUE',{applicantKey:key,pharmacyContextId:U(3)}),capability:'IDENTITY_ISSUE'};
const rotatedIssueExecution: IssuanceExecution={actor:await authority.requireGatewayForContext({opaque:'v2'},'IDENTITY_ISSUE',{applicantKey:key,pharmacyContextId:U(3)}),capability:'IDENTITY_ISSUE'};
const recoveryExecution: IssuanceExecution={actor:await authority.requireGatewayForContext({opaque:'recovery-other'},'IDENTITY_RECOVER',{applicantKey:key,pharmacyContextId:U(3)}),capability:'IDENTITY_RECOVER'};
const auditProvider=provider.rows.get(auditRollback.providerOperationId)!;
await rejects(()=>repo.authorizeProviderDispatchAtomic(crossIssueExecution,{...auditLookup,operationId:dispatchRevoked.context.operationId}),/ORIGINAL_ISSUE_PRINCIPAL_REQUIRED/,'ISSUE-only second principal cannot dispatch original principal attempt');
await rejects(()=>repo.completeIssuanceAtomic(crossIssueExecution,auditLookup,auditProvider),/ORIGINAL_ISSUE_PRINCIPAL_REQUIRED/,'ISSUE-only second principal cannot complete original principal attempt');
await rejects(()=>repo.recoverCompletedIssuanceAtomic(crossIssueExecution,auditLookup),/ORIGINAL_ISSUE_PRINCIPAL_REQUIRED/,'ISSUE-only second principal cannot replay or disclose original principal result');
ok((await repo.recoverCompletedIssuanceAtomic(rotatedIssueExecution,{operationId:issue2.context.operationId,applicantKey:key,pharmacyContextId:U(3)}))?.providerOperationId===issue2.providerOperationId,'same-principal rotated credential may use issue result lookup without rewriting original identity');
const exactCompletionReplay=await repo.completeIssuanceRecoveryAtomic(recoveryExecution,auditLookup,auditProvider);
ok(exactCompletionReplay.outcome==='REPLAY' && exactCompletionReplay.result.subjectId===auditRecovered.subjectId,'exact completed-state recovery retry returns canonical result');
await rejects(()=>repo.completeIssuanceRecoveryAtomic(recoveryExecution,auditLookup,{...auditProvider,subjectId:U(999)}),/OPERATION_CONFLICT/,'completed retry with changed subject conflicts');
await rejects(()=>repo.completeIssuanceRecoveryAtomic(recoveryExecution,auditLookup,{...auditProvider,providerOperationId:U(998)}),/PROVIDER_OPERATION_CONFLICT/,'completed retry with changed provider correlation conflicts');
await rejects(()=>recoverIssuedIdentity({opaque:'v1'},auditRollback,d),/GATEWAY_AUTHORITY_DENIED/,'stale credential cannot replay completed identity result');

const wrongScopeContext={...auditRollback,context:{...auditRollback.context,pharmacyContextId:U(999)}};
authority.rows.set('scoped-wrong',{p:{principalId:'gateway-3',kind:'GATEWAY',credentialVersion:1},active:true,version:1,caps:new Set(['IDENTITY_RECOVER'])}); grant('scoped-wrong','IDENTITY_RECOVER',key,U(998));
await rejects(() => recoverIssuedIdentity({opaque:'scoped-wrong'},wrongScopeContext,d),/GATEWAY_AUTHORITY_DENIED/,'operation identifiers do not bypass applicant/context recovery scope');

authority.rows.set('missing-scope',{p:{principalId:'gateway-4',kind:'GATEWAY',credentialVersion:1},active:true,version:1,caps:new Set(['IDENTITY_RECOVER'])});
authority.rows.set('inactive-scope',{p:{principalId:'gateway-5',kind:'GATEWAY',credentialVersion:1},active:true,version:1,caps:new Set(['IDENTITY_RECOVER'])}); grant('inactive-scope','IDENTITY_RECOVER',key,U(3),false);
authority.rows.set('wrong-capability-scope',{p:{principalId:'gateway-6',kind:'GATEWAY',credentialVersion:1},active:true,version:1,caps:new Set(['IDENTITY_ISSUE','IDENTITY_RECOVER'])}); grant('wrong-capability-scope','IDENTITY_ISSUE');
authority.rows.set('wrong-applicant-scope',{p:{principalId:'gateway-7',kind:'GATEWAY',credentialVersion:1},active:true,version:1,caps:new Set(['IDENTITY_RECOVER'])}); grant('wrong-applicant-scope','IDENTITY_RECOVER','f'.repeat(64),U(3));
authority.rows.set('wrong-context-scope',{p:{principalId:'gateway-8',kind:'GATEWAY',credentialVersion:1},active:true,version:1,caps:new Set(['IDENTITY_RECOVER'])}); grant('wrong-context-scope','IDENTITY_RECOVER',key,U(998));
const deniedScopeAuditCount=repo.phaseAudit.length; const deniedScopeProviderCount=provider.events.length;
for(const [token,label] of [['missing-scope','missing'],['inactive-scope','inactive'],['wrong-capability-scope','wrong-capability'],['wrong-applicant-scope','wrong-applicant'],['wrong-context-scope','wrong-context']] as const){
  await rejects(()=>recoverIssuedIdentity({opaque:token},auditRollback,d),/GATEWAY_AUTHORITY_DENIED/,`${label} scope grant denies recovery before disclosure`);
}
ok(repo.phaseAudit.length===deniedScopeAuditCount && provider.events.length===deniedScopeProviderCount,'scope rejection performs no repository disclosure or provider call');

const legacyCommand=await freshIssue(28); const legacyIdentity=await commandIdentity({principalId:'gateway-1',kind:'GATEWAY',credentialVersion:2},'IDENTITY_ISSUE',legacyCommand.context,[legacyCommand.requestId,legacyCommand.eligibilityId,legacyCommand.providerOperationId,legacyCommand.intendedInputFingerprint,'owner@example.com','Owner One']);
repo.attempts.set(legacyCommand.context.operationId,{state:'PROVIDER_PENDING',originalIdentity:legacyIdentity,providerOperationId:legacyCommand.providerOperationId} as unknown as IssuanceAttempt);
await rejects(() => recoverIssuedIdentity({opaque:'recovery-other'},legacyCommand,d),/LEGACY_ISSUANCE_PROVENANCE_INCOMPLETE/,'legacy attempt without original credential and typed command provenance fails closed');

const phaseCaps=authority.calls.filter((call)=>call.scope.applicantKey===key && call.scope.pharmacyContextId===U(3));
ok(phaseCaps.some((call)=>call.cap==='IDENTITY_ISSUE') && phaseCaps.some((call)=>call.cap==='IDENTITY_RECOVER'),'issue and recovery boundaries use distinct action-specific current authority');
await rejects(() => issueOwnerIdentity({ opaque:'v2' }, { ...issue, context: { ...issue.context, operationId:'bad' } }, d), /INVALID_OPERATION_ID/, 'malformed id rejected before effects');
const issue5 = await freshIssue(14); repo.revoked = true; await rejects(() => issueOwnerIdentity({ opaque:'v2' }, issue5, d), /AUTHORITATIVE_RESERVATION_CONFLICT/, 'revoked reservation rejected before provider');
repo.revoked = false; const staffIssue = await freshIssue(15); provider.existing = { ...provider.marker({ providerOperationId: staffIssue.providerOperationId, normalizedEmail:'owner@example.com', fullName:'Owner One', trustedOwnerMarker:{ contractVersion:'owner-onboarding-v1',requestId:staffIssue.requestId,providerOperationId:staffIssue.providerOperationId,intendedInputFingerprint:staffIssue.intendedInputFingerprint } }), identityClass:'STAFF_INVITATION_BOOTSTRAP_V1' }; await rejects(() => issueOwnerIdentity({ opaque:'v2' }, staffIssue, d), /STAFF_IDENTITY_PROTECTED/, 'staff identity is never adopted');
const confirmedIssue = await freshIssue(16); provider.existing = { ...provider.marker({ providerOperationId: confirmedIssue.providerOperationId, normalizedEmail:'owner@example.com', fullName:'Owner One', trustedOwnerMarker:{ contractVersion:'owner-onboarding-v1',requestId:confirmedIssue.requestId,providerOperationId:confirmedIssue.providerOperationId,intendedInputFingerprint:confirmedIssue.intendedInputFingerprint } }), emailConfirmed:true }; await rejects(() => issueOwnerIdentity({ opaque:'v2' }, confirmedIssue, d), /AUTHENTICATED_CONTINUATION_REQUIRED/, 'confirmed account requires authenticated continuation');
ok(Object.isFrozen(issued.result), 'canonical result is immutable');
console.log(`BLK-002-I3 corrected gateway injected tests: ${passed} passed`);
