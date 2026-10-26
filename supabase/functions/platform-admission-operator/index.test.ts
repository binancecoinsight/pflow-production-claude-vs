import {
  I3_CONTRACT_VERSION,
  type OperationIdentity,
  type OperatorAuthority,
  type OperatorPermission,
  type PresentedCredential,
  type VerifiedPrincipal,
  sha256Text,
} from '../_shared/owner-security-i3';
import {
  decideAdmission,
  recoverAdmissionDecision,
  recoverEligibilityRevocation,
  revokeEligibility,
  type AdmissionDecisionCommand,
  type AdmissionDecisionResult,
  type EligibilityRevocationCommand,
  type EligibilityRevocationResult,
  type PlatformAdmissionRepository,
} from './index';

let passed = 0;
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(`FAIL: ${message}`); passed += 1; };
const rejects = async (work: () => Promise<unknown>, pattern: RegExp, message: string): Promise<void> => {
  try { await work(); } catch (error) { assert(pattern.test(error instanceof Error ? error.message : String(error)), message); return; }
  throw new Error(`FAIL: ${message}`);
};

class Authority implements OperatorAuthority {
  records = new Map<string, { principal: VerifiedPrincipal; active: boolean; currentVersion: number; permissions: Set<OperatorPermission> }>();
  async requireOperator(credential: PresentedCredential, permission: OperatorPermission): Promise<VerifiedPrincipal> {
    const row = this.records.get(credential.opaque);
    if (!row?.active || row.principal.credentialVersion !== row.currentVersion || row.principal.kind !== 'PLATFORM_OPERATOR' || !row.permissions.has(permission)) throw new Error('OPERATOR_AUTHORITY_DENIED');
    return { ...row.principal };
  }
}

const sameIdentity = (a: OperationIdentity, b: OperationIdentity): boolean => JSON.stringify(a) === JSON.stringify(b);

class Repository implements PlatformAdmissionRepository {
  operations = new Map<string, { identity: OperationIdentity; result: unknown }>();
  currentAdmissions = new Map<string, AdmissionDecisionResult>();
  eligibility = new Map<string, 'RESERVED' | 'AUTH_CREATE_PENDING' | 'EMAIL_CONFIRMATION_PENDING' | 'ACTIVE' | 'REVOKED' | 'CONSUMED'>();
  failNextAudit = false;

  private key(applicant: string, context: string): string { return `${applicant}|${context}`; }
  private prior<T>(identity: OperationIdentity): T | null {
    const row = this.operations.get(identity.operationId);
    if (!row) return null;
    if (!sameIdentity(row.identity, identity)) throw new Error(row.identity.action === identity.action ? 'OPERATION_CONFLICT' : 'ACTION_MISMATCH');
    return row.result as T;
  }
  private commit(identity: OperationIdentity, result: unknown): void {
    if (this.failNextAudit) { this.failNextAudit = false; throw new Error('AUDIT_COMMIT_FAILED'); }
    this.operations.set(identity.operationId, { identity: { ...identity }, result });
  }
  async decideAdmissionAtomic(identity: OperationIdentity, command: AdmissionDecisionCommand) {
    const prior = this.prior<AdmissionDecisionResult>(identity);
    if (prior) return { outcome: 'REPLAY' as const, result: prior };
    const key = this.key(command.context.applicantKey, command.context.pharmacyContextId);
    const current = this.currentAdmissions.get(key);
    let result: AdmissionDecisionResult;
    if (command.action === 'APPROVE') {
      if (current?.state === 'ACTIVE') throw new Error('ACTIVE_ADMISSION_EXISTS');
      result = { decisionId: command.decisionId, applicantKey: command.context.applicantKey, pharmacyContextId: command.context.pharmacyContextId, state: 'ACTIVE' };
    } else if (command.action === 'REPLACE') {
      if (!current || current.state !== 'ACTIVE' || current.decisionId !== command.predecessorDecisionId) throw new Error('REPLACEMENT_CONFLICT');
      result = { decisionId: command.decisionId, applicantKey: command.context.applicantKey, pharmacyContextId: command.context.pharmacyContextId, state: 'ACTIVE', predecessorDecisionId: current.decisionId };
    } else {
      if (!current || current.state !== 'ACTIVE') throw new Error('ADMISSION_NOT_ACTIVE');
      result = { decisionId: command.decisionId, applicantKey: command.context.applicantKey, pharmacyContextId: command.context.pharmacyContextId, state: 'REVOKED', predecessorDecisionId: current.decisionId };
    }
    if (this.failNextAudit) { this.failNextAudit = false; throw new Error('AUDIT_COMMIT_FAILED'); }
    this.currentAdmissions.set(key, result);
    this.operations.set(identity.operationId, { identity: { ...identity }, result });
    return { outcome: 'APPLIED' as const, result };
  }
  async revokeEligibilityAtomic(identity: OperationIdentity, command: EligibilityRevocationCommand) {
    const prior = this.prior<EligibilityRevocationResult>(identity);
    if (prior) return { outcome: 'REPLAY' as const, result: prior };
    const state = this.eligibility.get(command.eligibilityId);
    if (state === 'CONSUMED') throw new Error('CONSUMED_IMMUTABLE');
    if (!state || !['RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING', 'ACTIVE'].includes(state)) throw new Error('ELIGIBILITY_NOT_REVOCABLE');
    const result: EligibilityRevocationResult = { revocationId: command.revocationId, eligibilityId: command.eligibilityId, applicantKey: command.context.applicantKey, pharmacyContextId: command.context.pharmacyContextId, state: 'REVOKED' };
    this.commit(identity, result);
    this.eligibility.set(command.eligibilityId, 'REVOKED');
    return { outcome: 'APPLIED' as const, result };
  }
  async recoverExact<T>(identity: OperationIdentity): Promise<T | null> { return this.prior<T>(identity); }
}

