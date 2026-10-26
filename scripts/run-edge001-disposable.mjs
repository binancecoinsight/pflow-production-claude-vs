import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID, webcrypto } from 'node:crypto';
import { loadAndVerifyAcceptanceTarget } from './acceptance/target-guard.mjs';
import { preserveFailureThroughCleanup, runGuardedEdgeCleanup } from './acceptance/edge-fixture-cleanup.mjs';

const crypto = webcrypto;
const target = loadAndVerifyAcceptanceTarget(process.env, execFileSync);
const api = target.apiUrl;
const service = process.env.PF_ACCEPTANCE_SERVICE_ROLE_KEY;
const anon = process.env.PF_ACCEPTANCE_ANON_KEY;
if (!service || !anon) throw new Error('ABORT: acceptance API credentials must be supplied out of band.');
const id = () => randomUUID();
const prefix = 'EDGE001_PFLOW_DISPOSABLE';
const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const hash = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((x) => x.toString(16).padStart(2, '0')).join('');
const b64 = (bytes) => Buffer.from(bytes).toString('base64');
const req = async (path, options = {}) => {
  const response = await fetch(`${api}${path}`, options);
  const text = await response.text(); let data; try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}`);
  return data;
};
const adminHeaders = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json', Prefer: 'return=representation' };
const psql = (sql) => {
  const result = spawnSync('docker', ['exec', '-i', target.dbContainer, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-t', '-A'], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Disposable fixture database command failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};

const pharmacy = id(), branch = id(), userEmail = `edge001-${Date.now()}-${id().slice(0, 8)}@local.test`, password = `E1!${randomUUID()}aA`, device = id(), product = id(), batch = id(), sale = id(), item = id(), op = id(), nonce = id();
const bootstrapName = `EDGE001_BOOTSTRAP_${pharmacy}`;
const cleanupRoots = {
  pharmacies: [{ id: pharmacy, name: prefix }],
  users: [{ id: null, email: userEmail, bootstrapName }],
};

await preserveFailureThroughCleanup(async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64').match(/.{1,64}/g).join('\n');
  const publicPem = `-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----`;
  const created = await req('/auth/v1/admin/users', { method: 'POST', headers: adminHeaders, body: JSON.stringify({ email: userEmail, password, email_confirm: true, user_metadata: { pharmacy_name: bootstrapName } }) });
  const user = created?.id || created?.user?.id;
  if (!user) throw new Error('Local Auth did not return user id');
  cleanupRoots.users[0].id = user;
  const session = await req('/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: userEmail, password }) });
  if (!session?.access_token) throw new Error('Local Auth did not issue access token');

  psql(`
  INSERT INTO public.pharmacies(id,name,owner_id) VALUES ('${pharmacy}','${prefix}','${user}');
  INSERT INTO public.branches(id,pharmacy_id,name,is_main) VALUES ('${branch}','${pharmacy}','EDGE001',true);
  INSERT INTO public.pharmacy_members(user_id,pharmacy_id,role,default_branch_id,status) VALUES ('${user}','${pharmacy}','OWNER','${branch}','ACTIVE');
  INSERT INTO public.devices(id,pharmacy_id,branch_id,registered_by,device_name,platform,public_key_pem,status) VALUES ('${device}','${pharmacy}','${branch}','${user}','${prefix}','WEB',$pem$${publicPem}$pem$,'ACTIVE');
  INSERT INTO public.products(id,pharmacy_id,name,selling_price) VALUES ('${product}','${pharmacy}','${prefix}',250);
  INSERT INTO public.inventory_batches(id,pharmacy_id,product_id,branch_id,batch_number,quantity,cost_price,selling_price) VALUES ('${batch}','${pharmacy}','${product}','${branch}','${prefix}',10,1,250);
  INSERT INTO public.sales(id,pharmacy_id,branch_id,cashier_id,currency,subtotal,discount,tax,total,payment_method,amount_tendered,change_due,payment_status) VALUES ('${sale}','${pharmacy}','${branch}','${user}','NGN',500,0,0,500,'CASH',500,0,'SETTLED');
  INSERT INTO public.sale_items(id,sale_id,pharmacy_id,product_id,batch_id,quantity,unit_price,discount,tax,total) VALUES ('${item}','${sale}','${pharmacy}','${product}','${batch}',2,250,0,0,500);
  `);
  const payload = { reason: prefix };
  const payload_hash = await hash(canonical(payload));
  const body = { pharmacy_id: pharmacy, branch_id: branch, device_id: device, client_op_id: op, nonce, sale_id: sale, contract_version: 2, items: [{ sale_item_id: item, quantity: 1 }], expected_refund_amount_minor: 250, original_payment_method: 'CASH', payload, payload_hash, timestamp: Date.now() };
  const message = ['PF-V2', 'POST', '/sync-push-return-v2', body.pharmacy_id, body.device_id, body.client_op_id, body.timestamp, body.nonce, payload_hash].join('\n');
  const signature = b64(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(message))));
  const response = await fetch(`${api}/functions/v1/sync-push-return-v2`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'X-Device-Signature': signature, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const responseText = await response.text();
  let result = null;
  try { result = responseText ? JSON.parse(responseText) : null; } catch { /* Never report an unsanitized non-JSON response body. */ }
  const applicationErrorCode = typeof result?.error_code === 'string' ? result.error_code : typeof result?.error === 'string' ? result.error : response.ok ? null : 'UNPARSEABLE_EDGE_RESPONSE';
  const applicationErrorMessage = typeof result?.message === 'string' ? result.message : null;
  const preSignatureCodes = new Set(['UNAUTHENTICATED', 'INVALID_JSON', 'INVALID_REFUND_REQUEST', 'INVALID_JWT', 'MISSING_SIGNED_PAYLOAD', 'PAYLOAD_HASH_MISMATCH', 'TIMESTAMP_OUT_OF_RANGE', 'DEVICE_LOOKUP_FAILED', 'DEVICE_BRANCH_FORBIDDEN']);
  const signatureReached = response.ok || applicationErrorCode === 'SIGNATURE_INVALID' ? true : preSignatureCodes.has(applicationErrorCode) ? false : null;
  const rpcReached = response.ok || ['REFUND_FORBIDDEN', 'NONCE_REPLAY', 'IDEMPOTENCY_CONFLICT', 'OPERATION_CONFLICT', 'REFUND_NOT_ALLOWED', 'REFUND_PROCESSING_FAILED'].includes(applicationErrorCode);
  const state = JSON.parse(psql(`SELECT json_build_object(
    'returns',(SELECT count(*) FROM public.sale_returns WHERE original_sale_id='${sale}'),
    'ledger',(SELECT count(*) FROM public.stock_ledger WHERE pharmacy_id='${pharmacy}'),
    'journal',(SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='${pharmacy}' AND client_op_id='${op}'),
    'nonces',(SELECT count(*) FROM public.sync_nonces WHERE pharmacy_id='${pharmacy}' AND nonce='${nonce}'),
    'stock',(SELECT quantity FROM public.inventory_batches WHERE id='${batch}'),
    'refund_amount',(SELECT refund_amount_minor FROM public.sale_returns WHERE original_sale_id='${sale}'),
    'authorized_by',(SELECT authorized_by FROM public.sale_returns WHERE original_sale_id='${sale}')
  );`));
  const pass = response.status === 200 && result?.operation_status === 'COMMITTED' && result?.refund_amount_minor === 250 && state.returns === 1 && state.authorized_by === user && state.ledger === 1 && state.journal === 1 && state.nonces === 1 && state.stock === 11 && state.refund_amount === 250;
  console.log(JSON.stringify({ pass, http_status: response.status, application_error_code: applicationErrorCode, application_error_message: applicationErrorMessage, signature_verification_reached: signatureReached, rpc_execution_reached: rpcReached, operation_status: result?.operation_status, expected_refund_minor: 250, actual_refund_minor: result?.refund_amount_minor, counts: { returns: state.returns, ledger: state.ledger, journal: state.journal, nonces: state.nonces }, inventory: { before: 10, after: state.stock }, actor_bound: state.authorized_by === user, fixture: { pharmacy, branch, device, sale, sale_item: item, client_op_id: op, nonce, actor: user } }));
  if (!pass) throw new Error('EDGE-001 acceptance assertions failed.');
}, async () => {
  const proof = runGuardedEdgeCleanup(psql, cleanupRoots);
  console.log(JSON.stringify({ cleanup: 'EDGE-001', pass: true, proof }));
});

