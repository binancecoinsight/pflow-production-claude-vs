import {
  GatewayProviderSecurityContract,
  MemoryAuditBoundary,
  MemoryTrustedAuthorityBoundary,
  commandFingerprint,
  type AdmissionResult,
  type ConsumeEligibilityCommand,
  type EligibilityResult,
  type OperationBinding,
  type OperatorPermission,
  type PresentedCredential,
  type SecurityCommand,
} from './blk002-i2-security-contract';

let passed = 0;
const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  passed += 1;
};
const rejects = (work: () => unknown, pattern: RegExp, message: string): void => {
  try { work(); } catch (error) {
    assert(pattern.test(error instanceof Error ? error.message : String(error)), message);
    return;
  }
  throw new Error(`FAIL: ${message}`);
};

const allOperatorPermissions = new Set<OperatorPermission>(['ADMISSION_APPROVE', 'ADMISSION_REPLACE', 'ADMISSION_REVOKE', 'ELIGIBILITY_REVOKE']);
const authority = new MemoryTrustedAuthorityBoundary();
const operatorV1 = { token: 'operator-1-v1' };
const operatorRevoked = { token: 'operator-revoked' };
const gatewayV2 = { token: 'gateway-1-v2' };
const gatewayV3 = { token: 'gateway-1-v3' };
const gatewayRevoked = { token: 'gateway-revoked' };
const applicant1 = { token: 'applicant-1' };
const applicant2 = { token: 'applicant-2' };
const applicantOther = { token: 'applicant-other' };
authority.register({ token: operatorV1.token, actorId: 'operator-1', actorKind: 'OPERATOR', credentialVersion: 1, active: true, permissions: allOperatorPermissions });
authority.register({ token: operatorRevoked.token, actorId: 'operator-revoked', actorKind: 'OPERATOR', credentialVersion: 1, active: false, permissions: allOperatorPermissions });
authority.register({ token: gatewayV2.token, actorId: 'gateway-1', actorKind: 'GATEWAY', credentialVersion: 2, active: true, capabilities: new Set(['ELIGIBILITY_RESERVE', 'IDENTITY_ISSUE', 'IDENTITY_RECOVER']) });
authority.register({ token: gatewayRevoked.token, actorId: 'gateway-1', actorKind: 'GATEWAY', credentialVersion: 2, active: false, capabilities: new Set(['ELIGIBILITY_RESERVE', 'IDENTITY_ISSUE', 'IDENTITY_RECOVER']) });
authority.register({ token: applicant1.token, actorId: 'applicant-1', actorKind: 'APPLICANT', credentialVersion: 1, active: true });
authority.register({ token: applicant2.token, actorId: 'applicant-2', actorKind: 'APPLICANT', credentialVersion: 1, active: true });
authority.register({ token: applicantOther.token, actorId: 'applicant-other', actorKind: 'APPLICANT', credentialVersion: 1, active: true });
const audit = new MemoryAuditBoundary();
const model = new GatewayProviderSecurityContract(authority, audit);

const binding = (operationId: string, applicantId = 'applicant-1', pharmacyContext = 'prospective-pharmacy-1'): OperationBinding => ({
  operationId, applicantId, pharmacyContext, contractVersion: 'blk-002-i2-v1',
});
const approve = (operationId: string, admissionId: string, applicantId = 'applicant-1', pharmacyContext = 'prospective-pharmacy-1') => ({
  action: 'ADMISSION_APPROVE' as const, binding: binding(operationId, applicantId, pharmacyContext), admissionId, decisionEvidenceId: `evidence-${admissionId}`,
});
const reserve = (operationId: string, admissionId: string, eligibilityId: string, applicantId = 'applicant-1', pharmacyContext = 'prospective-pharmacy-1') => ({
  action: 'ELIGIBILITY_RESERVE' as const, binding: binding(operationId, applicantId, pharmacyContext), admissionId, eligibilityId,
});
const issue = (operationId: string, eligibilityId: string, providerOperationId: string, applicantId = 'applicant-1', pharmacyContext = 'prospective-pharmacy-1') => ({
  action: 'IDENTITY_ISSUE' as const, binding: binding(operationId, applicantId, pharmacyContext), eligibilityId, providerOperationId,
});

// Atomic effects + result + audit: injected audit failure commits nothing and cannot falsely replay.
audit.failNext = true;
const atomicApproval = approve('op-atomic-admit', 'admission-atomic', 'applicant-atomic', 'context-atomic');
rejects(() => model.approveAdmission(operatorV1, atomicApproval), /AUDIT_PREPARE_FAILED/, 'audit failure rejects the unit of work');
assert(model.admissionState('admission-atomic') === undefined && model.operationCount() === 0 && model.auditEvents().length === 0, 'audit failure leaves no state, operation result or audit');
rejects(() => model.recoverOperation(operatorV1, atomicApproval), /AUTHORITATIVE_RESULT_NOT_FOUND/, 'audit failure creates no false successful replay');
assert(model.approveAdmission(operatorV1, atomicApproval).outcome === 'APPLIED', 'same operation applies after audit boundary recovers');
assert(model.auditEvents().length === 1 && model.operationCount() === 1, 'effect, result and audit commit together');

