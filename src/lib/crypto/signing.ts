/**
 * PharmacyFlow Client Cryptographic Signing Engine
 * 
 * Implements deterministic canonical JSON serialization, SHA-256 hashing,
 * Candidate A canonical signing message construction, and WebCrypto P-256 ECDSA signing.
 */

import { arrayBufferToBase64, base64ToUint8Array } from './deviceIdentity';

export interface SyncSigningMessageParams {
  pharmacyId: string;
  deviceId: string;
  clientOpId: string;
  timestamp: string | number;
  nonce: string;
  payloadHash: string;
  path?: string;
}

/**
 * Deterministically canonicalizes any JSON value:
 * 1. Object keys sorted lexicographically
 * 2. Nested objects recursively sorted
 * 3. Array ordering preserved
 * 4. Zero redundant whitespace
 * 5. No mutation of original input object
 */
export const canonicalizeJson = (data: unknown): string => {
  if (data === null || typeof data !== 'object') {
    return JSON.stringify(data);
  }

  if (Array.isArray(data)) {
    return '[' + data.map(canonicalizeJson).join(',') + ']';
  }

  const sortedKeys = Object.keys(data as Record<string, unknown>).sort();
  const pairs = sortedKeys.map((key) => {
    const val = (data as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + canonicalizeJson(val);
  });

  return '{' + pairs.join(',') + '}';
};

/**
 * Computes the lowercase 64-character SHA-256 hexadecimal digest of a UTF-8 string.
 */
export const sha256Hex = async (data: string): Promise<string> => {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();
};

/**
 * Constructs the frozen Candidate A canonical signing message:
 * 
 * PF-V1\n
 * POST\n
 * /sync-push-sale\n
 * <pharmacy_id>\n
 * <device_id>\n
 * <client_op_id>\n
 * <timestamp>\n
 * <nonce>\n
 * <payload_hash>
 * 
 * Invariants:
 * - Exactly 9 LF-separated fields
 * - Single LF separator (0x0A), zero CR (0x0D)
 * - NO trailing newline
 * - Lowercase canonical UUID strings
 * - Unix millisecond integer string timestamp
 * - Lowercase 64-character SHA-256 hex payload hash
 */
export const buildSyncSigningMessage = (params: SyncSigningMessageParams): string => {
  const timestampStr = typeof params.timestamp === 'number'
    ? Math.floor(params.timestamp).toString()
    : params.timestamp.trim();
  const endpointPath = params.path ? params.path.trim() : '/sync-push-sale';

  return [
    'PF-V1',
    'POST',
    endpointPath,
    params.pharmacyId.toLowerCase().trim(),
    params.deviceId.toLowerCase().trim(),
    params.clientOpId.toLowerCase().trim(),
    timestampStr,
    params.nonce.toLowerCase().trim(),
    params.payloadHash.toLowerCase().trim()
  ].join('\n');
};

/**
 * Signs a canonical message string using WebCrypto ECDSA P-256.
 * Returns the raw 64-byte IEEE P1363 signature (32-byte r || 32-byte s).
 */
export const signSyncMessage = async (
  privateKey: CryptoKey,
  canonicalMessage: string
): Promise<Uint8Array> => {
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(canonicalMessage);

  const rawSignatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    privateKey,
    messageBytes
  );

  const signatureBytes = new Uint8Array(rawSignatureBuffer);
  if (signatureBytes.length !== 64) {
    throw new Error(`Unexpected ECDSA signature length: expected 64 bytes (IEEE P1363), received ${signatureBytes.length}`);
  }

  return signatureBytes;
};

/**
 * Encodes the raw 64-byte IEEE P1363 signature into standard Base64 format
 * for transport via the X-Device-Signature HTTP header.
 */
export const signatureToBase64 = (signatureBytes: Uint8Array): string => {
  if (signatureBytes.length !== 64) {
    throw new Error(`Invalid signature length for Base64 encoding: expected 64 bytes, got ${signatureBytes.length}`);
  }
  return arrayBufferToBase64(signatureBytes.buffer as ArrayBuffer);
};

/**
 * Imports an RFC 7468 SPKI PEM string as a WebCrypto CryptoKey (P-256 ECDSA).
 */
export const importPublicKeySpkiPem = async (pem: string): Promise<CryptoKey> => {
  const pemHeader = '-----BEGIN PUBLIC KEY-----';
  const pemFooter = '-----END PUBLIC KEY-----';
  let cleanBase64 = pem.trim();

  if (cleanBase64.includes(pemHeader)) {
    cleanBase64 = cleanBase64
      .replace(pemHeader, '')
      .replace(pemFooter, '')
      .replace(/\s+/g, '');
  }

  const binaryDer = base64ToUint8Array(cleanBase64);

  return await crypto.subtle.importKey(
    'spki',
    binaryDer.buffer as ArrayBuffer,
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    false,
    ['verify']
  );
};

/**
 * Verifies a Base64-encoded IEEE P1363 signature against an authentic canonical message
 * using the registered SPKI PEM public key.
 * This mirrors the Phase 5C server verification routine.
 */
export const verifyDeviceSignature = async (
  publicKeyPem: string,
  signatureBase64: string,
  canonicalMessage: string
): Promise<boolean> => {
  const signatureBytes = base64ToUint8Array(signatureBase64);
  if (signatureBytes.length !== 64) {
    return false;
  }

  const cryptoKey = await importPublicKeySpkiPem(publicKeyPem);
  const encoder = new TextEncoder();
  const messageBytes = encoder.encode(canonicalMessage);

  return await crypto.subtle.verify(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    cryptoKey,
    signatureBytes.buffer as ArrayBuffer,
    messageBytes
  );
};
