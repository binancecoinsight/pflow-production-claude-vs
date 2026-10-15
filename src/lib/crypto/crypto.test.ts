import {
  generateDeviceKeyPair,
  exportPublicKeySpkiPem,
  generateDeviceId,
  createDeviceIdentity,
  getDeviceEnrollmentPayload,
  canonicalizeJson,
  sha256Hex,
  buildSyncSigningMessage,
  signSyncMessage,
  signatureToBase64,
  importPublicKeySpkiPem,
  verifyDeviceSignature
} from './index';

// Import Phase 5C server-side verification functions to prove absolute cryptographic interoperability
import {
  importP256SpkiPem as serverImportP256SpkiPem,
  verifyP256Signature as serverVerifyP256Signature,
  base64ToUint8Array as serverBase64ToUint8Array
} from '../../../supabase/functions/sync-push-sale/index';

async function runTestSuite() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${desc}`);
    } else {
      failed++;
      console.error(`  ✗ FAIL: ${desc}`);
    }
  }

  console.log('--- PHARMACYFLOW PHASE 5D-1 CRYPTOGRAPHIC FOUNDATION TESTS ---');

  // TEST 1 — Key generation
  console.log('\n[Test 1] Key Pair Generation');
  const keyPair = await generateDeviceKeyPair(false);
  assert(keyPair.publicKey !== undefined, 'Public key exists');
  assert(keyPair.privateKey !== undefined, 'Private key exists');
  assert(keyPair.publicKey.algorithm.name === 'ECDSA', 'Key algorithm is ECDSA');
  // @ts-expect-error namedCurve exists on EcKeyAlgorithm
  assert(keyPair.publicKey.algorithm.namedCurve === 'P-256', 'Curve is NIST P-256 / secp256r1');
  assert(keyPair.privateKey.extractable === false, 'Private key is strictly non-extractable');

  // TEST 2 — Private key non-exportability
  console.log('\n[Test 2] Private Key Non-Exportability');
  let exportFailedAsExpected = false;
  try {
    await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  } catch (err: unknown) {
    exportFailedAsExpected = true;
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`    Expected rejection caught: "${msg}"`);
  }
  assert(exportFailedAsExpected, 'Attempt to export private key via pkcs8 is rejected by WebCrypto');

  // TEST 3 — SPKI public key export
  console.log('\n[Test 3] SPKI Public Key Export');
  const pem = await exportPublicKeySpkiPem(keyPair.publicKey);
  assert(pem.startsWith('-----BEGIN PUBLIC KEY-----\n'), 'Contains standard RFC 7468 SPKI header');
  assert(pem.endsWith('\n-----END PUBLIC KEY-----'), 'Contains standard RFC 7468 SPKI footer');
  assert(!pem.includes('\r'), 'Contains zero carriage returns');
  const reimportedKey = await importPublicKeySpkiPem(pem);
  assert(reimportedKey.type === 'public', 'Exported SPKI PEM can be reimported as public CryptoKey');

  // TEST 4 — Device ID
  console.log('\n[Test 4] Device Identifier Generation');
  const devId = generateDeviceId();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  assert(uuidRegex.test(devId), 'Device ID is a valid RFC 4122 UUID v4');
  assert(devId === devId.toLowerCase(), 'Device ID is canonical lowercase');

  // TEST 5 — Canonical JSON
  console.log('\n[Test 5] Deterministic Canonical JSON');
  const originalObj = {
    quantity: 5,
    sale_id: '55555555-5555-4555-8555-555555555555',
    metadata: {
      z_index: 99,
      alpha: 'first',
      nested: {
        b: 2,
        a: 1
      }
    },
    items: ['med_c', 'med_a', 'med_b']
  };
  const inputCopy = JSON.parse(JSON.stringify(originalObj));
  const canonical = canonicalizeJson(originalObj);
  const expectedCanonical = '{"items":["med_c","med_a","med_b"],"metadata":{"alpha":"first","nested":{"a":1,"b":2},"z_index":99},"quantity":5,"sale_id":"55555555-5555-4555-8555-555555555555"}';
  assert(canonical === expectedCanonical, 'Object keys recursively sorted lexicographically');
  assert(JSON.stringify(originalObj) === JSON.stringify(inputCopy), 'Input object was not mutated');

  // TEST 6 — SHA-256
  console.log('\n[Test 6] SHA-256 Payload Hashing');
  const hash = await sha256Hex(canonical);
  assert(hash.length === 64, 'Digest length is exactly 64 characters');
  assert(/^[0-9a-f]{64}$/.test(hash), 'Digest is lowercase hexadecimal');

  // TEST 7 — Canonical signing message (Candidate A)
  console.log('\n[Test 7] Candidate A Canonical Signing Message');
  const pharmacyId = '11111111-1111-4111-8111-111111111111';
  const deviceId = devId;
  const clientOpId = '33333333-3333-4333-8333-333333333333';
  const timestamp = '1775314800000';
  const nonce = '44444444-4444-4444-8444-444444444444';
  const payloadHash = hash;

  const msg = buildSyncSigningMessage({
    pharmacyId,
    deviceId,
    clientOpId,
    timestamp,
    nonce,
    payloadHash
  });

  const lines = msg.split('\n');
  assert(lines.length === 9, 'Message contains exactly 9 LF-separated fields');
  assert(lines[0] === 'PF-V1', 'Line 0: Protocol prefix is PF-V1');
  assert(lines[1] === 'POST', 'Line 1: Method is POST');
  assert(lines[2] === '/sync-push-sale', 'Line 2: Path is /sync-push-sale');
  assert(lines[3] === pharmacyId.toLowerCase(), 'Line 3: Lowercase pharmacy_id');
  assert(lines[4] === deviceId.toLowerCase(), 'Line 4: Lowercase device_id');
  assert(lines[5] === clientOpId.toLowerCase(), 'Line 5: Lowercase client_op_id');
  assert(lines[6] === timestamp, 'Line 6: Unix millisecond timestamp string');
  assert(lines[7] === nonce.toLowerCase(), 'Line 7: Lowercase nonce');
  assert(lines[8] === payloadHash.toLowerCase(), 'Line 8: Lowercase payload_hash');
  assert(!msg.endsWith('\n'), 'No trailing newline at end of message');
  assert(!msg.includes('\r'), 'Zero carriage returns present');

  // TEST 8 — P-256 Signing & IEEE P1363 / Base64 encoding
  console.log('\n[Test 8] P-256 ECDSA Signing (IEEE P1363 Raw 64 Bytes)');
  const signatureBytes = await signSyncMessage(keyPair.privateKey, msg);
  assert(signatureBytes.length === 64, 'Raw signature length is exactly 64 bytes (32-byte r || 32-byte s)');
  const signatureB64 = signatureToBase64(signatureBytes);
  assert(typeof signatureB64 === 'string' && signatureB64.length > 0, 'Signature successfully encoded to Base64');
  const verifiedOnClient = await verifyDeviceSignature(pem, signatureB64, msg);
  assert(verifiedOnClient === true, 'Signature verified successfully using client verification function');

  // TEST 9 — Interoperability with Phase 5C Server Implementation
  console.log('\n[Test 9] Phase 5C Server Gateway Interoperability');
  const serverCryptoKey = await serverImportP256SpkiPem(pem);
  const serverSignatureBytes = serverBase64ToUint8Array(signatureB64);
  const serverVerificationResult = await serverVerifyP256Signature(
    serverCryptoKey,
    serverSignatureBytes,
    msg
  );
  assert(serverVerificationResult === true, 'CRITICAL: Phase 5C server verification function accepts client-generated signature');

  // TEST 10 — Anti-Tampering Checks
  console.log('\n[Test 10] Anti-Tampering Defenses');

  // 10.1 Tampered Pharmacy ID
  const tamperedPharmacyMsg = buildSyncSigningMessage({
    pharmacyId: '99999999-9999-4999-8999-999999999999',
    deviceId,
    clientOpId,
    timestamp,
    nonce,
    payloadHash
  });
  assert(!(await verifyDeviceSignature(pem, signatureB64, tamperedPharmacyMsg)), 'Tampered pharmacy_id is rejected');

  // 10.2 Tampered Device ID
  const tamperedDeviceMsg = buildSyncSigningMessage({
    pharmacyId,
    deviceId: '88888888-8888-4888-8888-888888888888',
    clientOpId,
    timestamp,
    nonce,
    payloadHash
  });
  assert(!(await verifyDeviceSignature(pem, signatureB64, tamperedDeviceMsg)), 'Tampered device_id is rejected');

  // 10.3 Tampered Client Op ID
  const tamperedOpMsg = buildSyncSigningMessage({
    pharmacyId,
    deviceId,
    clientOpId: '77777777-7777-4777-8777-777777777777',
    timestamp,
    nonce,
    payloadHash
  });
  assert(!(await verifyDeviceSignature(pem, signatureB64, tamperedOpMsg)), 'Tampered client_op_id is rejected');

  // 10.4 Tampered Timestamp
  const tamperedTsMsg = buildSyncSigningMessage({
    pharmacyId,
    deviceId,
    clientOpId,
    timestamp: '1775314800001',
    nonce,
    payloadHash
  });
  assert(!(await verifyDeviceSignature(pem, signatureB64, tamperedTsMsg)), 'Tampered timestamp is rejected');

  // 10.5 Tampered Nonce
  const tamperedNonceMsg = buildSyncSigningMessage({
    pharmacyId,
    deviceId,
    clientOpId,
    timestamp,
    nonce: '66666666-6666-4666-8666-666666666666',
    payloadHash
  });
  assert(!(await verifyDeviceSignature(pem, signatureB64, tamperedNonceMsg)), 'Tampered nonce is rejected');

  // 10.6 Tampered Payload Hash
  const tamperedHashMsg = buildSyncSigningMessage({
    pharmacyId,
    deviceId,
    clientOpId,
    timestamp,
    nonce,
    payloadHash: '0000000000000000000000000000000000000000000000000000000000000000'
  });
  assert(!(await verifyDeviceSignature(pem, signatureB64, tamperedHashMsg)), 'Tampered payload_hash is rejected');

  // 10.7 Tampered Payload Object (detects hash divergence)
  const tamperedPayload = { ...originalObj, quantity: 6 };
  const tamperedCanonical = canonicalizeJson(tamperedPayload);
  const tamperedComputedHash = await sha256Hex(tamperedCanonical);
  assert(tamperedComputedHash !== payloadHash, 'Tampered payload produces divergent SHA-256 hash');

  // TEST 11 — High-Level Device Identity Creation & Enrollment Preparation
  console.log('\n[Test 11] High-Level Device Identity Lifecycle');
  const identity = await createDeviceIdentity();
  assert(identity.deviceId.length === 36, 'Identity deviceId is valid length');
  assert(identity.privateKey.extractable === false, 'Identity privateKey is non-extractable');
  assert(identity.publicKeyPem.includes('BEGIN PUBLIC KEY'), 'Identity contains valid SPKI PEM');
  const enrollmentPayload = getDeviceEnrollmentPayload(identity);
  assert(enrollmentPayload.device_id === identity.deviceId, 'Enrollment payload contains device_id');
  assert(enrollmentPayload.public_key_pem === identity.publicKeyPem, 'Enrollment payload contains public_key_pem');
  // Confirm private key is NOT present in enrollment payload
  // @ts-expect-error Checking that private key does not leak
  assert(enrollmentPayload.privateKey === undefined, 'Enrollment payload contains NO private key material');

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-1 CRYPTOGRAPHIC TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTestSuite().catch((err) => {
  console.error(err);
  process.exit(1);
});
