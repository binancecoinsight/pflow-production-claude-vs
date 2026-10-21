import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-device-signature, content-type' };
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const canonicalize = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(object[key])}`).join(',')}}`;
};
const sha256 = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const signingMessage = (body: Record<string, unknown>, hash: string) => ['PF-V2', 'POST', '/sync-push-return-v2', body.pharmacy_id, body.device_id, body.client_op_id, body.timestamp, body.nonce, hash].join('\n');
const decodeBase64 = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
const importKey = async (pem: string) => {
  const content = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g, '');
  return crypto.subtle.importKey('spki', decodeBase64(content), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
};
const error = (status: number, code: string) => new Response(JSON.stringify({ error: code, error_code: code }), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
type RpcError = { code?: string; message?: string };
const rpcFailure = (rpcError: RpcError) => {
  const message = rpcError.message || '';
  // Diagnostics intentionally omit the database message, request payload and credentials.
  console.error(JSON.stringify({ event: 'refund_v2_rpc_failure', sqlstate: rpcError.code || 'UNKNOWN' }));
  if (rpcError.code === '42501') return error(403, 'REFUND_FORBIDDEN');
  if (rpcError.code === '23505') {
    if (message.includes('NONCE_REPLAY')) return error(409, 'NONCE_REPLAY');
    if (message.includes('IDEMPOTENCY_VIOLATION')) return error(409, 'IDEMPOTENCY_CONFLICT');
    return error(409, 'OPERATION_CONFLICT');
  }
  if (rpcError.code === '22023') return error(400, 'INVALID_REFUND_REQUEST');
  if (rpcError.code === '23514' || rpcError.code === '23503') return error(409, 'REFUND_NOT_ALLOWED');
  return error(500, 'REFUND_PROCESSING_FAILED');
};

export async function handleSyncPushReturnV2(request: Request): Promise<Response> {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return error(405, 'METHOD_NOT_ALLOWED');
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  const signature = request.headers.get('X-Device-Signature');
  if (!url || !serviceKey || !token || !signature) return error(401, 'UNAUTHENTICATED');
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return error(400, 'INVALID_JSON'); }
  if (![body.pharmacy_id, body.device_id, body.branch_id, body.client_op_id, body.nonce, body.sale_id].every(uuid)
    || body.contract_version !== 2 || !Array.isArray(body.items) || !body.items.length
    || !Number.isSafeInteger(body.expected_refund_amount_minor) || Number(body.expected_refund_amount_minor) <= 0) return error(400, 'INVALID_REFUND_REQUEST');
  const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return error(401, 'INVALID_JWT');
  const payload = body.payload;
  if (!payload || typeof payload !== 'object') return error(400, 'MISSING_SIGNED_PAYLOAD');
  const payloadHash = await sha256(canonicalize(payload));
  if (body.payload_hash !== payloadHash) return error(400, 'PAYLOAD_HASH_MISMATCH');
  const timestamp = Number(body.timestamp);
  if (!Number.isSafeInteger(timestamp) || Math.abs(Date.now() - timestamp) > 300000) return error(401, 'TIMESTAMP_OUT_OF_RANGE');
  const { data: device, error: deviceError } = await admin.from('devices').select('pharmacy_id,branch_id,status,public_key_pem').eq('id', body.device_id).maybeSingle();
  if (deviceError) {
    // Do not expose database diagnostics, identifiers, or device key material.
    console.error(JSON.stringify({ event: 'refund_v2_device_lookup_failed', sqlstate: deviceError.code || 'UNKNOWN' }));
    return error(500, 'DEVICE_LOOKUP_FAILED');
  }
  if (!device || device.pharmacy_id !== body.pharmacy_id || device.branch_id !== body.branch_id || device.status !== 'ACTIVE') return error(403, 'DEVICE_BRANCH_FORBIDDEN');
  try {
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await importKey(device.public_key_pem), decodeBase64(signature), new TextEncoder().encode(signingMessage(body, payloadHash)));
    if (!valid) return error(401, 'SIGNATURE_INVALID');
  } catch { return error(401, 'SIGNATURE_INVALID'); }
  const { data, error: rpcError } = await admin.rpc('rpc_process_sale_return_v2', {
    p_actor_user_id: userData.user.id, p_pharmacy_id: body.pharmacy_id, p_branch_id: body.branch_id,
    p_device_id: body.device_id, p_client_op_id: body.client_op_id, p_nonce: body.nonce,
    p_payload_hash: payloadHash, p_sale_id: body.sale_id, p_items: body.items,
    p_expected_refund_amount_minor: body.expected_refund_amount_minor,
    p_refund_payment_method: body.original_payment_method, p_reason: (payload as Record<string, unknown>).reason
  });
  if (rpcError) return rpcFailure(rpcError);
  const row = Array.isArray(data) ? data[0] : data;
  const responsePayload = row?.response_payload;
  const response = responsePayload && typeof responsePayload === 'object' && !Array.isArray(responsePayload)
    ? { ...responsePayload, operation_status: row.operation_status }
    : row;
  return new Response(JSON.stringify(response), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

Deno.serve(handleSyncPushReturnV2);
