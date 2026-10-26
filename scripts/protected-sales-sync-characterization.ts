/**
 * Read-only/synthetic characterization of protected sales and sync defects.
 *
 * This is intentionally excluded from the normal passing suite. It records the
 * current unsafe behavior so a later, separately approved implementation batch
 * can turn each EXPECTED FAILURE into an enforced production invariant.
 *
 * IMPORTANT: 6/6 characterization passing means six unsafe observations remain.
 * There are two synthetic behavioral checks and four source-text checks across
 * five defect families. This is not SQL or concurrency verification.
 */
import { readFileSync } from 'node:fs';
import {
  buildCanonicalSigningMessage,
  canonicalizeJson,
  computeSha256Hex,
  executeGatewayPipeline,
  type GatewayPipelineDeps,
} from '../supabase/functions/sync-push-sale/index';

let observations = 0;

function observe(condition: boolean, description: string, desiredContract: string): void {
  if (!condition) throw new Error(`Characterization drifted: ${description}`);
  observations += 1;
  console.log(`OBSERVED: ${description}`);
  console.log(`EXPECTED FAILURE: ${desiredContract}`);
}

function asBase64(buffer: ArrayBuffer): string {
  let binary = '';
  for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function exportPublicKey(key: CryptoKey): Promise<string> {
  const encoded = asBase64(await crypto.subtle.exportKey('spki', key));
  return `-----BEGIN PUBLIC KEY-----\n${encoded}\n-----END PUBLIC KEY-----`;
}

const ids = {
  pharmacy: '11111111-1111-4111-8111-111111111111',
  device: '22222222-2222-4222-8222-222222222222',
  branch: '33333333-3333-4333-8333-333333333333',
  clientOp: '44444444-4444-4444-8444-444444444444',
  checkout: '55555555-5555-4555-8555-555555555555',
  nonce: '66666666-6666-4666-8666-666666666666',
  sale: '77777777-7777-4777-8777-777777777777',
  item: '88888888-8888-4888-8888-888888888888',
  product: '99999999-9999-4999-8999-999999999999',
  batch: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
};

async function makeSignedRequest(privateKey: CryptoKey): Promise<Request> {
  const timestamp = Date.now().toString();
  const payload = {
    sale_id: ids.sale,
    client_op_id: ids.clientOp,
    checkout_intent_id: ids.checkout,
    pharmacy_id: ids.pharmacy,
    branch_id: ids.branch,
    customer_id: null,
    currency: 'NGN',
    subtotal: 100,
    discount: 0,
    tax: 0,
    total: 100,
    payment_method: 'CASH',
    amount_tendered: 100,
    change_due: 0,
    payment_status: 'SETTLED',
    created_at: Date.now(),
    line_items: [{
      id: ids.item,
      product_id: ids.product,
      batch_id: ids.batch,
      quantity: 1,
      unit_price: 100,
      discount: 0,
      tax: 0,
      line_total: 100,
    }],
  };
  const payloadHash = await computeSha256Hex(canonicalizeJson(payload));
  const message = buildCanonicalSigningMessage(
    ids.pharmacy,
    ids.device,
    ids.clientOp,
    timestamp,
    ids.nonce,
    payloadHash,
  );
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    new TextEncoder().encode(message),
  );

  return new Request('https://synthetic.invalid/sync-push-sale', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer synthetic-token',
      'Content-Type': 'application/json',
      'X-Device-Signature': asBase64(signature),
    },
    body: JSON.stringify({
      pharmacy_id: ids.pharmacy,
      device_id: ids.device,
      branch_id: ids.branch,
      client_op_id: ids.clientOp,
      checkout_intent_id: ids.checkout,
      timestamp,
      nonce: ids.nonce,
      sale_id: ids.sale,
      payload,
      payload_hash: payloadHash,
    }),
  });
}

