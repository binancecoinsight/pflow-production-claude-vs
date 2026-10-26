import { createClient } from '@supabase/supabase-js';

interface DenoRuntime {
  env?: { get(key: string): string | undefined };
  serve?(handler: (req: Request) => Promise<Response>): void;
}

const getDeno = (): DenoRuntime | undefined => {
  return (globalThis as unknown as { Deno?: DenoRuntime }).Deno;
};

// Environment variable resolution supporting both Deno and Node/Bun runtimes
export const getEnv = (key: string): string => {
  const deno = getDeno();
  if (deno?.env) {
    return deno.env.get(key) || '';
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key] || '';
  }
  return '';
};

// CORS configuration headers
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-signature',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

// RFC 4122 UUID v4 regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates whether a given string is a valid UUID.
 */
export const isValidUuid = (value: unknown): value is string => {
  return typeof value === 'string' && UUID_REGEX.test(value);
};

/**
 * Deterministically canonicalizes any JSON value:
 * - Recursively sorts object keys lexicographically
 * - Preserves array order
 * - Emits zero redundant whitespace
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
export const computeSha256Hex = async (input: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('').toLowerCase();
};

/**
 * Constructs the frozen Candidate A canonical signing message:
 * PF-V1\nPOST\n/sync-push-sale\n<pharmacy_id>\n<device_id>\n<client_op_id>\n<timestamp>\n<nonce>\n<payload_hash>
 */