const authority = new Authority();
const U = (n: number): string => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;
const all = new Set<OperatorPermission>(['ADMISSION_APPROVE', 'ADMISSION_REPLACE', 'ADMISSION_REVOKE', 'ELIGIBILITY_REVOKE']);
authority.records.set('operator-v1', { principal: { principalId: 'operator-stable', kind: 'PLATFORM_OPERATOR', credentialVersion: 1 }, active: true, currentVersion: 1, permissions: all });
authority.records.set('operator-revoked', { principal: { principalId: 'operator-stable', kind: 'PLATFORM_OPERATOR', credentialVersion: 1 }, active: false, currentVersion: 1, permissions: all });
authority.records.set('pharmacy-user', { principal: { principalId: 'pharmacy-user', kind: 'PLATFORM_OPERATOR', credentialVersion: 1 }, active: true, currentVersion: 1, permissions: new Set() });
const repository = new Repository();
const dependencies = { authority, repository };
const applicantKey = await sha256Text('owner@example.com');
const context = (n: number) => ({ operationId: U(n), applicantKey, pharmacyContextId: U(900), contractVersion: I3_CONTRACT_VERSION });
const approve: AdmissionDecisionCommand = { context: context(1), action: 'APPROVE', decisionId: U(101), normalizedEmail: 'owner@example.com', reasonCode: 'MANUAL_REVIEW' };

repository.failNextAudit = true;
await rejects(() => decideAdmission({ opaque: 'operator-v1' }, approve, dependencies), /AUDIT_COMMIT_FAILED/, 'audit failure rejects admission transaction');
assert(repository.currentAdmissions.size === 0 && repository.operations.size === 0, 'audit failure leaves no admission effect or replay result');
const approved = await decideAdmission({ opaque: 'operator-v1' }, approve, dependencies);
assert(approved.outcome === 'APPLIED' && approved.result.state === 'ACTIVE', 'authorized operator approves admission');
await rejects(() => decideAdmission({ opaque: 'operator-v1' }, { ...approve, context: { ...approve.context, operationId: U(2), applicantKey: 'a'.repeat(64) } }, dependencies), /APPLICANT_KEY_CONFLICT/, 'operator cannot bind email to a caller-selected applicant key');
assert((await decideAdmission({ opaque: 'operator-v1' }, approve, dependencies)).outcome === 'REPLAY', 'exact approval replay is effect-free');
await rejects(() => decideAdmission({ opaque: 'pharmacy-user' }, { ...approve, context: context(3) }, dependencies), /OPERATOR_AUTHORITY_DENIED/, 'pharmacy user cannot self-admit');
await rejects(() => recoverAdmissionDecision({ opaque: 'operator-revoked' }, approve, dependencies), /OPERATOR_AUTHORITY_DENIED/, 'revoked operator cannot recover decision');
await rejects(() => decideAdmission({ opaque: 'operator-v1' }, { ...approve, reasonCode: 'CHANGED' }, dependencies), /OPERATION_CONFLICT/, 'same operation with changed reason conflicts');

