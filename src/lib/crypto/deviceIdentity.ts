/**
 * PharmacyFlow Client Cryptographic Identity Foundation
 * 
 * Implements NIST P-256 ECDSA device identity generation and public-key SPKI PEM export.
 * 
 * Security Invariants:
 * 1. Private keys are generated with `extractable: false` (W3C WebCrypto standard).
 * 2. Private key raw bytes / PKCS#8 / JWK material is NEVER exported.
 * 3. Private keys are NEVER stored in localStorage, sessionStorage, or custom serialized formats.
 * 4. Private keys are NEVER transmitted to Supabase or any network endpoint.
 * 5. Device IDs are RFC 4122 v4 UUID identifiers, not cryptographic credentials.
 */

export interface DeviceIdentity {
  deviceId: string;
  publicKeyPem: string;
  privateKey: CryptoKey;
  publicKey: CryptoKey;
  createdAt: number;
}

export interface DeviceEnrollmentMetadata {
  device_id: string;
  public_key_pem: string;
  created_at: string;
}

/**
 * Generates an RFC 4122 v4 lowercase UUID for device identification.
 * This is an entity identifier, not a secret or credential.
 */
export const generateDeviceId = (): string => {
  return crypto.randomUUID().toLowerCase();
};

/**
 * Converts an ArrayBuffer to a standard Base64 string.
 */
export const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
};

/**
 * Converts a Base64 string to a Uint8Array.
 */
export const base64ToUint8Array = (base64: string): Uint8Array => {
  const cleaned = base64.replace(/\s+/g, '');
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
};

/**
 * Exports a WebCrypto ECDSA P-256 public key as an RFC 7468 SPKI PEM string.
 * This PEM string is suitable for database registration in `devices.public_key_pem`.
 */
export const exportPublicKeySpkiPem = async (publicKey: CryptoKey): Promise<string> => {
  const spkiDerBuffer = await crypto.subtle.exportKey('spki', publicKey);
  const base64Der = arrayBufferToBase64(spkiDerBuffer);
  
  // Format into standard 64-character wrapped PEM
  const formattedBase64 = base64Der.match(/.{1,64}/g)?.join('\n') || base64Der;
  return `-----BEGIN PUBLIC KEY-----\n${formattedBase64}\n-----END PUBLIC KEY-----`;
};

/**
 * Generates a NIST P-256 ECDSA key pair.
 * 
 * @param extractable Whether the private key can be exported. Defaults to `false`.
 * Enforcing `extractable: false` ensures the browser runtime hardware/software security
 * layer prevents extraction of the private key via `exportKey('pkcs8')`.
 */
export const generateDeviceKeyPair = async (
  extractable: boolean = false
): Promise<CryptoKeyPair> => {
  return await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    extractable,
    ['sign', 'verify']
  );
};

/**
 * Initializes a new client-side device identity in memory.
 * Generates an RFC 4122 v4 device identifier and a non-extractable NIST P-256 key pair.
 */
export const createDeviceIdentity = async (): Promise<DeviceIdentity> => {
  const deviceId = generateDeviceId();
  // Generate non-extractable key pair
  const keyPair = await generateDeviceKeyPair(false);
  const publicKeyPem = await exportPublicKeySpkiPem(keyPair.publicKey);

  return {
    deviceId,
    publicKeyPem,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    createdAt: Date.now()
  };
};

/**
 * Prepares the non-sensitive public metadata required for future device registration
 * with the server-side enrollment gateway.
 */
export const getDeviceEnrollmentPayload = (
  identity: DeviceIdentity
): DeviceEnrollmentMetadata => {
  return {
    device_id: identity.deviceId,
    public_key_pem: identity.publicKeyPem,
    created_at: new Date(identity.createdAt).toISOString()
  };
};

const DEVICE_KEYSTORE_DB_NAME = 'pharmacyflow_device_keystore_v1';
const DEVICE_KEYSTORE_STORE_NAME = 'active_device_identity';
const ACTIVE_DEVICE_KEY = 'active_terminal_identity';

/**
 * Retrieves the effective IDBFactory for keystore storage.
 */
