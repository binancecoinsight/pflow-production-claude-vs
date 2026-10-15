import {
  canonicalizeJson,
  computeSha256Hex,
  buildCanonicalSigningMessage,
  importP256SpkiPem,
  verifyP256Signature,
  base64ToUint8Array,
  isValidUuid,
  executeGatewayPipeline,
  GatewayPipelineDeps
} from './index';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function exportSpkiPem(key: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', key);
  const b64 = arrayBufferToBase64(exported);
  return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----`;
}

async function runTests() {
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

  console.log('--- Starting Sync-Push-Sale Gateway Security & Cryptographic Tests ---');

  // TEST 1: UUID Validation
  const validUuid = '12345678-1234-4234-8234-123456789abc';
  assert(isValidUuid(validUuid), 'Valid UUID passes regex');
  assert(!isValidUuid('not-a-uuid'), 'Invalid string rejected as UUID');
  assert(!isValidUuid('12345678-1234-1234-1234-123456789abz'), 'Non-hex char in UUID rejected');

  // TEST 2: Canonical JSON Serialization (Recursion, Key Sorting, Zero Whitespace)
  const testObj = {
    z: 1,
    a: 'test',
    m: {
      y: 2,
      x: 'inner'
    },
    list: [3, 2, 1]
  };
  const canonicalJson = canonicalizeJson(testObj);
  const expectedJson = '{"a":"test","list":[3,2,1],"m":{"x":"inner","y":2},"z":1}';
  assert(canonicalJson === expectedJson, 'Canonical JSON recursively sorts keys and preserves array order');

  // TEST 3: SHA-256 Hash Computation
  const hash = await computeSha256Hex(expectedJson);
  assert(hash.length === 64, 'SHA-256 hex digest is exactly 64 characters');
  assert(/^[0-9a-f]{64}$/.test(hash), 'SHA-256 digest is valid lowercase hex');

  // TEST 4: Frozen Canonical Signing Message Format (Candidate A Vector)
  const pharmacyId = '11111111-1111-4111-8111-111111111111';
  const deviceId = '22222222-2222-4222-8222-222222222222';
  const branchId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const clientOpId = '33333333-3333-4333-8333-333333333333';
  const timestamp = Date.now().toString();
  const nonce = '44444444-4444-4444-8444-444444444444';
  const saleId = '55555555-5555-4555-8555-555555555555';
  const productId = '66666666-6666-4666-8666-666666666666';
  const batchId = '77777777-7777-4777-8777-777777777777';
  const quantity = 5;
  const payloadHash = hash;

  const msg = buildCanonicalSigningMessage(
    pharmacyId,
    deviceId,
    clientOpId,
    timestamp,
    nonce,
    payloadHash
  );

  const lines = msg.split('\n');
  assert(lines.length === 9, 'Canonical signing message contains exactly 9 LF-separated fields');
  assert(lines[0] === 'PF-V1', 'Line 0 is PF-V1');
  assert(lines[1] === 'POST', 'Line 1 is POST');
  assert(lines[2] === '/sync-push-sale', 'Line 2 is /sync-push-sale');
  assert(lines[3] === pharmacyId, 'Line 3 is lowercase pharmacy_id');
  assert(lines[4] === deviceId, 'Line 4 is lowercase device_id');
  assert(lines[5] === clientOpId, 'Line 5 is lowercase client_op_id');
  assert(lines[6] === timestamp, 'Line 6 is Unix millisecond timestamp string');
  assert(lines[7] === nonce, 'Line 7 is lowercase nonce');
  assert(lines[8] === payloadHash, 'Line 8 is lowercase payload_hash');
  assert(!msg.endsWith('\n'), 'Canonical message contains NO trailing newline');
  assert(!msg.includes('\r'), 'Canonical message contains NO carriage returns');

  // TEST 5: Real WebCrypto P-256 ECDSA Key Generation & SPKI PEM Export/Import
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );

  const spkiPem = await exportSpkiPem(keyPair.publicKey);
  const importedPublicKey = await importP256SpkiPem(spkiPem);
  assert(importedPublicKey.type === 'public', 'Successfully imported SPKI PEM into WebCrypto public key');

  // TEST 6: Sign Canonical Message with WebCrypto ECDSA (Raw IEEE P1363 64-byte signature)
  const encoder = new TextEncoder();
  const rawSignatureBuffer = await crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    keyPair.privateKey,
    encoder.encode(msg)
  );

  const rawSignatureBytes = new Uint8Array(rawSignatureBuffer);
  assert(rawSignatureBytes.length === 64, 'Raw WebCrypto ECDSA signature is exactly 64 bytes (IEEE P1363)');

  // TEST 7: Signature Verification on Authentic Canonical Message
  const valid = await verifyP256Signature(importedPublicKey, rawSignatureBytes, msg);
  assert(valid === true, 'Signature verification succeeds on authentic canonical message');

  // TEST 8: Anti-Tampering Checks
  const tamperedTimestampMsg = buildCanonicalSigningMessage(pharmacyId, deviceId, clientOpId, '1775314800001', nonce, payloadHash);
  assert(!(await verifyP256Signature(importedPublicKey, rawSignatureBytes, tamperedTimestampMsg)), 'Tampered timestamp rejects signature');

  const tamperedPharmacyMsg = buildCanonicalSigningMessage('99999999-9999-4999-8999-999999999999', deviceId, clientOpId, timestamp, nonce, payloadHash);
  assert(!(await verifyP256Signature(importedPublicKey, rawSignatureBytes, tamperedPharmacyMsg)), 'Cross-tenant tampered pharmacy_id rejects signature');

  const tamperedOpMsg = buildCanonicalSigningMessage(pharmacyId, deviceId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', timestamp, nonce, payloadHash);
  assert(!(await verifyP256Signature(importedPublicKey, rawSignatureBytes, tamperedOpMsg)), 'Tampered client_op_id rejects signature');

  const tamperedHashMsg = buildCanonicalSigningMessage(pharmacyId, deviceId, clientOpId, timestamp, nonce, '0000000000000000000000000000000000000000000000000000000000000000');
  assert(!(await verifyP256Signature(importedPublicKey, rawSignatureBytes, tamperedHashMsg)), 'Altered payload hash rejects signature');

  // Base64 Signature
  const validBase64Signature = arrayBufferToBase64(rawSignatureBuffer);
  const invalidBase64Signature = arrayBufferToBase64(new Uint8Array(64).fill(0xAA).buffer);

  // Helper to create test HTTP Request
  function makeRequest(sig: string, customPayloadHash?: string) {
    const body = {
      pharmacy_id: pharmacyId,
      device_id: deviceId,
      branch_id: branchId,
      client_op_id: clientOpId,
      timestamp: timestamp,
      nonce: nonce,
      sale_id: saleId,
      product_id: productId,
      batch_id: batchId,
      quantity: quantity,
      payload: testObj,
      payload_hash: customPayloadHash || payloadHash
    };
    return new Request('https://test/sync-push-sale', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer valid.jwt.token',
        'X-Device-Signature': sig,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  // --- SECURITY CORRECTION TESTS (PIPELINE EXECUTION ORDER) ---
  console.log('\n--- Pipeline Execution Order & Nonce-Burning DoS Protection Tests ---');

  // TEST 9: Invalid signature does NOT consume a nonce, and does NOT invoke private RPC
  let nonceConsumeCallCount = 0;
  let rpcCallCount = 0;

  const mockDeps: GatewayPipelineDeps = {
    getUser: async () => ({ user: { id: 'user-123' }, error: null }),
    getPharmacyMember: async () => ({ id: 'mem-123', role: 'PHARMACIST', status: 'ACTIVE' }),
    getDevice: async () => ({
      id: deviceId,
      pharmacy_id: pharmacyId,
      branch_id: branchId,
      status: 'ACTIVE',
      public_key_pem: spkiPem
    }),
    consumeNonce: async () => {
      nonceConsumeCallCount++;
      return true;
    },
    ingestStock: async () => {
      rpcCallCount++;
      return { operation_status: 'COMMITTED', new_stock: 10 };
    }
  };

  const invalidSigReq = makeRequest(invalidBase64Signature);
  const invalidSigRes = await executeGatewayPipeline(invalidSigReq, mockDeps);
  assert(invalidSigRes.status === 401, 'Request with invalid signature returns 401 Unauthorized');
  assert(nonceConsumeCallCount === 0, 'CRITICAL: Invalid signature did NOT consume the nonce (callCount === 0)');
  assert(rpcCallCount === 0, 'CRITICAL: Private RPC was NOT called when signature failed (callCount === 0)');

  // TEST 10: Legitimate request with valid signature consumes nonce exactly once and invokes private RPC
  const validSigReq = makeRequest(validBase64Signature);
  const validSigRes = await executeGatewayPipeline(validSigReq, mockDeps);
  assert(validSigRes.status === 200, 'Request with valid signature returns 200 OK');
  assert(nonceConsumeCallCount === 1, 'CRITICAL: Valid signature consumed the nonce exactly once (callCount === 1)');
  assert(rpcCallCount === 1, 'CRITICAL: Private RPC was invoked after successful signature and nonce consumption');

  // TEST 11: Replayed valid request fails because the nonce is already consumed in DB
  const replayDeps: GatewayPipelineDeps = {
    ...mockDeps,
    consumeNonce: async () => {
      // Simulating database return: nonce already consumed
      return false;
    },
    ingestStock: async () => {
      rpcCallCount++;
      return { operation_status: 'COMMITTED' };
    }
  };
  const replayedReq = makeRequest(validBase64Signature);
  const replayedRes = await executeGatewayPipeline(replayedReq, replayDeps);
  assert(replayedRes.status === 401, 'Replayed request with already-consumed nonce returns 401');
  assert(rpcCallCount === 1, 'CRITICAL: Private RPC was NOT invoked for replayed request');

  // TEST 12: Two concurrent valid requests using the same nonce result in exactly ONE successful consumption
  const activeNonces = new Set<string>();
  let concurrentRpcCalls = 0;

  const atomicDbDeps: GatewayPipelineDeps = {
    ...mockDeps,
    consumeNonce: async (n) => {
      // Simulates PostgreSQL atomic INSERT ON CONFLICT DO NOTHING
      if (activeNonces.has(n)) {
        return false; // Already consumed
      }
      activeNonces.add(n);
      return true; // Successfully consumed
    },
    ingestStock: async () => {
      concurrentRpcCalls++;
      return { operation_status: 'COMMITTED' };
    }
  };

  const reqA = makeRequest(validBase64Signature);
  const reqB = makeRequest(validBase64Signature);

  const [resA, resB] = await Promise.all([
    executeGatewayPipeline(reqA, atomicDbDeps),
    executeGatewayPipeline(reqB, atomicDbDeps)
  ]);

  const successCount = [resA.status, resB.status].filter(s => s === 200).length;
  const rejectedCount = [resA.status, resB.status].filter(s => s === 401).length;
  assert(successCount === 1, 'Exactly one concurrent request succeeded (status 200)');
  assert(rejectedCount === 1, 'Exactly one concurrent request was rejected for duplicate nonce (status 401)');
  assert(concurrentRpcCalls === 1, 'Private RPC was called exactly once across concurrent submissions');

  // TEST 13: An invalid signature cannot burn the nonce for a subsequent legitimate request
  activeNonces.clear();
  let finalRpcCalls = 0;
  const sequenceDeps: GatewayPipelineDeps = {
    ...mockDeps,
    consumeNonce: async (n) => {
      if (activeNonces.has(n)) return false;
      activeNonces.add(n);
      return true;
    },
    ingestStock: async () => {
      finalRpcCalls++;
      return { operation_status: 'COMMITTED' };
    }
  };

  // Step 1: Malicious or corrupted request with invalid signature arrives first
  const attackerReq = makeRequest(invalidBase64Signature);
  const attackerRes = await executeGatewayPipeline(attackerReq, sequenceDeps);
  assert(attackerRes.status === 401, 'Corrupted signature request is rejected');
  assert(!activeNonces.has(nonce), 'Nonce was NOT consumed by corrupted request');

  // Step 2: Legitimate request with valid signature arrives with same nonce
  const legitimateReq = makeRequest(validBase64Signature);
  const legitimateRes = await executeGatewayPipeline(legitimateReq, sequenceDeps);
  assert(legitimateRes.status === 200, 'Subsequent legitimate request succeeds');
  assert(activeNonces.has(nonce), 'Nonce was successfully consumed by legitimate request');
  assert(finalRpcCalls === 1, 'Private RPC was invoked once for legitimate request');

  console.log(`\n--- Finished: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
