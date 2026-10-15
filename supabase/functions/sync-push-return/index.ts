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
 * Constructs the Candidate A canonical signing message for return synchronization:
 * PF-V1\nPOST\n/sync-push-return\n<pharmacy_id>\n<device_id>\n<client_op_id>\n<timestamp>\n<nonce>\n<payload_hash>
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
    '/sync-push-return',
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

export interface ReturnItemPayload {
  product_id: string;
  batch_id: string;
  quantity: number;
  restock_to_inventory?: boolean;
}

export interface ReturnRequestPayload {
  pharmacy_id: string;
  device_id: string;
  branch_id: string;
  client_op_id: string;
  timestamp: string | number;
  nonce: string;
  sale_id: string;
  items: ReturnItemPayload[];
  refund_amount: number;
  refund_payment_method: string;
  reason: string;
  payload?: Record<string, unknown>;
  payload_hash?: string;
}

export interface ReturnGatewayPipelineDeps {
  getUser: (token: string) => Promise<{ user: { id: string } | null; error: unknown }>;
  getPharmacyMember: (userId: string, pharmacyId: string) => Promise<{ id: string; role: string; status: string } | null>;
  getDevice: (deviceId: string) => Promise<{ id: string; pharmacy_id: string; branch_id: string; status: string; public_key_pem: string } | null>;
  consumeNonce: (nonce: string, pharmacyId: string, deviceId: string) => Promise<boolean>;
  processReturn: (params: {
    caller_uid: string;
    pharmacy_id: string;
    branch_id: string;
    sale_id: string;
    items: ReturnItemPayload[];
    refund_amount: number;
    refund_payment_method: string;
    reason: string;
    client_op_id: string;
    payload_hash: string;
    user_token: string;
  }) => Promise<{
    return_id: string;
    status: string;
    refund_amount: number;
    error?: string;
  }>;
}

/**
 * Pure, isolated execution pipeline for return synchronization.
 */
