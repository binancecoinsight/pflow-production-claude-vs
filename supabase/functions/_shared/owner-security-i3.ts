/**
 * BLK-002-I3 inactive shared façade contracts.
 * No server entrypoint, environment lookup, network client, or credential exists here.
 */

export const I3_CONTRACT_VERSION = 'owner-gateway-operator-v1' as const;

export type PrincipalKind = 'GATEWAY' | 'PLATFORM_OPERATOR';
export type GatewayCapability = 'ELIGIBILITY_RESERVE' | 'IDENTITY_ISSUE' | 'IDENTITY_RECOVER';
export type OperatorPermission = 'ADMISSION_APPROVE' | 'ADMISSION_REPLACE' | 'ADMISSION_REVOKE' | 'ELIGIBILITY_REVOKE';

export interface PresentedCredential {
  opaque: string;
}

export interface VerifiedPrincipal {
  principalId: string;
  kind: PrincipalKind;
  credentialVersion: number;
}

export interface GatewayAuthority {
  requireGateway(credential: PresentedCredential, capability: GatewayCapability): Promise<VerifiedPrincipal>;
}

export interface OperatorAuthority {
  requireOperator(credential: PresentedCredential, permission: OperatorPermission): Promise<VerifiedPrincipal>;
}

export interface CommandContext {
  operationId: string;
  applicantKey: string;
  pharmacyContextId: string;
  contractVersion: typeof I3_CONTRACT_VERSION;
}

export interface OperationIdentity {
  operationId: string;
  action: string;
  principalId: string;
  applicantKey: string;
  pharmacyContextId: string;
  commandFingerprint: string;
}

export interface Applied<T> {
  outcome: 'APPLIED' | 'REPLAY';
  result: T;
}

export const sha256Text = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

/** Byte-length framing is mirrored by private_i3_command_fingerprint_v1 in migration 000031. */
export const frameCommandField = (value: string | null): string =>
  value === null ? '-1:' : `${new TextEncoder().encode(value).length}:${value}`;

export const canonicalCommandText = (fields: readonly (string | null)[]): string =>
  `PF-I3-COMMAND-V1${fields.map((field) => `\n${frameCommandField(field)}`).join('')}`;

export const commandFingerprint = (fields: readonly (string | null)[]): Promise<string> =>
  sha256Text(canonicalCommandText(fields));

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;
export function assertUuid(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error(`INVALID_${name}`);
}
export function assertDigest(value: unknown, name: string): asserts value is string {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`INVALID_${name}`);
}
export function assertText(value: unknown, name: string, max = 256): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) throw new Error(`INVALID_${name}`);
}

export const commandIdentity = async (
  principal: VerifiedPrincipal,
  action: string,
  context: CommandContext,
  effectBearingFields: readonly (string | null)[],
): Promise<OperationIdentity> => ({
  operationId: context.operationId,
  action,
  principalId: principal.principalId,
  applicantKey: context.applicantKey,
  pharmacyContextId: context.pharmacyContextId,
  commandFingerprint: await commandFingerprint([
    context.contractVersion, action, principal.principalId, context.applicantKey,
    context.pharmacyContextId, context.operationId, ...effectBearingFields,
  ]),
});

const clone = <T>(value: T): T => {
  if (value === undefined || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => clone(entry)) as T;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, clone(entry)])) as T;
};

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value as Record<string, unknown>)) freeze(entry);
  }
  return value;
};

export const immutableCopy = <T>(value: T): T => freeze(clone(value));

export class AmbiguousOutcomeError extends Error {
  constructor(message = 'AMBIGUOUS_OUTCOME') {
    super(message);
    this.name = 'AmbiguousOutcomeError';
  }
}