async function run(): Promise<void> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const publicKeyPem = await exportPublicKey(keyPair.publicKey);
  const baseDeps: GatewayPipelineDeps = {
    getUser: async () => ({ user: { id: 'synthetic-user' }, error: null }),
    getPharmacyMember: async () => ({ id: 'synthetic-member', role: 'PHARMACIST', status: 'ACTIVE' }),
    getDevice: async () => ({
      id: ids.device,
      pharmacy_id: ids.pharmacy,
      branch_id: ids.branch,
      status: 'ACTIVE',
      public_key_pem: publicKeyPem,
    }),
    consumeNonce: async () => true,
    ingestStock: async () => ({ operation_status: 'COMMITTED' }),
  };

  const plainObjectErrorResponse = await executeGatewayPipeline(
    await makeSignedRequest(keyPair.privateKey),
    {
      ...baseDeps,
      commitSale: async () => {
        throw { message: 'NONCE_REPLAY', code: '23505' };
      },
    },
  );
  const plainObjectBody = await plainObjectErrorResponse.json() as Record<string, unknown>;
  observe(
    plainObjectErrorResponse.status === 409 && plainObjectBody.error_code === 'SALE_COMMIT_REJECTED',
    'a Supabase-shaped plain error object is collapsed to SALE_COMMIT_REJECTED',
    'NONCE_REPLAY must remain recognizable and receive its deliberate retry/terminal policy.',
  );

  const emptyStatusResponse = await executeGatewayPipeline(
    await makeSignedRequest(keyPair.privateKey),
    {
      ...baseDeps,
      commitSale: async () => ({ operation_status: '' }),
    },
  );
  const emptyStatusBody = await emptyStatusResponse.json() as Record<string, unknown>;
  observe(
    emptyStatusResponse.status === 200 && emptyStatusBody.operation_status === 'COMMITTED',
    'an invalid empty operation status is accepted as HTTP 200 COMMITTED',
    'an empty or malformed RPC row must be treated as uncertain/non-committed, never fabricated success.',
  );

  const dispatcher = readFileSync(new URL('../src/lib/offline/dispatcher.ts', import.meta.url), 'utf8');
  const salesService = readFileSync(new URL('../src/lib/sales/service.ts', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../supabase/migrations/20261012000018_unified_sales_commit.sql', import.meta.url), 'utf8');
  const gatewayTest = readFileSync(new URL('../supabase/functions/sync-push-sale/index.test.ts', import.meta.url), 'utf8');
  const orchestrator = readFileSync(new URL('../src/lib/pos/orchestrator.ts', import.meta.url), 'utf8');
  const cart = readFileSync(new URL('../src/lib/pos/cart.ts', import.meta.url), 'utf8');

  observe(
    dispatcher.includes('checkout_intent_id: txRecord.payload.checkout_intent_id') &&
      salesService.includes('(p.checkout_intent_id as string) || tx.client_op_id'),
    'legacy sale reads synthesize an intent, while dispatch still reads the unchanged signed payload',
    'legacy queue recovery must not rewrite the signed payload/hash/op ID and must not submit undefined intent.',
  );
  observe(
    migration.includes('uq_sales_pharmacy_checkout_intent') &&
      migration.includes('INSERT INTO public.sales') &&
      gatewayTest.includes("return { operation_status: 'COMMITTED' };") &&
      gatewayTest.includes('existingCheckout !== params.client_op_id'),
    'the gateway mock reports duplicate checkout success although SQL reaches a unique-constrained insert',
    'the test double and database contract must agree on replay semantics for same intent/different client op.',
  );
  observe(
    dispatcher.includes('if (!this.rpcGetClientOpStatus)') &&
      dispatcher.includes("return 'NOT_COMMITTED';") &&
      dispatcher.includes("return 'UNKNOWN';") &&
      dispatcher.includes("const retryable = transitionQueueItem(stale, 'RETRYABLE'"),
    'missing, non-committed, and unknown status evidence can all flow back to retry',
    'UNKNOWN must remain distinct from ABSENT, and ambiguous financial operations require bounded reconciliation rather than automatic resubmission.',
  );
  observe(
    !orchestrator.match(/checkout_intent_id\s*:/) &&
      !cart.match(/checkout_intent_id\s*:/),
    'the POS cart/finalization path does not carry a stable checkout intent',
    'one checkout intent must be created before the first finalize attempt and survive retries/restarts until resolution.',
  );

  console.log(`Characterization complete: ${observations}/6 unsafe observations remain.`);
  console.log('Two synthetic behavioral checks and four source-text checks span five defect families.');
  console.log('This is not SQL or concurrency verification.');
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