export async function executeReturnGatewayPipeline(
  req: Request,
  deps: ReturnGatewayPipelineDeps
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 1. Authorization Header Extraction
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
  const token = authHeader.replace('Bearer ', '').trim();

  // 2. Cryptographic Signature Header Extraction
  const signatureBase64 = req.headers.get('X-Device-Signature');
  if (!signatureBase64) {
    return new Response(JSON.stringify({ error: 'Missing required X-Device-Signature header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 3. Request Body Parsing
  let body: ReturnRequestPayload;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 4. Validate Structural Fields & UUIDs
  if (
    !isValidUuid(body.pharmacy_id) ||
    !isValidUuid(body.device_id) ||
    !isValidUuid(body.branch_id) ||
    !isValidUuid(body.client_op_id) ||
    !isValidUuid(body.sale_id) ||
    !isValidUuid(body.nonce)
  ) {
    return new Response(JSON.stringify({ error: 'Validation failed: Invalid UUID in header fields' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return new Response(JSON.stringify({ error: 'Validation failed: items array must not be empty' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  for (const item of body.items) {
    if (!isValidUuid(item.product_id) || !isValidUuid(item.batch_id) || item.quantity <= 0) {
      return new Response(JSON.stringify({ error: 'Validation failed: Invalid item format or non-positive quantity' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }

  // 5. Authenticate JWT Caller
  const { user, error: authError } = await deps.getUser(token);
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Authentication failed: Invalid session JWT' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 6. Validate Active Pharmacy Membership & 'sales.refund' Permission
  const member = await deps.getPharmacyMember(user.id, body.pharmacy_id.toLowerCase());
  if (!member || member.status !== 'ACTIVE') {
    return new Response(JSON.stringify({ error: 'Access Denied: Caller has no active membership in target pharmacy' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // CASHIER role strictly prohibited from authorizing returns
  if (member.role !== 'OWNER' && member.role !== 'MANAGER' && member.role !== 'PHARMACIST') {
    return new Response(JSON.stringify({ error: 'Access Denied: sales.refund permission required. CASHIER cannot authorize returns.' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 7. Validate Device Status and Branch Context
  const device = await deps.getDevice(body.device_id.toLowerCase());
  if (!device) {
    return new Response(JSON.stringify({ error: 'Device not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (device.pharmacy_id.toLowerCase() !== body.pharmacy_id.toLowerCase()) {
    return new Response(JSON.stringify({ error: 'Device tenant mismatch' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (device.branch_id.toLowerCase() !== body.branch_id.toLowerCase()) {
    return new Response(JSON.stringify({ error: 'Device branch mismatch' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  if (device.status !== 'ACTIVE') {
    return new Response(JSON.stringify({ error: 'Device is blocked, suspended, or revoked' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 8. Timestamp Drift Tolerance (+- 5 minutes = 300,000 ms)
  const reqTimeMs = typeof body.timestamp === 'number' ? body.timestamp : parseInt(body.timestamp, 10);
  if (isNaN(reqTimeMs)) {
    return new Response(JSON.stringify({ error: 'Invalid timestamp format' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const nowMs = Date.now();
  if (Math.abs(nowMs - reqTimeMs) > 300000) {
    return new Response(JSON.stringify({ error: 'Request timestamp out of allowable sync window (+- 5 minutes)' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 9. Reconstruct Canonical Payload & Compute Payload Hash
  const subPayload = body.payload || {
    sale_id: body.sale_id,
    branch_id: body.branch_id,
    items: body.items,
    refund_amount: body.refund_amount,
    refund_payment_method: body.refund_payment_method,
    reason: body.reason
  };

  const canonicalJson = canonicalizeJson(subPayload);
  const computedPayloadHash = await computeSha256Hex(canonicalJson);

  if (body.payload_hash && body.payload_hash.toLowerCase() !== computedPayloadHash) {
    return new Response(JSON.stringify({ error: 'Tamper detected: payload_hash mismatch' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 10. Construct Candidate A Signing Message for /sync-push-return
  const canonicalMessage = buildCanonicalSigningMessage(
    body.pharmacy_id,
    body.device_id,
    body.client_op_id,
    reqTimeMs.toString(),
    body.nonce,
    computedPayloadHash
  );

  // 11. Cryptographic Signature Verification
  let signatureBytes: Uint8Array;
  try {
    signatureBytes = base64ToUint8Array(signatureBase64);
  } catch {
    return new Response(JSON.stringify({ error: 'Malformed base64 in X-Device-Signature' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  let publicKey: CryptoKey;
  try {
    publicKey = await importP256SpkiPem(device.public_key_pem);
  } catch (err: unknown) {
    return new Response(JSON.stringify({ error: 'Invalid device public key format in database' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  const isValidSig = await verifyP256Signature(publicKey, signatureBytes, canonicalMessage);
  if (!isValidSig) {
    // CRITICAL: Under NO circumstances consume the nonce when signature verification fails!
    return new Response(JSON.stringify({ error: 'Cryptographic signature verification failed' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 12. Nonce Consumption (Executed ONLY AFTER signature verification succeeds)
  const nonceConsumed = await deps.consumeNonce(
    body.nonce.toLowerCase(),
    body.pharmacy_id.toLowerCase(),
    body.device_id.toLowerCase()
  );

  if (!nonceConsumed) {
    return new Response(JSON.stringify({ error: 'Replay detected: nonce has already been consumed or is invalid' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }

  // 13. Authoritative Return Processing RPC Invocation
  try {
    const result = await deps.processReturn({
      caller_uid: user.id,
      pharmacy_id: body.pharmacy_id.toLowerCase(),
      branch_id: body.branch_id.toLowerCase(),
      sale_id: body.sale_id.toLowerCase(),
      items: body.items,
      refund_amount: body.refund_amount,
      refund_payment_method: body.refund_payment_method,
      reason: body.reason,
      client_op_id: body.client_op_id.toLowerCase(),
      payload_hash: computedPayloadHash,
      user_token: token
    });

    if (result.error) {
      const isBusinessRuleError =
        result.error.includes('EXCEEDS_RETURNABLE_QUANTITY') ||
        result.error.includes('INVALID_QUANTITY') ||
        result.error.includes('ITEM_NOT_IN_SALE') ||
        result.error.includes('SALE_NOT_FOUND') ||
        result.error.includes('IDEMPOTENCY_VIOLATION') ||
        result.error.includes('FORBIDDEN');

      return new Response(JSON.stringify({ error: result.error }), {
        status: isBusinessRuleError ? 409 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(
      JSON.stringify({
        status: 'COMMITTED',
        return_id: result.return_id,
        refund_amount: result.refund_amount,
        client_op_id: body.client_op_id.toLowerCase()
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (rpcErr: unknown) {
    const errorMsg = rpcErr instanceof Error ? rpcErr.message : 'Database return execution failed';
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Main HTTP Handler for sync-push-return utilizing production Supabase Admin client
 */
export async function handleSyncPushReturn(req: Request): Promise<Response> {
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

  const productionDeps: ReturnGatewayPipelineDeps = {
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
    processReturn: async (params) => {
      // Execute rpc_process_sale_return with user context
      const userClient = createClient(supabaseUrl, getEnv('SUPABASE_ANON_KEY') || supabaseServiceKey, {
        global: {
          headers: {
            Authorization: `Bearer ${params.user_token}`
          }
        }
      });

      const { data, error } = await userClient.rpc('rpc_process_sale_return', {
        p_pharmacy_id: params.pharmacy_id,
        p_branch_id: params.branch_id,
        p_sale_id: params.sale_id,
        p_items: params.items,
        p_refund_amount: params.refund_amount,
        p_refund_payment_method: params.refund_payment_method,
        p_reason: params.reason,
        p_client_op_id: params.client_op_id,
        p_payload_hash: params.payload_hash
      });

      if (error) {
        return { return_id: '', status: 'FAILED', refund_amount: 0, error: error.message };
      }

      const row = Array.isArray(data) ? data[0] : data;
      return {
        return_id: row?.return_id || '',
        status: row?.status || 'COMMITTED',
        refund_amount: Number(row?.refund_amount) || params.refund_amount
      };
    }
  };

  return await executeReturnGatewayPipeline(req, productionDeps);
}

// Serve HTTP requests in Deno runtime
const deno = getDeno();
if (deno?.serve) {
  deno.serve(handleSyncPushReturn);
}