const getKeystoreIdbFactory = (customFactory?: IDBFactory): IDBFactory => {
  if (customFactory) return customFactory;
  if (typeof window !== 'undefined' && window.indexedDB) return window.indexedDB;
  if (typeof globalThis !== 'undefined' && (globalThis as unknown as { indexedDB?: IDBFactory }).indexedDB) {
    return (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB;
  }
  throw new Error('IndexedDB is not available in the current runtime environment.');
};

/**
 * Opens the dedicated device keystore IndexedDB database.
 */
export const openDeviceKeystoreDb = async (customFactory?: IDBFactory): Promise<IDBDatabase> => {
  const factory = getKeystoreIdbFactory(customFactory);
  return new Promise((resolve, reject) => {
    const request = factory.open(DEVICE_KEYSTORE_DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DEVICE_KEYSTORE_STORE_NAME)) {
        db.createObjectStore(DEVICE_KEYSTORE_STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Failed to open device keystore: ${request.error?.message}`));
  });
};

/**
 * Retrieves the currently active local device identity from IndexedDB.
 * Returns null if no device is enrolled on this terminal.
 */
export const getActiveDeviceIdentity = async (customFactory?: IDBFactory): Promise<DeviceIdentity | null> => {
  try {
    const db = await openDeviceKeystoreDb(customFactory);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DEVICE_KEYSTORE_STORE_NAME, 'readonly');
      const store = tx.objectStore(DEVICE_KEYSTORE_STORE_NAME);
      const req = store.get(ACTIVE_DEVICE_KEY);
      req.onsuccess = () => {
        const record = req.result;
        if (!record) {
          resolve(null);
          return;
        }
        resolve({
          deviceId: record.deviceId,
          publicKeyPem: record.publicKeyPem,
          privateKey: record.privateKey,
          publicKey: record.publicKey,
          createdAt: record.createdAt
        });
      };
      req.onerror = () => reject(new Error(`Failed to load device identity: ${req.error?.message}`));
    });
  } catch (err) {
    console.warn('[PharmacyFlow Crypto] Failed to read active device identity from keystore:', err);
    return null;
  }
};

/**
 * Saves the active device identity to IndexedDB using structured cloning.
 * Invariant: Private key remains non-extractable (`extractable: false`).
 */
export const saveActiveDeviceIdentity = async (
  identity: DeviceIdentity,
  customFactory?: IDBFactory
): Promise<void> => {
  const db = await openDeviceKeystoreDb(customFactory);
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DEVICE_KEYSTORE_STORE_NAME, 'readwrite');
    const store = tx.objectStore(DEVICE_KEYSTORE_STORE_NAME);
    const req = store.put({
      key: ACTIVE_DEVICE_KEY,
      deviceId: identity.deviceId,
      publicKeyPem: identity.publicKeyPem,
      privateKey: identity.privateKey,
      publicKey: identity.publicKey,
      createdAt: identity.createdAt
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error(`Failed to save device identity: ${tx.error?.message}`));
  });
};

/**
 * Clears the active device identity from the local keystore (used upon Model B retirement).
 * Invariant: Does NOT delete the offline sales queue or transaction records.
 */
export const clearActiveDeviceIdentity = async (customFactory?: IDBFactory): Promise<void> => {
  try {
    const db = await openDeviceKeystoreDb(customFactory);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(DEVICE_KEYSTORE_STORE_NAME, 'readwrite');
      const store = tx.objectStore(DEVICE_KEYSTORE_STORE_NAME);
      store.delete(ACTIVE_DEVICE_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(new Error(`Failed to clear device identity: ${tx.error?.message}`));
    });
  } catch (err) {
    console.warn('[PharmacyFlow Crypto] Failed to clear device identity:', err);
  }
};

/**
 * Computes a human-readable SHA-256 visual digest of the public key (SPKI PEM)
 * for visual comparison in the admin UI (analogous to SSH key fingerprints).
 * 
 * Invariant: This is ONLY a human verification aid, NOT an attestation,
 * NOT authorization, and NOT a second device identity. Zero browser fingerprinting.
 */
export const computePublicKeyFingerprint = async (publicKeyPem: string): Promise<string> => {
  const cleaned = publicKeyPem
    .replace('-----BEGIN PUBLIC KEY-----', '')
    .replace('-----END PUBLIC KEY-----', '')
    .replace(/\s+/g, '');
  const bytes = base64ToUint8Array(cleaned);
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes as unknown as BufferSource);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const pairs = hex.match(/.{1,2}/g)?.slice(0, 16).join(':') || hex.slice(0, 32);
  return `SHA256:${pairs}`;
};
