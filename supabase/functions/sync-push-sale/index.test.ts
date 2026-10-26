import {
  canonicalizeJson,
  computeSha256Hex,
  buildCanonicalSigningMessage,
  importP256SpkiPem,
  verifyP256Signature,
  base64ToUint8Array,
  isValidUuid,
  executeGatewayPipeline,
  normalizeGatewayError,
  validateAuthoritativeSaleResult,
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
  assert(normalizeGatewayError({ code: '23505', message: 'NONCE_REPLAY' }).error_code === 'NONCE_REPLAY',
    'Plain-object database errors retain sanitized nonce classification');
  assert(normalizeGatewayError(new Error('CHECKOUT_CONFLICT')).error_code === 'CHECKOUT_CONFLICT',
    'Error instances retain sanitized checkout conflict classification');
  assert(normalizeGatewayError({ code: '23505', message: 'duplicate key on unrelated_unique' }).error_code === 'SALE_COMMIT_FAILED',
    'Unknown 23505 constraints are not fabricated into operation conflicts');
  assert(normalizeGatewayError({
    code: '23505',
    message: 'duplicate key value violates unique constraint "uq_sales_pharmacy_checkout_intent"',
    details: 'Key (pharmacy_id, checkout_intent_id) already exists.'
  }).error_code === 'CHECKOUT_CONFLICT', 'Real PostgreSQL M-18 checkout unique violation is classified as checkout conflict');
  assert(normalizeGatewayError({ code: '23505', message: 'duplicate key value violates unique constraint "other_unique"',
    details: 'sensitive row detail' }).error === 'Sale commit result is unavailable',
    'Unknown unique violations remain generic and sanitized');
  assert(normalizeGatewayError({ code: '40001', message: 'CHECKOUT_CONFLICT' }).error_code === 'SERIALIZATION_FAILURE',
    'SQLSTATE serialization classification takes precedence over misleading text');
  assert(normalizeGatewayError({ code: '40P01', message: 'NONCE_REPLAY' }).error_code === 'DEADLOCK_DETECTED',
    'SQLSTATE deadlock classification takes precedence over misleading text');
  assert(normalizeGatewayError({ code: 'XX000', message: 'serialization failure' }).error_code === 'SALE_COMMIT_FAILED',
    'Unknown SQLSTATE does not use substring guessing');
  assert(normalizeGatewayError({ message: 'prefix CHECKOUT_CONFLICT suffix' }).error_code === 'SALE_COMMIT_FAILED',
    'Unstructured substring text is not accepted as a typed marker');
  assert([null, '', [], 42].every((value) => normalizeGatewayError(value).error_code === 'SALE_COMMIT_FAILED'),
    'Null, scalar and array errors are sanitized to the generic failure');

  const authoritativeTopTime = new Date().toISOString();
  const authoritativeOriginalTime = new Date(Date.now() - 1000).toISOString();
  const authoritativeProbe = validateAuthoritativeSaleResult({
    operation_status: 'ALREADY_COMMITTED', sale_id: '55555555-5555-4555-8555-555555555555',
    processed_at: authoritativeTopTime, response_payload: {
      operation_status: 'COMMITTED', client_op_id: '33333333-3333-4333-8333-333333333333',
      sale_id: '55555555-5555-4555-8555-555555555555', checkout_intent_id: '88888888-8888-4888-8888-888888888888',
      processed_at: authoritativeOriginalTime
    }
  }, { client_op_id: '33333333-3333-4333-8333-333333333333', sale_id: '55555555-5555-4555-8555-555555555555',
    checkout_intent_id: '88888888-8888-4888-8888-888888888888' });
  assert(authoritativeProbe?.processed_at === authoritativeTopTime &&
    authoritativeProbe.original_processed_at === authoritativeOriginalTime,
    'M-18 replay validates and preserves distinct top-level and original commit timestamps');
  assert(validateAuthoritativeSaleResult({ operation_status: 'COMMITTED', sale_id: '55555555-5555-4555-8555-555555555555',
    processed_at: 'invalid', response_payload: {} }, { client_op_id: '33333333-3333-4333-8333-333333333333',
    sale_id: '55555555-5555-4555-8555-555555555555', checkout_intent_id: '88888888-8888-4888-8888-888888888888' }) === null,
    'Malformed authoritative timestamps fail closed');

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
      return { operation_status: 'COMMITTED', new_stock: 10, processed_at: new Date().toISOString() };
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
      return { operation_status: 'COMMITTED', processed_at: new Date().toISOString() };
    }
  };
  const replayedReq = makeRequest(validBase64Signature);
  const replayedRes = await executeGatewayPipeline(replayedReq, replayDeps);
  assert(replayedRes.status === 409, 'Replayed request with already-consumed nonce returns 409');
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
      return { operation_status: 'COMMITTED', processed_at: new Date().toISOString() };
    }
  };

  const reqA = makeRequest(validBase64Signature);
  const reqB = makeRequest(validBase64Signature);

  const [resA, resB] = await Promise.all([
    executeGatewayPipeline(reqA, atomicDbDeps),
    executeGatewayPipeline(reqB, atomicDbDeps)
  ]);

  const successCount = [resA.status, resB.status].filter(s => s === 200).length;
  const rejectedCount = [resA.status, resB.status].filter(s => s === 409).length;
  assert(successCount === 1, 'Exactly one concurrent request succeeded (status 200)');
  assert(rejectedCount === 1, 'Exactly one concurrent request was rejected for duplicate nonce (status 409)');
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
      return { operation_status: 'COMMITTED', processed_at: new Date().toISOString() };
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

  // TEST 14: Unified-sale checkout intent validation and routing contract
  const checkoutIntentId = '88888888-8888-4888-8888-888888888888';
  const unifiedPayload = {
    sale_id: saleId,
    client_op_id: clientOpId,
    checkout_intent_id: checkoutIntentId,
    pharmacy_id: pharmacyId,
    branch_id: branchId,
    customer_id: null,
    currency: 'NGN',
    subtotal: 150000,
    discount: 0,
    tax: 0,
    total: 150000,
    payment_method: 'CASH',
    amount_tendered: 150000,
    change_due: 0,
    payment_status: 'PAID',
    created_at: Date.now(),
    line_items: [{ product_id: productId, batch_id: batchId, quantity: 5, unit_price: 30000 }]
  };

  async function makeUnifiedRequest(
    bodyOverrides: Record<string, unknown> = {},
    payloadOverride: Record<string, unknown> = unifiedPayload
  ) {
    const body: Record<string, unknown> = {
      pharmacy_id: pharmacyId,
      device_id: deviceId,
      branch_id: branchId,
      client_op_id: clientOpId,
      checkout_intent_id: checkoutIntentId,
      timestamp,
      nonce,
      sale_id: saleId,
      payload: payloadOverride,
      ...bodyOverrides
    };
    const payloadHash = await computeSha256Hex(canonicalizeJson(body.payload));
    const signingMessage = buildCanonicalSigningMessage(
      body.pharmacy_id as string,
      body.device_id as string,
      body.client_op_id as string,
      body.timestamp as string,
      body.nonce as string,
      payloadHash
    );
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: { name: 'SHA-256' } },
      keyPair.privateKey,
      new TextEncoder().encode(signingMessage)
    );
    body.payload_hash = payloadHash;

    return new Request('https://test/sync-push-sale', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer valid.jwt.token',
        'X-Device-Signature': arrayBufferToBase64(signature),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  }

  let unifiedCommitCalls = 0;
  const committedClientOps = new Map<string, { hash: string; result: {
    operation_status: string; sale_id: string; processed_at: string; response_payload: Record<string, unknown>
  } }>();
  const committedNonces = new Set<string>();
  const committedCheckoutIntents = new Map<string, string>();
  const unifiedDeps: GatewayPipelineDeps = {
    ...mockDeps,
    commitSale: async (params) => {
      unifiedCommitCalls++;
      if (committedNonces.has(params.nonce)) {
        throw new Error('NONCE_REPLAY');
      }
      const existing = committedClientOps.get(params.client_op_id);
      if (existing && existing.hash !== params.payload_hash) {
        throw new Error('IDEMPOTENCY_CONFLICT');
      }
      if (existing) {
        committedNonces.add(params.nonce);
        return { ...existing.result, operation_status: 'ALREADY_COMMITTED' };
      }

      const existingCheckout = committedCheckoutIntents.get(params.checkout_intent_id);
      if (existingCheckout && existingCheckout !== params.client_op_id) {
        throw new Error('CHECKOUT_CONFLICT');
      }
      committedNonces.add(params.nonce);
      committedCheckoutIntents.set(params.checkout_intent_id, params.client_op_id);
      const processedAt = new Date().toISOString();
      const result = {
        operation_status: 'COMMITTED', sale_id: String(params.sale.id), processed_at: processedAt,
        response_payload: {
          operation_status: 'COMMITTED', client_op_id: params.client_op_id, sale_id: params.sale.id,
          checkout_intent_id: params.checkout_intent_id, processed_at: processedAt
        }
      };
      committedClientOps.set(params.client_op_id, { hash: params.payload_hash, result });
      return result;
    }
  };

  const missingCheckoutResponse = await executeGatewayPipeline(
    await makeUnifiedRequest({ checkout_intent_id: undefined }),
    unifiedDeps
  );
  assert(missingCheckoutResponse.status === 400, 'Missing checkout_intent_id is rejected before unified commit');
  assert(unifiedCommitCalls === 0, 'Missing checkout_intent_id does not reach the commit RPC');

  const invalidCheckoutResponse = await executeGatewayPipeline(
    await makeUnifiedRequest({ checkout_intent_id: 'not-a-uuid' }),
    unifiedDeps
  );
  assert(invalidCheckoutResponse.status === 400, 'Invalid checkout_intent_id is rejected before unified commit');
  assert(unifiedCommitCalls === 0, 'Invalid checkout_intent_id does not reach the commit RPC');

  const mismatchedPayload = { ...unifiedPayload, checkout_intent_id: '99999999-9999-4999-8999-999999999999' };
  const mismatchedCheckoutResponse = await executeGatewayPipeline(
    await makeUnifiedRequest({}, mismatchedPayload),
    unifiedDeps
  );
  assert(mismatchedCheckoutResponse.status === 400, 'Signed payload checkout_intent_id must match the request routing field');
  assert(unifiedCommitCalls === 0, 'Checkout routing mismatch does not reach the commit RPC');

  const validUnifiedResponse = await executeGatewayPipeline(await makeUnifiedRequest(), unifiedDeps);
  assert(validUnifiedResponse.status === 200, 'Valid matching checkout intent reaches the unified commit RPC');
  assert(unifiedCommitCalls === 1, 'Unified commit RPC is called once for a valid checkout intent');
  assert(committedCheckoutIntents.get(checkoutIntentId) === clientOpId, 'Unified commit receives the signed checkout intent unchanged');

  const replayedNonceResponse = await executeGatewayPipeline(await makeUnifiedRequest(), unifiedDeps);
  assert(replayedNonceResponse.status === 409, 'Replayed nonce is rejected by the unified transaction boundary');

  const duplicateOperationResponse = await executeGatewayPipeline(
    await makeUnifiedRequest({ nonce: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }),
    unifiedDeps
  );
  assert(duplicateOperationResponse.status === 200, 'Replayed client_op_id returns the committed unified operation result');
  assert(committedClientOps.size === 1, 'Replayed client_op_id does not create another logical operation');

  const changedPayloadResponse = await executeGatewayPipeline(
    await makeUnifiedRequest({ nonce: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }, { ...unifiedPayload, total: 9999 }),
    unifiedDeps
  );
  assert(changedPayloadResponse.status === 409, 'Same client_op_id with a changed payload hash conflicts');
  assert(!committedNonces.has('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'), 'Hash-conflict transaction rolls back nonce consumption');

  const duplicateCheckoutResponse = await executeGatewayPipeline(
    await makeUnifiedRequest({
      client_op_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      nonce: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      sale_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    }, {
      ...unifiedPayload,
      client_op_id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      sale_id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    }),
    unifiedDeps
  );
  assert(duplicateCheckoutResponse.status === 409, 'Same checkout intent with a different operation conflicts');
  assert(!committedNonces.has('cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 'Checkout-conflict transaction rolls back nonce consumption');
  assert(committedCheckoutIntents.size === 1, 'Duplicate checkout intent does not create another logical checkout record');

  console.log(`\n--- Finished: ${passed} passed, ${failed} failed ---`);
  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