// ADM-01 current trusted authorization: caller cannot assert actorId; revoked/wrong actors fail.
rejects(() => model.approveAdmission(applicant1, approve('op-self-admit', 'admission-self')), /CURRENT_AUTHORITY_DENIED/, 'applicant cannot self-admit');
rejects(() => model.approveAdmission(operatorRevoked, approve('op-revoked-admit', 'admission-revoked')), /CURRENT_AUTHORITY_DENIED/, 'revoked operator cannot approve');

// Canonical typed command hashing binds effect-bearing arguments, regardless of any claimed hash outside the type.
const canonical = approve('op-canonical', 'admission-canonical', 'applicant-canonical', 'context-canonical');
const claimedHashA = { ...canonical, claimedPayloadHash: 'same-untrusted-value' };
const claimedHashB = { ...canonical, admissionId: 'admission-canonical-changed', claimedPayloadHash: 'same-untrusted-value' };
assert(commandFingerprint(claimedHashA, 'operator-1') !== commandFingerprint(claimedHashB, 'operator-1'), 'changed typed arguments conflict despite unchanged claimed hash');
const extraClaimA = { ...canonical, claimedPayloadHash: 'claim-a' };
const extraClaimB = { ...canonical, claimedPayloadHash: 'claim-b' };
assert(commandFingerprint(extraClaimA, 'operator-1') === commandFingerprint(extraClaimB, 'operator-1'), 'untyped caller hash is ignored rather than trusted');
model.approveAdmission(operatorV1, canonical);
rejects(() => model.approveAdmission(operatorV1, { ...canonical, admissionId: 'admission-canonical-changed' }), /OPERATION_CONFLICT/, 'same operation ID with changed target conflicts');
assert(model.approveAdmission(operatorV1, canonical).outcome === 'REPLAY', 'exact typed command replay succeeds');
rejects(() => model.approveAdmission(operatorV1, approve('op-duplicate-admission', 'admission-canonical', 'applicant-new', 'context-new')), /DUPLICATE_ADMISSION_ID/, 'duplicate admission ID is rejected');

// Prepare first eligibility and verify gateway/applicant/context separation.
model.approveAdmission(operatorV1, approve('op-admit-1', 'admission-1'));
const reserve1 = reserve('op-reserve-1', 'admission-1', 'eligibility-1');
model.reserveEligibility(gatewayV2, reserve1);
rejects(() => model.reserveEligibility(applicant1, reserve('op-confused', 'admission-1', 'eligibility-x')), /CURRENT_AUTHORITY_DENIED/, 'applicant credential cannot act as gateway');
rejects(() => model.reserveEligibility(gatewayV2, reserve('op-cross-context', 'admission-1', 'eligibility-x', 'applicant-1', 'other-context')), /ADMISSION_BINDING_CONFLICT/, 'cross-context reservation is rejected');
rejects(() => model.reserveEligibility(gatewayV2, reserve('op-duplicate-eligibility', 'admission-1', 'eligibility-1', 'other-applicant', 'other-context')), /DUPLICATE_ELIGIBILITY_ID/, 'duplicate eligibility ID is rejected before overwrite');

// Rotation preserves stable operation identity, but all execution/recovery rechecks current action authority.
authority.register({ token: gatewayV2.token, actorId: 'gateway-1', actorKind: 'GATEWAY', credentialVersion: 2, active: false, capabilities: new Set(['ELIGIBILITY_RESERVE', 'IDENTITY_ISSUE', 'IDENTITY_RECOVER']) });
authority.register({ token: gatewayV3.token, actorId: 'gateway-1', actorKind: 'GATEWAY', credentialVersion: 3, active: true, capabilities: new Set(['ELIGIBILITY_RESERVE', 'IDENTITY_ISSUE', 'IDENTITY_RECOVER']) });
assert(model.recoverOperation(gatewayV3, reserve1).id === 'eligibility-1', 'rotated current gateway credential recovers stable operation identity');
rejects(() => model.recoverOperation(gatewayV2, reserve1), /CURRENT_AUTHORITY_DENIED/, 'rotated old gateway credential cannot recover');
rejects(() => model.recoverOperation(gatewayRevoked, reserve1), /CURRENT_AUTHORITY_DENIED/, 'revoked gateway cannot recover');

