/**
 * BLK-002-I3 inactive injected platform admission/revocation façade.
 * It exposes no HTTP server, environment adapter, database client, or credential.
 */

import {
  I3_CONTRACT_VERSION,
  assertDigest,
  assertText,
  assertUuid,
  commandIdentity,
  immutableCopy,
  sha256Text,
  type Applied,
  type CommandContext,
  type OperationIdentity,
  type OperatorAuthority,
  type OperatorPermission,
  type PresentedCredential,
} from '../_shared/owner-security-i3';

export type AdmissionAction = 'APPROVE' | 'REPLACE' | 'REVOKE';

export interface AdmissionDecisionCommand {
  context: CommandContext;
  action: AdmissionAction;
  decisionId: string;
  normalizedEmail: string;
  reasonCode: string;
  predecessorDecisionId?: string;
}

export interface AdmissionDecisionResult {
  decisionId: string;
  applicantKey: string;
  pharmacyContextId: string;
  state: 'ACTIVE' | 'REVOKED';
  predecessorDecisionId?: string;
}

export interface EligibilityRevocationCommand {
  context: CommandContext;
  revocationId: string;
  eligibilityId: string;
  reasonCode: string;
}

export interface EligibilityRevocationResult {
  revocationId: string;
  eligibilityId: string;
  applicantKey: string;
  pharmacyContextId: string;
  state: 'REVOKED';
}

export interface PlatformAdmissionRepository {
  decideAdmissionAtomic(identity: OperationIdentity, command: AdmissionDecisionCommand): Promise<Applied<AdmissionDecisionResult>>;
  revokeEligibilityAtomic(identity: OperationIdentity, command: EligibilityRevocationCommand): Promise<Applied<EligibilityRevocationResult>>;
  recoverExact<T>(identity: OperationIdentity): Promise<T | null>;
}

export interface PlatformAdmissionDependencies {
  authority: OperatorAuthority;
  repository: PlatformAdmissionRepository;
}

const permissionFor = (action: AdmissionAction): OperatorPermission => {
  switch (action) {
    case 'APPROVE': return 'ADMISSION_APPROVE';
    case 'REPLACE': return 'ADMISSION_REPLACE';
    case 'REVOKE': return 'ADMISSION_REVOKE';
    default: throw new Error('UNKNOWN_ADMISSION_ACTION');
  }
};

const assertContext = (context: CommandContext): void => {
  if (!context || context.contractVersion !== I3_CONTRACT_VERSION) throw new Error('INVALID_COMMAND_CONTEXT');
  assertUuid(context.operationId, 'OPERATION_ID'); assertDigest(context.applicantKey, 'APPLICANT_KEY');
  assertUuid(context.pharmacyContextId, 'PHARMACY_CONTEXT_ID');
};

const admissionBody = (command: AdmissionDecisionCommand): readonly (string | null)[] => [
  command.action, command.decisionId, command.normalizedEmail.trim().toLowerCase(),
  command.reasonCode.trim(), command.predecessorDecisionId ?? null,
];
const revocationBody = (command: EligibilityRevocationCommand): readonly (string | null)[] => [
  command.revocationId, command.eligibilityId, command.reasonCode.trim(),
];
const assertAdmission = (command: AdmissionDecisionCommand): void => {
  assertContext(command.context); permissionFor(command.action); assertUuid(command.decisionId, 'DECISION_ID');
  if (command.predecessorDecisionId !== undefined) assertUuid(command.predecessorDecisionId, 'PREDECESSOR_DECISION_ID');
  if (command.action === 'REPLACE' && !command.predecessorDecisionId) throw new Error('PREDECESSOR_REQUIRED');
  if (command.action === 'APPROVE' && command.predecessorDecisionId) throw new Error('PREDECESSOR_NOT_ALLOWED');
  assertText(command.normalizedEmail, 'EMAIL'); assertText(command.reasonCode, 'REASON_CODE', 120);
};
const assertRevocation = (command: EligibilityRevocationCommand): void => {
  assertContext(command.context); assertUuid(command.revocationId, 'REVOCATION_ID');
  assertUuid(command.eligibilityId, 'ELIGIBILITY_ID'); assertText(command.reasonCode, 'REASON_CODE', 120);
};

export async function decideAdmission(
  credential: PresentedCredential,
  command: AdmissionDecisionCommand,
  dependencies: PlatformAdmissionDependencies,
): Promise<Applied<AdmissionDecisionResult>> {
  assertAdmission(command);
  if (await sha256Text(command.normalizedEmail.trim().toLowerCase()) !== command.context.applicantKey) throw new Error('APPLICANT_KEY_CONFLICT');
  const principal = await dependencies.authority.requireOperator(credential, permissionFor(command.action));
  const action = `ADMISSION_${command.action}`;
  const identity = await commandIdentity(principal, action, command.context, admissionBody(command));
  return immutableCopy(await dependencies.repository.decideAdmissionAtomic(identity, immutableCopy(command)));
}

export async function recoverAdmissionDecision(
  credential: PresentedCredential,
  command: AdmissionDecisionCommand,
  dependencies: PlatformAdmissionDependencies,
): Promise<AdmissionDecisionResult> {
  assertAdmission(command);
  if (await sha256Text(command.normalizedEmail.trim().toLowerCase()) !== command.context.applicantKey) throw new Error('APPLICANT_KEY_CONFLICT');
  const principal = await dependencies.authority.requireOperator(credential, permissionFor(command.action));
  const identity = await commandIdentity(principal, `ADMISSION_${command.action}`, command.context, admissionBody(command));
  const result = await dependencies.repository.recoverExact<AdmissionDecisionResult>(identity);
  if (!result) throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND');
  return immutableCopy(result);
}

export async function revokeEligibility(
  credential: PresentedCredential,
  command: EligibilityRevocationCommand,
  dependencies: PlatformAdmissionDependencies,
): Promise<Applied<EligibilityRevocationResult>> {
  assertRevocation(command);
  const principal = await dependencies.authority.requireOperator(credential, 'ELIGIBILITY_REVOKE');
  const identity = await commandIdentity(principal, 'ELIGIBILITY_REVOKE', command.context, revocationBody(command));
  return immutableCopy(await dependencies.repository.revokeEligibilityAtomic(identity, immutableCopy(command)));
}

export async function recoverEligibilityRevocation(
  credential: PresentedCredential,
  command: EligibilityRevocationCommand,
  dependencies: PlatformAdmissionDependencies,
): Promise<EligibilityRevocationResult> {
  assertRevocation(command);
  const principal = await dependencies.authority.requireOperator(credential, 'ELIGIBILITY_REVOKE');
  const identity = await commandIdentity(principal, 'ELIGIBILITY_REVOKE', command.context, revocationBody(command));
  const result = await dependencies.repository.recoverExact<EligibilityRevocationResult>(identity);
  if (!result) throw new Error('AUTHORITATIVE_RESULT_NOT_FOUND');
  return immutableCopy(result);
}