export const buildCanonicalSigningMessage = (
  pharmacyId: string,
  deviceId: string,
  clientOpId: string,
  timestampMs: string,
  nonce: string,
  payloadHash: string
): string => {
  return [
    'PF-V1',
    'POST',
    '/sync-push-sale',
    pharmacyId.toLowerCase(),
    deviceId.toLowerCase(),
    clientOpId.toLowerCase(),
    timestampMs,
    nonce.toLowerCase(),
    payloadHash.toLowerCase()
  ].join('\n');
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
 * Converts a SPKI PEM formatted public key string into a WebCrypto CryptoKey (P-256 ECDSA).
 */
export const importP256SpkiPem = async (pem: string): Promise<CryptoKey> => {
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
 * Verifies an IEEE P1363 (64-byte) raw ECDSA signature over the canonical message bytes.
 */
export const verifyP256Signature = async (
  cryptoKey: CryptoKey,
  rawSignatureBytes: Uint8Array,
  canonicalMessage: string
): Promise<boolean> => {
  if (rawSignatureBytes.length !== 64) {
    return false;
  }

  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(canonicalMessage);

  return await crypto.subtle.verify(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    cryptoKey,
    rawSignatureBytes.buffer as ArrayBuffer,
    dataBytes
  );
};

export interface RequestPayload {
  pharmacy_id: string;
  device_id: string;
  branch_id: string;
  client_op_id: string;
  timestamp: string | number;
  nonce: string;
  sale_id: string;
  product_id?: string;
  batch_id?: string;
  quantity?: number;
  checkout_intent_id?: string;
  payload?: Record<string, unknown>;
  payload_hash?: string;
}

export interface GatewayPipelineDeps {
  getUser: (jwtToken: string) => Promise<{ user: { id: string } | null; error: Error | null }>;
  getPharmacyMember: (userId: string, pharmacyId: string) => Promise<{ id: string; role: string; status: string } | null>;
  getDevice: (deviceId: string) => Promise<{ id: string; pharmacy_id: string; branch_id: string; status: string; public_key_pem: string } | null>;
  consumeNonce: (nonce: string, pharmacyId: string, deviceId: string) => Promise<boolean>;
  ingestStock: (params: {
    client_op_id: string;
    pharmacy_id: string;
    branch_id: string;
    device_id: string;
    sale_id: string;
    product_id: string;
    batch_id: string;
    quantity: number;
    payload_hash: string;
  }) => Promise<{
    operation_status: string;
    new_stock?: number;
    deficit_created?: boolean;
    processed_at?: string;
  }>;
  commitSale?: (params: {
    actor_user_id: string;
    client_op_id: string;
    checkout_intent_id: string;
    pharmacy_id: string;
    branch_id: string;
    device_id: string;
    nonce: string;
    payload_hash: string;
    sale: Record<string, unknown>;
    items: unknown[];
  }) => Promise<{
    operation_status: string;
    sale_id: string;
    processed_at: string;
    response_payload: Record<string, unknown>;
  }>;
}

type DatabaseErrorShape = { code?: unknown; message?: unknown; details?: unknown; constraint?: unknown };
export type NormalizedGatewayError = { status: number; error_code: string; error: string };

export const normalizeGatewayError = (value: unknown): NormalizedGatewayError => {
  const row = (value && typeof value === 'object' ? value : {}) as DatabaseErrorShape;
  const code = typeof row.code === 'string' ? row.code : '';
  const message = row.message instanceof String || typeof row.message === 'string' ? String(row.message) : '';
    const details = typeof row.details === 'string' ? row.details : '';
    const constraint = typeof row.constraint === 'string' ? row.constraint : '';
    const marker = message.trim().toUpperCase();
    const exactMarker = (name: string) => marker === name || marker.startsWith(`${name}:`);
    if (code === '42501') return { status: 403, error_code: 'SALE_FORBIDDEN', error: 'Sale commit is not authorized' };
    if (code === '40001') return { status: 409, error_code: 'SERIALIZATION_FAILURE', error: 'Sale commit serialization conflict' };
    if (code === '40P01') return { status: 409, error_code: 'DEADLOCK_DETECTED', error: 'Sale commit deadlock conflict' };
    if (code === '22023' || code === '23514') {
      return { status: 400, error_code: 'INVALID_SALE_PAYLOAD', error: 'Sale payload was rejected' };
    }
    const checkoutConstraint = 'uq_sales_pharmacy_checkout_intent';
    const isKnownCheckoutUnique = code === '23505' && (
      constraint === checkoutConstraint || message.includes(checkoutConstraint) || details.includes(checkoutConstraint)
    );
    if (isKnownCheckoutUnique) {
      return { status: 409, error_code: 'CHECKOUT_CONFLICT', error: 'Checkout intent conflicts with an existing sale' };
    }
    const markerResult = exactMarker('NONCE_REPLAY')
      ? { status: 409, error_code: 'NONCE_REPLAY', error: 'Nonce was already consumed; reconcile operation status' }
      : exactMarker('PAYLOAD_CONFLICT') || exactMarker('PAYLOAD_HASH_CONFLICT')
        ? { status: 409, error_code: 'PAYLOAD_CONFLICT', error: 'Payload hash conflicts with existing operation evidence' }
        : exactMarker('IDEMPOTENCY_VIOLATION') || exactMarker('IDEMPOTENCY_CONFLICT')
          ? { status: 409, error_code: 'IDEMPOTENCY_CONFLICT', error: 'Client operation conflicts with existing evidence' }
          : exactMarker('CHECKOUT_CONFLICT')
            ? { status: 409, error_code: 'CHECKOUT_CONFLICT', error: 'Checkout intent conflicts with an existing sale' }
            : null;
    if (markerResult && (!code || code === '23505' || code === 'P0001')) return markerResult;
    // An unknown unique violation is not safe to classify as an idempotency conflict.
    return { status: 500, error_code: 'SALE_COMMIT_FAILED', error: 'Sale commit result is unavailable' };
};

export const validateAuthoritativeSaleResult = (
  value: unknown,
  expected: { client_op_id: string; sale_id: string; checkout_intent_id: string }
  ): { operation_status: 'COMMITTED' | 'ALREADY_COMMITTED'; client_op_id: string; sale_id: string; checkout_intent_id: string; processed_at: string; original_processed_at: string } | null => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.operation_status !== 'COMMITTED' && row.operation_status !== 'ALREADY_COMMITTED') return null;
    if (row.sale_id !== expected.sale_id || typeof row.processed_at !== 'string' || !Number.isFinite(Date.parse(row.processed_at))) return null;
  const payload = row.response_payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const original = payload as Record<string, unknown>;
  if (original.operation_status !== 'COMMITTED' || original.client_op_id !== expected.client_op_id ||
      original.sale_id !== expected.sale_id || original.checkout_intent_id !== expected.checkout_intent_id ||
      typeof original.processed_at !== 'string' || !Number.isFinite(Date.parse(original.processed_at))) return null;
  return {
    operation_status: row.operation_status,
    client_op_id: expected.client_op_id,
      sale_id: expected.sale_id,
      checkout_intent_id: expected.checkout_intent_id,
      processed_at: row.processed_at,
      original_processed_at: original.processed_at
    };
};

