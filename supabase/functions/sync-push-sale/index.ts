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
  product_id: string;
  batch_id: string;
  quantity: number;
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
}

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
      timestamp,
      nonce,
      sale_id,
      product_id,
      batch_id,
      quantity,
      payload,
      payload_hash
    } = body;

    // 6. UUID Parameter Validations
    if (
      !isValidUuid(pharmacy_id) ||
      !isValidUuid(device_id) ||
      !isValidUuid(branch_id) ||
      !isValidUuid(client_op_id) ||
      !isValidUuid(nonce) ||
      !isValidUuid(sale_id) ||
      !isValidUuid(product_id) ||
      !isValidUuid(batch_id)
    ) {
      return new Response(JSON.stringify({ error: 'Validation failed: Invalid UUID parameter format' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
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

    // 13. Atomically Consume the Nonce (ONLY AFTER SIGNATURE VERIFICATION SUCCEEDS)
    const nonceConsumed = await deps.consumeNonce(nonce, pharmacy_id, device_id);
    if (!nonceConsumed) {
      return new Response(JSON.stringify({ error: 'Nonce invalid, already consumed, or device mismatch' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // 14. Private Stock-Ingestion RPC Call
    let rpcResult;
    try {
      rpcResult = await deps.ingestStock({
        client_op_id,
        pharmacy_id,
        branch_id,
        device_id,
        sale_id,
        product_id,
        batch_id,
        quantity,
        payload_hash: computedPayloadHash
      });
    } catch {
      return new Response(JSON.stringify({ error: 'Stock ingestion rejected by database transaction' }), {
        status: 409,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      client_op_id,
      operation_status: rpcResult.operation_status || 'COMMITTED',
      new_stock: rpcResult.new_stock,
      deficit_created: rpcResult.deficit_created,
      processed_at: rpcResult.processed_at || new Date().toISOString()
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
      return row || { operation_status: 'COMMITTED' };
    }
  };

  return executeGatewayPipeline(req, productionDeps);
}

// Supabase Edge Function default serve entry point for Deno runtime
const denoRuntime = getDeno();
if (denoRuntime?.serve) {
  denoRuntime.serve(handleSyncPushSale);
}