authority.records.set('operator-v1', { principal: { principalId: 'operator-stable', kind: 'PLATFORM_OPERATOR', credentialVersion: 1 }, active: false, currentVersion: 2, permissions: all });
authority.records.set('operator-v2', { principal: { principalId: 'operator-stable', kind: 'PLATFORM_OPERATOR', credentialVersion: 2 }, active: true, currentVersion: 2, permissions: all });
const recovered = await recoverAdmissionDecision({ opaque: 'operator-v2' }, approve, dependencies);
assert(recovered.decisionId === U(101), 'rotated credential for stable operator recovers decision');
await rejects(() => recoverAdmissionDecision({ opaque: 'operator-v1' }, approve, dependencies), /OPERATOR_AUTHORITY_DENIED/, 'stale positive credential version cannot recover');

const replace: AdmissionDecisionCommand = { context: context(4), action: 'REPLACE', decisionId: U(102), normalizedEmail: 'owner@example.com', reasonCode: 'CORRECTED_EVIDENCE', predecessorDecisionId: U(101) };
const replaced = await decideAdmission({ opaque: 'operator-v2' }, replace, dependencies);
assert(replaced.result.predecessorDecisionId === U(101) && replaced.result.state === 'ACTIVE', 'replacement links predecessor and remains active');
await rejects(() => decideAdmission({ opaque: 'operator-v2' }, { ...replace, predecessorDecisionId: U(999) }, dependencies), /OPERATION_CONFLICT/, 'changed predecessor under same operation conflicts');

repository.eligibility.set(U(201), 'ACTIVE');
const revokeAdmissionCommand: AdmissionDecisionCommand = { context: context(5), action: 'REVOKE', decisionId: U(103), normalizedEmail: 'owner@example.com', reasonCode: 'ADMISSION_WITHDRAWN', predecessorDecisionId: U(102) };
await decideAdmission({ opaque: 'operator-v2' }, revokeAdmissionCommand, dependencies);
assert(repository.eligibility.get(U(201)) === 'ACTIVE', 'admission revocation leaves existing eligibility independently issued');

const revokeCommand: EligibilityRevocationCommand = { context: context(6), revocationId: U(301), eligibilityId: U(201), reasonCode: 'SECURITY' };
const revoked = await revokeEligibility({ opaque: 'operator-v2' }, revokeCommand, dependencies);
assert(revoked.result.state === 'REVOKED', 'explicit eligibility revocation changes eligible record');
assert((await recoverEligibilityRevocation({ opaque: 'operator-v2' }, revokeCommand, dependencies)).revocationId === U(301), 'authorized exact revocation recovery returns result');
await rejects(() => recoverEligibilityRevocation({ opaque: 'operator-v2' }, { ...revokeCommand, context: { ...revokeCommand.context, pharmacyContextId: U(901) } }, dependencies), /OPERATION_CONFLICT/, 'cross-context revocation recovery conflicts');

repository.eligibility.set(U(202), 'CONSUMED');
await rejects(() => revokeEligibility({ opaque: 'operator-v2' }, { ...revokeCommand, context: context(7), revocationId: U(302), eligibilityId: U(202) }, dependencies), /CONSUMED_IMMUTABLE/, 'consumed eligibility cannot be revoked');
repository.eligibility.set(U(203), 'ACTIVE'); repository.failNextAudit = true;
await rejects(() => revokeEligibility({ opaque: 'operator-v2' }, { ...revokeCommand, context: context(9), revocationId: U(303), eligibilityId: U(203) }, dependencies), /AUDIT_COMMIT_FAILED/, 'revocation audit failure rejects transaction');
assert(repository.eligibility.get(U(203)) === 'ACTIVE', 'revocation audit failure leaves state and replay evidence unchanged');
for (const [offset, state] of (['RESERVED', 'AUTH_CREATE_PENDING', 'EMAIL_CONFIRMATION_PENDING'] as const).entries()) {
  const id = U(210 + offset); repository.eligibility.set(id, state);
  const result = await revokeEligibility({ opaque: 'operator-v2' }, { ...revokeCommand, context: context(20 + offset), revocationId: U(310 + offset), eligibilityId: id }, dependencies);
  assert(result.result.state === 'REVOKED', `stable applicant revocation is allowed from ${state}`);
}
await rejects(() => decideAdmission({ opaque: 'operator-v2' }, { ...approve, context: context(8), action: 'DELETE' as AdmissionDecisionCommand['action'] }, dependencies), /UNKNOWN_ADMISSION_ACTION/, 'unknown action cannot default to revocation');
await rejects(() => revokeEligibility({ opaque: 'operator-v2' }, { ...revokeCommand, context: { ...revokeCommand.context, operationId: 'bad' } }, dependencies), /INVALID_OPERATION_ID/, 'malformed ID rejected before effects');
assert(Object.isFrozen(recovered), 'recovered admission result is immutable');

console.log(`BLK-002-I3 inactive operator injected tests: ${passed} passed`);