/**
 * Internal core pipeline execution with explicit dependencies.
 * ENFORCES: SIGNATURE VERIFICATION -> NONCE CONSUMPTION -> PRIVATE RPC
 */
export async function executeGatewayPipeline(
  req: Request,
  deps: GatewayPipelineDeps
): Promise<Response> {
  // 1. CORS Preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // 2. HTTP Method Validation
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed: use POST' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  try {
    // 3. User JWT Authentication
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Missing or malformed Authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const jwtToken = authHeader.replace(/^Bearer\s+/i, '').trim();
    const { user, error: userError } = await deps.getUser(jwtToken);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid or expired authentication session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const authUserId = user.id;

    // 4. Cryptographic Signature Header Check
    const signatureHeader = req.headers.get('X-Device-Signature') || req.headers.get('x-device-signature');
    if (!signatureHeader) {
      return new Response(JSON.stringify({ error: 'Missing X-Device-Signature header' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let signatureBytes: Uint8Array;
    try {
      signatureBytes = base64ToUint8Array(signatureHeader);
      if (signatureBytes.length !== 64) {
        return new Response(JSON.stringify({ error: 'Malformed signature: must be 64-byte IEEE P1363' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    } catch {
      return new Response(JSON.stringify({ error: 'Malformed signature: Base64 decode failed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 5. Parse Request Body
    let body: RequestPayload;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON request body' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const {
      pharmacy_id,
      device_id,
      branch_id,
      client_op_id,
      checkout_intent_id,
      timestamp,
      nonce,
      sale_id,
      product_id,
      batch_id,
      quantity,
      payload,
      payload_hash
    } = body;
    const checkoutIntentId = typeof checkout_intent_id === 'string' ? checkout_intent_id : '';

    // 6. UUID Parameter Validations
    if (
      !isValidUuid(pharmacy_id) ||
      !isValidUuid(device_id) ||
      !isValidUuid(branch_id) ||
      !isValidUuid(client_op_id) ||
      !isValidUuid(nonce) ||
      !isValidUuid(sale_id)
    ) {
      return new Response(JSON.stringify({ error: 'Validation failed: Invalid UUID parameter format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (deps.commitSale && (!isValidUuid(checkoutIntentId) || !payload || !Array.isArray(payload.line_items))) {
      return new Response(JSON.stringify({ error: 'Validation failed: complete sale payload and checkout intent are required', error_code: 'INVALID_SALE_PAYLOAD' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!deps.commitSale && (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0 || !isValidUuid(product_id) || !isValidUuid(batch_id))) {
      return new Response(JSON.stringify({ error: 'Validation failed: quantity must be a positive integer' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 7. Timestamp Freshness & Clock Skew Validation (±300 seconds)
    const timestampStr = String(timestamp).trim();
    const timestampMs = parseInt(timestampStr, 10);
    if (isNaN(timestampMs) || timestampMs <= 0) {
      return new Response(JSON.stringify({ error: 'Validation failed: timestamp must be a Unix millisecond integer string' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const serverNow = Date.now();
    const skewSeconds = Math.abs(serverNow - timestampMs) / 1000;
    if (skewSeconds > 300) {
      return new Response(JSON.stringify({ error: 'Timestamp expired or outside permitted ±300s clock skew window' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 8. Authoritative Active Pharmacy Membership Check
    const memberData = await deps.getPharmacyMember(authUserId, pharmacy_id);
    if (!memberData || memberData.status !== 'ACTIVE') {
      return new Response(JSON.stringify({ error: 'Forbidden: User does not hold an active membership in this pharmacy' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 9. Authoritative Device Validation
    const deviceData = await deps.getDevice(device_id);
    if (!deviceData) {
      return new Response(JSON.stringify({ error: 'Forbidden: Registered device record not found' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (deviceData.pharmacy_id !== pharmacy_id) {
      return new Response(JSON.stringify({ error: 'Forbidden: Device does not belong to specified pharmacy' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (deviceData.branch_id !== branch_id) {
      return new Response(JSON.stringify({ error: 'Forbidden: Device is not registered to specified branch' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (deviceData.status !== 'ACTIVE') {
      return new Response(JSON.stringify({ error: `Forbidden: Device status is ${deviceData.status}` }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!deviceData.public_key_pem) {
      return new Response(JSON.stringify({ error: 'Forbidden: Device public key is missing' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 10. Payload Canonicalization & SHA-256 Hash Computation
    const payloadToHash = payload || {
      batch_id,
      product_id,
      quantity,
      sale_id
    };
    const canonicalPayloadJson = canonicalizeJson(payloadToHash);
    const computedPayloadHash = await computeSha256Hex(canonicalPayloadJson);

    if (payload_hash && payload_hash.toLowerCase() !== computedPayloadHash) {
      return new Response(JSON.stringify({ error: 'Payload hash verification mismatch' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 11. Construct Canonical Signing Message (Candidate A)
    const canonicalMessage = buildCanonicalSigningMessage(
      pharmacy_id,
      device_id,
      client_op_id,
      timestampStr,
      nonce,
      computedPayloadHash
    );

    // 12. Cryptographic Signature Verification (CRITICAL: PERFORMED BEFORE NONCE CONSUMPTION)
    let cryptoKey: CryptoKey;
    try {
      cryptoKey = await importP256SpkiPem(deviceData.public_key_pem);
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to import device SPKI public key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const isSignatureValid = await verifyP256Signature(cryptoKey, signatureBytes, canonicalMessage);
    if (!isSignatureValid) {
      return new Response(JSON.stringify({ error: 'Cryptographic signature verification failed' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 13. The v1 commit RPC consumes the nonce in the same database transaction.
    // Legacy M-6 retains its separate nonce call for compatibility only.
    let rpcResult;
    try {
      if (deps.commitSale) {
        const salePayload = payload as Record<string, unknown>;
        if (salePayload.sale_id !== sale_id || salePayload.client_op_id !== client_op_id ||
            salePayload.pharmacy_id !== pharmacy_id || salePayload.branch_id !== branch_id ||
             salePayload.checkout_intent_id !== checkoutIntentId) {
          return new Response(JSON.stringify({ error: 'Signed payload routing fields do not match request', error_code: 'PAYLOAD_ROUTE_MISMATCH' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        rpcResult = await deps.commitSale({
          actor_user_id: authUserId,
          client_op_id,
          checkout_intent_id: checkoutIntentId,
          pharmacy_id,
          branch_id,
          device_id,
          nonce,
          payload_hash: computedPayloadHash,
          sale: {
            id: salePayload.sale_id,
            customer_id: salePayload.customer_id,
            currency: salePayload.currency,
            subtotal: salePayload.subtotal,
            discount: salePayload.discount,
            tax: salePayload.tax,
            total: salePayload.total,
            payment_method: salePayload.payment_method,
            amount_tendered: salePayload.amount_tendered,
            change_due: salePayload.change_due,
            payment_status: salePayload.payment_status,
            client_created_at: new Date(Number(salePayload.created_at)).toISOString()
          },
          items: salePayload.line_items as unknown[]
        });
      } else {
        const nonceConsumed = await deps.consumeNonce(nonce, pharmacy_id, device_id);
        if (!nonceConsumed) {
          return new Response(JSON.stringify({ error: 'Nonce invalid, already consumed, or device mismatch', error_code: 'NONCE_REPLAY' }), {
            status: 409,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        rpcResult = await deps.ingestStock({
          client_op_id, pharmacy_id, branch_id, device_id, sale_id,
          product_id: product_id!, batch_id: batch_id!, quantity: quantity!,
          payload_hash: computedPayloadHash
        });
      }
    } catch (error: unknown) {
      const normalized = normalizeGatewayError(error);
      return new Response(JSON.stringify({ error: normalized.error, error_code: normalized.error_code }), {
        status: normalized.status,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (deps.commitSale) {
      const authoritative = validateAuthoritativeSaleResult(rpcResult, {
        client_op_id, sale_id, checkout_intent_id: checkoutIntentId
      });
      if (!authoritative) {
        return new Response(JSON.stringify({
          error: 'Authoritative sale result was incomplete or identity-mismatched',
          error_code: 'UNCERTAIN_RESULT'
        }), { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ success: true, ...authoritative }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const stockResult = rpcResult as Awaited<ReturnType<GatewayPipelineDeps['ingestStock']>>;
    if (!stockResult || (stockResult.operation_status !== 'COMMITTED' && stockResult.operation_status !== 'ALREADY_COMMITTED') ||
        typeof stockResult.processed_at !== 'string' || !Number.isFinite(Date.parse(stockResult.processed_at))) {
      return new Response(JSON.stringify({ error: 'Authoritative stock result was incomplete', error_code: 'UNCERTAIN_RESULT' }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      client_op_id,
      operation_status: stockResult.operation_status,
      new_stock: stockResult.new_stock,
      deficit_created: stockResult.deficit_created,
      processed_at: stockResult.processed_at
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch {
    return new Response(JSON.stringify({ error: 'An unexpected internal error occurred' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Main HTTP Handler for sync-push-sale utilizing production Supabase Admin client
 */
export async function handleSyncPushSale(req: Request): Promise<Response> {
  const supabaseUrl = getEnv('SUPABASE_URL');
  const supabaseServiceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(JSON.stringify({ error: 'Server configuration error: Supabase credentials missing' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false }
  });

  const productionDeps: GatewayPipelineDeps = {
    getUser: async (token) => {
      const { data, error } = await supabaseAdmin.auth.getUser(token);
      return { user: data?.user || null, error };
    },
    getPharmacyMember: async (userId, pharmacyId) => {
      const { data } = await supabaseAdmin
        .from('pharmacy_members')
        .select('id, role, status')
        .eq('user_id', userId)
        .eq('pharmacy_id', pharmacyId)
        .eq('status', 'ACTIVE')
        .maybeSingle();
      return data;
    },
    getDevice: async (deviceId) => {
      const { data } = await supabaseAdmin
        .from('devices')
        .select('id, pharmacy_id, branch_id, status, public_key_pem')
        .eq('id', deviceId)
        .maybeSingle();
      return data;
    },
    consumeNonce: async (nonce, pharmacyId, deviceId) => {
      const { data, error } = await supabaseAdmin.rpc('consume_sync_nonce', {
        p_nonce: nonce,
        p_pharmacy_id: pharmacyId,
        p_device_id: deviceId
      });
      return !error && data === true;
    },
    ingestStock: async (params) => {
      const { data, error } = await supabaseAdmin.rpc('rpc_ingest_sale_stock_movement', {
        p_client_op_id: params.client_op_id,
        p_pharmacy_id: params.pharmacy_id,
        p_branch_id: params.branch_id,
        p_device_id: params.device_id,
        p_sale_id: params.sale_id,
        p_product_id: params.product_id,
        p_batch_id: params.batch_id,
        p_quantity: params.quantity,
        p_payload_hash: params.payload_hash
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw { code: 'PGRST116' };
      return row;
    },
    commitSale: async (params) => {
      const { data, error } = await supabaseAdmin.rpc('rpc_commit_sale_v1', {
        p_actor_user_id: params.actor_user_id,
        p_client_op_id: params.client_op_id,
        p_checkout_intent_id: params.checkout_intent_id,
        p_pharmacy_id: params.pharmacy_id,
        p_branch_id: params.branch_id,
        p_device_id: params.device_id,
        p_nonce: params.nonce,
        p_payload_hash: params.payload_hash,
        p_sale: params.sale,
        p_items: params.items
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw { code: 'PGRST116' };
      return row;
    }
  };

  return executeGatewayPipeline(req, productionDeps);
}

// Supabase Edge Function default serve entry point for Deno runtime
const denoRuntime = getDeno();
if (denoRuntime?.serve) {
  denoRuntime.serve(handleSyncPushSale);
}
