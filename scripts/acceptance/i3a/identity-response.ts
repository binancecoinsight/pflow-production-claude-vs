export interface PendingIdentityResponseExpectation {
  operationId: string;
  principalId: string;
  applicantKey: string;
  pharmacyContextId: string;
  commandFingerprint: string;
  originalCredentialVersion: number;
  providerOperationId: string;
}

const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;

const own = (value: Record<string, unknown>, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

const exactString = (value: Record<string, unknown>, key: string, expected: string): boolean =>
  own(value, key) && typeof value[key] === 'string' && value[key] === expected;

export function assertPendingIdentityResponse(
  value: unknown,
  expected: PendingIdentityResponseExpectation,
): Readonly<Record<string, unknown>> {
  const payload = record(value);
  if (!payload) throw new Error('ASSERT_IDENTITY_RESPONSE: top-level object required');
  if (!exactString(payload, 'state', 'PROVIDER_PENDING'))
    throw new Error('ASSERT_IDENTITY_RESPONSE: mandatory state missing, mistyped or incorrect');
  if (!own(payload, 'result') || payload.result !== null)
    throw new Error('ASSERT_IDENTITY_RESPONSE: pending result must be present JSON null');
  if (!own(payload, 'original_credential_version')
    || typeof payload.original_credential_version !== 'number'
    || !Number.isInteger(payload.original_credential_version)
    || payload.original_credential_version !== expected.originalCredentialVersion)
    throw new Error('ASSERT_IDENTITY_RESPONSE: original credential version missing, mistyped or incorrect');

  const identity = record(payload.original_identity);
  if (!identity
    || !exactString(identity, 'operation_id', expected.operationId)
    || !exactString(identity, 'action', 'IDENTITY_ISSUE')
    || !exactString(identity, 'principal_id', expected.principalId)
    || !exactString(identity, 'applicant_key', expected.applicantKey)
    || !exactString(identity, 'pharmacy_context_id', expected.pharmacyContextId)
    || !exactString(identity, 'command_fingerprint', expected.commandFingerprint))
    throw new Error('ASSERT_IDENTITY_RESPONSE: original identity missing, mistyped or incorrect');

  const command = record(payload.authoritative_command);
  if (!command || !exactString(command, 'provider_operation_id', expected.providerOperationId))
    throw new Error('ASSERT_IDENTITY_RESPONSE: provider operation binding missing, mistyped or incorrect');
  return Object.freeze(payload);
}
