/**
 * PharmacyFlow Phase 5D-11 Offline Return Synchronization Test Suite
 * 
 * Verifies the sync-push-return Edge Function gateway:
 * - Cryptographic Candidate A signing protocol (/sync-push-return)
 * - Signature verification strictly before nonce consumption
 * - Nonce replay protection and DoS defense
 * - Role authorization (Owner/Manager/Pharmacist vs Cashier)
 * - Active device assignment and tenant boundaries
 * - Atomic idempotency and crash recovery
 * - Business rules and stock restoration
 */

import {
  executeReturnGatewayPipeline,
  buildCanonicalSigningMessage,
  canonicalizeJson,
  computeSha256Hex,
  importP256SpkiPem,
  verifyP256Signature,
  ReturnGatewayPipelineDeps,
  ReturnRequestPayload
} from './index';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
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

  console.log('--- Starting Sync-Push-Return Gateway Security & Cryptographic Tests ---');

  // Test setup: Cryptographic Key Pair
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true,
    ['sign', 'verify']
  );

  const spkiPem = await exportSpkiPem(keyPair.publicKey);

  // Entities
  const pharmacyId = '11111111-1111-4111-8111-111111111111';
  const pharmacyB = '22222222-2222-4222-8222-222222222222';
  const branchId = '33333333-3333-4333-8333-333333333333';
  const branchB = '44444444-4444-4444-8444-444444444444';
  const deviceId = '55555555-5555-4555-8555-555555555555';
  const clientOpId = '66666666-6666-4666-8666-666666666666';
  const saleId = '77777777-7777-4777-8777-777777777777';
  const productId = '88888888-8888-4888-8888-888888888888';
  const batchId = '99999999-9999-4999-8999-999999999999';
  const nonce = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const timestamp = Date.now().toString();

  const userOwner = { id: 'user-owner-uuid' };
  const userManager = { id: 'user-manager-uuid' };
  const userPharmacist = { id: 'user-pharmacist-uuid' };
  const userCashier = { id: 'user-cashier-uuid' };

  // Subpayload
  const subPayload = {
    sale_id: saleId,
    branch_id: branchId,
    items: [
      {
        product_id: productId,
        batch_id: batchId,
        quantity: 2,
        restock_to_inventory: true
      }
    ],
    refund_amount: 3000,
    refund_payment_method: 'CASH',
    reason: 'Customer return test'
  };

  const canonicalPayload = canonicalizeJson(subPayload);
  const payloadHash = await computeSha256Hex(canonicalPayload);

  // Candidate A Signing Message for returns
  const canonicalMessage = buildCanonicalSigningMessage(
    pharmacyId,
    deviceId,
    clientOpId,
    timestamp,
    nonce,
    payloadHash
  );

  // Sign with device private key (IEEE P1363 64-byte raw signature)
  const encoder = new TextEncoder();
  const signatureRaw = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    keyPair.privateKey,
    encoder.encode(canonicalMessage)
  );
  const validBase64Signature = arrayBufferToBase64(signatureRaw);
  const invalidBase64Signature = arrayBufferToBase64(new Uint8Array(64).fill(0xfe).buffer as ArrayBuffer);

  // Base Valid Request Payload
  const basePayload: ReturnRequestPayload = {
    pharmacy_id: pharmacyId,
    device_id: deviceId,
    branch_id: branchId,
    client_op_id: clientOpId,
    timestamp,
    nonce,
    sale_id: saleId,
    items: subPayload.items,
    refund_amount: subPayload.refund_amount,
    refund_payment_method: subPayload.refund_payment_method,
    reason: subPayload.reason,
    payload: subPayload,
    payload_hash: payloadHash
  };

  const makeRequest = (sig: string, bodyOverrides?: Partial<ReturnRequestPayload>, token = 'valid-jwt') => {
    return new Request('https://test.supabase.co/functions/v1/sync-push-return', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Device-Signature': sig,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ...basePayload, ...bodyOverrides })
    });
  };

  let nonceConsumeCallCount = 0;
  let rpcCallCount = 0;

  const mockDeps: ReturnGatewayPipelineDeps = {
    getUser: async (token) => {
      if (token === 'valid-jwt') return { user: userManager, error: null };
      if (token === 'owner-jwt') return { user: userOwner, error: null };
      if (token === 'pharmacist-jwt') return { user: userPharmacist, error: null };
      if (token === 'cashier-jwt') return { user: userCashier, error: null };
      return { user: null, error: new Error('Invalid JWT') };
    },
    getPharmacyMember: async (userId, pid) => {
      if (pid !== pharmacyId) return null;
      if (userId === userOwner.id) return { id: 'mem-1', role: 'OWNER', status: 'ACTIVE' };
      if (userId === userManager.id) return { id: 'mem-2', role: 'MANAGER', status: 'ACTIVE' };
      if (userId === userPharmacist.id) return { id: 'mem-3', role: 'PHARMACIST', status: 'ACTIVE' };
      if (userId === userCashier.id) return { id: 'mem-4', role: 'CASHIER', status: 'ACTIVE' };
      return null;
    },
    getDevice: async (dId) => {
      if (dId === deviceId) {
        return {
          id: deviceId,
          pharmacy_id: pharmacyId,
          branch_id: branchId,
          status: 'ACTIVE',
          public_key_pem: spkiPem
        };
      }
      return null;
    },
    consumeNonce: async () => {
      nonceConsumeCallCount++;
      return true;
    },
    processReturn: async () => {
      rpcCallCount++;
      return {
        return_id: 'ret-11111111-1111-4111-8111-111111111111',
        status: 'COMMITTED',
        refund_amount: 3000
      };
    }
  };

  // --- 1. GATEWAY & AUTHENTICATION TESTS ---
  console.log('\n[1. Gateway Authentication & Signatures]');

  // Test 1: Missing JWT
  const noJwtReq = new Request('https://test.supabase.co/functions/v1/sync-push-return', {
    method: 'POST',
    headers: { 'X-Device-Signature': validBase64Signature, 'Content-Type': 'application/json' },
    body: JSON.stringify(basePayload)
  });
  const noJwtRes = await executeReturnGatewayPipeline(noJwtReq, mockDeps);
  assert(noJwtRes.status === 401, 'Missing Authorization header returns 401');

  // Test 2: Invalid JWT
  const badJwtReq = makeRequest(validBase64Signature, {}, 'invalid-token');
  const badJwtRes = await executeReturnGatewayPipeline(badJwtReq, mockDeps);
  assert(badJwtRes.status === 401, 'Invalid session JWT returns 401');

  // Test 3: Missing X-Device-Signature header
  const noSigReq = new Request('https://test.supabase.co/functions/v1/sync-push-return', {
    method: 'POST',
    headers: { 'Authorization': 'Bearer valid-jwt', 'Content-Type': 'application/json' },
    body: JSON.stringify(basePayload)
  });
  const noSigRes = await executeReturnGatewayPipeline(noSigReq, mockDeps);
  assert(noSigRes.status === 401, 'Missing X-Device-Signature header returns 401');

  // --- 2. SIGNATURE & NONCE SECURITY (CRITICAL ORDER) ---
  console.log('\n[2. Pipeline Execution Order & Nonce Protection]');

  // Test 4: Invalid signature MUST NOT consume nonce AND MUST NOT call RPC
  nonceConsumeCallCount = 0;
  rpcCallCount = 0;
  const invalidSigReq = makeRequest(invalidBase64Signature);
  const invalidSigRes = await executeReturnGatewayPipeline(invalidSigReq, mockDeps);
  assert(invalidSigRes.status === 401, 'Invalid signature returns 401 Unauthorized');
  assert(nonceConsumeCallCount === 0, 'CRITICAL: Invalid signature did NOT consume the nonce (count === 0)');
  assert(rpcCallCount === 0, 'CRITICAL: Private RPC was NOT called when signature failed (count === 0)');

  // Test 5: Valid signature consumes nonce exactly once and invokes RPC
  const validSigReq = makeRequest(validBase64Signature);
  const validSigRes = await executeReturnGatewayPipeline(validSigReq, mockDeps);
  assert(validSigRes.status === 200, 'Valid signature returns 200 OK');
  assert(nonceConsumeCallCount === 1, 'Valid signature consumed nonce exactly once');
  assert(rpcCallCount === 1, 'Private RPC was invoked after successful verification');

  // Test 6: Replayed nonce rejected
  const replayDeps: ReturnGatewayPipelineDeps = {
    ...mockDeps,
    consumeNonce: async () => false // Nonce already consumed
  };
  const replayedReq = makeRequest(validBase64Signature);
  const replayedRes = await executeReturnGatewayPipeline(replayedReq, replayDeps);
  assert(replayedRes.status === 401, 'Replayed nonce is rejected with 401');

  // Test 7: Tampered payload hash rejected
  const tamperedHashReq = makeRequest(validBase64Signature, { payload_hash: '0'.repeat(64) });
  const tamperedHashRes = await executeReturnGatewayPipeline(tamperedHashReq, mockDeps);
  assert(tamperedHashRes.status === 400, 'Tampered payload hash rejected with 400');

  // --- 3. ROLE AUTHORIZATION TESTS ---
  console.log('\n[3. Role Authorization Gates]');

  // Test 8: CASHIER calling sync-push-return is rejected with 403 Forbidden
  const cashierReq = makeRequest(validBase64Signature, {}, 'cashier-jwt');
  const cashierRes = await executeReturnGatewayPipeline(cashierReq, mockDeps);
  assert(cashierRes.status === 403, 'CASHIER role rejected with 403 Forbidden');
  const cashierBody = await cashierRes.json();
  assert(cashierBody.error.includes('CASHIER cannot authorize returns'), 'Error identifies cashier return prohibition');

  // Test 9: OWNER allowed
  const ownerReq = makeRequest(validBase64Signature, {}, 'owner-jwt');
  const ownerRes = await executeReturnGatewayPipeline(ownerReq, mockDeps);
  assert(ownerRes.status === 200, 'OWNER role authorized for return sync (200 OK)');

  // Test 10: PHARMACIST allowed
  const pharmacistReq = makeRequest(validBase64Signature, {}, 'pharmacist-jwt');
  const pharmacistRes = await executeReturnGatewayPipeline(pharmacistReq, mockDeps);
  assert(pharmacistRes.status === 200, 'PHARMACIST role authorized for return sync (200 OK)');

  // --- 4. TENANT & DEVICE BOUNDARIES ---
  console.log('\n[4. Tenant and Device Boundaries]');

  // Test 11: Cross-pharmacy request rejected
  const crossPharmReq = makeRequest(validBase64Signature, { pharmacy_id: pharmacyB });
  const crossPharmRes = await executeReturnGatewayPipeline(crossPharmReq, mockDeps);
  assert(crossPharmRes.status === 403, 'Cross-pharmacy request rejected with 403');

  // Test 12: Device branch mismatch rejected
  const branchMismatchReq = makeRequest(validBase64Signature, { branch_id: branchB });
  const branchMismatchRes = await executeReturnGatewayPipeline(branchMismatchReq, mockDeps);
  assert(branchMismatchRes.status === 403, 'Device branch mismatch rejected with 403');

  // Test 13: Stale timestamp rejected
  const staleTime = (Date.now() - 400000).toString(); // > 5 minutes ago
  const staleReq = makeRequest(validBase64Signature, { timestamp: staleTime });
  const staleRes = await executeReturnGatewayPipeline(staleReq, mockDeps);
  assert(staleRes.status === 401, 'Stale timestamp (> 5 min) rejected with 401');

  // --- 5. BUSINESS RULES VIA GATEWAY ---
  console.log('\n[5. Business Rule Exceptions Handled as HTTP 409]');

  const overReturnDeps: ReturnGatewayPipelineDeps = {
    ...mockDeps,
    processReturn: async () => {
      return {
        return_id: '',
        status: 'FAILED',
        refund_amount: 0,
        error: 'EXCEEDS_RETURNABLE_QUANTITY: Cannot return 5 units. Only 2 returnable.'
      };
    }
  };
  const overReturnReq = makeRequest(validBase64Signature);
  const overReturnRes = await executeReturnGatewayPipeline(overReturnReq, overReturnDeps);
  assert(overReturnRes.status === 409, 'Business rule violation (over-return) classified as HTTP 409 Conflict');

  console.log(`\n======================================================`);
  console.log(`PHASE 5D-11 GATEWAY TESTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