const issue1 = issue('op-issue-1', 'eligibility-1', 'provider-op-1');
model.markIssued(gatewayV3, issue1);
assert(model.recoverOperation<EligibilityResult>(gatewayV3, issue1).providerOperationId === 'provider-op-1', 'current gateway with recovery capability recovers issuance');
authority.register({ token: 'gateway-no-recover', actorId: 'gateway-1', actorKind: 'GATEWAY', credentialVersion: 4, active: true, capabilities: new Set(['IDENTITY_ISSUE']) });
rejects(() => model.recoverOperation({ token: 'gateway-no-recover' }, issue1), /CURRENT_AUTHORITY_DENIED/, 'issuance recovery requires action-specific recovery capability');

// Operation recovery rejects action mismatch before returning evidence.
const actionMismatch: SecurityCommand = { action: 'ELIGIBILITY_REVOKE', binding: issue1.binding, eligibilityId: 'eligibility-1', reasonCode: 'SECURITY' };
rejects(() => model.recoverOperation(operatorV1, actionMismatch), /ACTION_MISMATCH/, 'recovery rejects action mismatch');

// REV-01 admission revocation does not revoke existing eligibility.
const revokeAdmission = { action: 'ADMISSION_REVOKE' as const, binding: binding('op-revoke-admission'), admissionId: 'admission-1', reasonCode: 'POLICY_REVOKED' };
model.revokeAdmission(operatorV1, revokeAdmission);
assert(model.eligibilityState('eligibility-1') === 'ISSUED', 'admission revocation preserves issued eligibility');
rejects(() => model.reserveEligibility(gatewayV3, reserve('op-after-admission-revoke', 'admission-1', 'eligibility-2')), /ADMISSION_NOT_ACTIVE/, 'revoked admission prevents new reservation');

// Explicit eligibility revocation blocks consumption; recovery also rechecks operator authority.
const revokeEligibility = { action: 'ELIGIBILITY_REVOKE' as const, binding: binding('op-revoke-eligibility'), eligibilityId: 'eligibility-1', reasonCode: 'SECURITY_REVOKED' };
model.revokeEligibility(operatorV1, revokeEligibility);
assert(model.recoverOperation(operatorV1, revokeEligibility).state === 'REVOKED', 'authorized operator recovers exact revocation');
authority.register({ token: operatorV1.token, actorId: 'operator-1', actorKind: 'OPERATOR', credentialVersion: 1, active: false, permissions: allOperatorPermissions });
rejects(() => model.recoverOperation(operatorV1, revokeEligibility), /CURRENT_AUTHORITY_DENIED/, 'revoked operator cannot recover privileged operation result');
authority.register({ token: 'operator-1-v2', actorId: 'operator-1', actorKind: 'OPERATOR', credentialVersion: 2, active: true, permissions: allOperatorPermissions });
const operatorV2 = { token: 'operator-1-v2' };
rejects(() => model.consumeEligibility(applicant1, { action: 'ELIGIBILITY_CONSUME', binding: binding('op-consume-revoked'), eligibilityId: 'eligibility-1', canonicalResult: { pharmacyId: 'no' } }), /ELIGIBILITY_REVOKED/, 'explicit eligibility revocation prevents consumption');

// Replacement binds predecessor, replacement and evidence; changed predecessor with the same operation conflicts.
model.approveAdmission(operatorV2, approve('op-admit-2', 'admission-2', 'applicant-2', 'context-2'));
const replace = { action: 'ADMISSION_REPLACE' as const, binding: binding('op-replace-2', 'applicant-2', 'context-2'), predecessorAdmissionId: 'admission-2', replacementAdmissionId: 'admission-3', decisionEvidenceId: 'replacement-evidence-3' };
model.replaceAdmission(operatorV2, replace);
assert(model.recoverOperation<AdmissionResult>(operatorV2, replace).replacesAdmissionId === 'admission-2', 'authorized replacement recovery preserves predecessor link');
rejects(() => model.replaceAdmission(operatorV2, { ...replace, predecessorAdmissionId: 'different-predecessor' }), /OPERATION_CONFLICT/, 'changed predecessor conflicts under same operation ID');
rejects(() => model.replaceAdmission(operatorV2, { ...replace, binding: binding('op-replace-duplicate', 'applicant-2', 'context-2'), predecessorAdmissionId: 'admission-3', replacementAdmissionId: 'admission-3' }), /DUPLICATE_ADMISSION_ID/, 'replacement cannot reuse predecessor/result ID');

// Authorized consumed-result recovery is applicant-only, context-bound and deeply immutable.
const reserve3 = reserve('op-reserve-3', 'admission-3', 'eligibility-3', 'applicant-2', 'context-2');
model.reserveEligibility(gatewayV3, reserve3);
const issue3 = issue('op-issue-3', 'eligibility-3', 'provider-op-3', 'applicant-2', 'context-2');
model.markIssued(gatewayV3, issue3);
rejects(() => model.markIssued(gatewayV3, issue('op-duplicate-provider', 'eligibility-1', 'provider-op-3')), /DUPLICATE_PROVIDER_OPERATION_ID/, 'provider operation ID cannot bind two eligibilities');
const consume3: ConsumeEligibilityCommand = {
  action: 'ELIGIBILITY_CONSUME',
  binding: binding('op-consume-3', 'applicant-2', 'context-2'),
  eligibilityId: 'eligibility-3',
  canonicalResult: { pharmacyId: 'pharmacy-3', nested: { membershipId: 'membership-3' } },
};
const consumed = model.consumeEligibility(applicant2, consume3);
assert(consumed.outcome === 'APPLIED' && (consumed.result.nested as { membershipId: string }).membershipId === 'membership-3', 'applicant consumes exact issued eligibility');
rejects(() => { (consumed.result.nested as { membershipId: string }).membershipId = 'mutated'; }, /read only|extensible|property|assign/i, 'returned nested canonical result is immutable');
const recoveredConsumed = model.recoverOperation<Readonly<Record<string, unknown>>>(applicant2, consume3);
assert((recoveredConsumed.nested as { membershipId: string }).membershipId === 'membership-3', 'authorized applicant recovers unmodified consumed result');
rejects(() => model.recoverOperation(applicantOther, consume3), /CURRENT_AUTHORITY_DENIED/, 'cross-subject applicant recovery is denied');
rejects(() => model.recoverOperation(applicant2, { ...consume3, binding: { ...consume3.binding, pharmacyContext: 'other-context' } }), /OPERATION_CONFLICT/, 'cross-context recovery is denied');
rejects(() => model.recoverOperation(operatorV2, consume3), /CURRENT_AUTHORITY_DENIED/, 'operator cannot recover applicant-only consumed result');
rejects(() => model.consumeEligibility(applicant2, { ...consume3, canonicalResult: { pharmacyId: 'changed' } }), /OPERATION_CONFLICT/, 'changed effect-bearing result conflicts without caller hash');
rejects(() => model.consumeEligibility(applicant2, { ...consume3, binding: { ...consume3.binding, operationId: 'op-new-consume-3' } }), /ELIGIBILITY_NOT_ISSUED/, 'new operation cannot duplicate consumed entitlement');
rejects(() => model.revokeEligibility(operatorV2, { action: 'ELIGIBILITY_REVOKE', binding: binding('op-revoke-consumed', 'applicant-2', 'context-2'), eligibilityId: 'eligibility-3', reasonCode: 'TOO_LATE' }), /CONSUMED_IMMUTABLE/, 'consumed history cannot be revoked or rewritten');

// Sequential race model only: serialized order is deterministic, not PostgreSQL concurrency proof.
model.approveAdmission(operatorV2, approve('op-admit-race-a', 'admission-race-a', 'race-a', 'context-race-a'));
model.revokeAdmission(operatorV2, { action: 'ADMISSION_REVOKE', binding: binding('op-revoke-race-a', 'race-a', 'context-race-a'), admissionId: 'admission-race-a', reasonCode: 'FIRST' });
rejects(() => model.reserveEligibility(gatewayV3, reserve('op-reserve-race-a', 'admission-race-a', 'eligibility-race-a', 'race-a', 'context-race-a')), /ADMISSION_NOT_ACTIVE/, 'sequential revocation-first order denies reservation');
model.approveAdmission(operatorV2, approve('op-admit-race-b', 'admission-race-b', 'race-b', 'context-race-b'));
model.reserveEligibility(gatewayV3, reserve('op-reserve-race-b', 'admission-race-b', 'eligibility-race-b', 'race-b', 'context-race-b'));
model.revokeAdmission(operatorV2, { action: 'ADMISSION_REVOKE', binding: binding('op-revoke-race-b', 'race-b', 'context-race-b'), admissionId: 'admission-race-b', reasonCode: 'SECOND' });
assert(model.eligibilityState('eligibility-race-b') === 'RESERVED', 'sequential reservation-first order preserves independent eligibility');

const events = model.auditEvents();
assert(events.every((event, index) => event.sequence === index + 1 && /^[0-9a-f]{64}$/.test(event.commandFingerprint)), 'audit evidence is ordered and carries computed SHA-256 command fingerprints');
assert(events.length === model.operationCount(), 'every committed operation has exactly one committed audit event');
assert(events.filter((event) => event.operationId === 'op-canonical').length === 1, 'exact replay does not duplicate effects or audit evidence');

console.log(`BLK-002-I2 corrected gateway/provider injected contract tests: ${passed} passed`);
