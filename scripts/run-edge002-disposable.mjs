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
const prefix = 'EDGE002_PFLOW_DISPOSABLE';
const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const hash = async (s) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map((x) => x.toString(16).padStart(2, '0')).join('');
const psql = (sql) => {
  const result = spawnSync('docker', ['exec', '-i', target.dbContainer, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-t', '-A'], { input: sql, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Disposable fixture/state command failed: ${result.stderr.trim()}`);
  return result.stdout.trim();
};
const req = async (path, options) => {
  const response = await fetch(`${api}${path}`, options);
  const text = await response.text(); let data = null; try { data = text ? JSON.parse(text) : null; } catch { /* sanitized failure below */ }
  if (!response.ok) throw new Error(`${path} failed with HTTP ${response.status}`);
  return data;
};

const fixture = { pharmacy: id(), branch: id(), product: id(), batch: id(), sale: id(), item: id(), device: id(), originalOp: id(), originalNonce: id() };
const email = `edge002-${Date.now()}-${id().slice(0, 8)}@local.test`;
const password = `E2!${id()}aA`;
const bootstrapName = `EDGE002_BOOTSTRAP_${fixture.pharmacy}`;
const cleanupRoots = { pharmacies: [{ id: fixture.pharmacy, name: prefix }], users: [{ id: null, email, bootstrapName }] };

await preserveFailureThroughCleanup(async () => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const spki = Buffer.from(await crypto.subtle.exportKey('spki', publicKey)).toString('base64').match(/.{1,64}/g).join('\n');
  const pem = `-----BEGIN PUBLIC KEY-----\n${spki}\n-----END PUBLIC KEY-----`;
  const created = await req('/auth/v1/admin/users', { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, email_confirm: true, user_metadata: { pharmacy_name: bootstrapName } }) });
  const user = created?.id || created?.user?.id;
  if (!user) throw new Error('Local Auth did not return user id');
  cleanupRoots.users[0].id = user;
  const session = await req('/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!session?.access_token) throw new Error('Local Auth did not issue access token');
  psql(`
  INSERT INTO public.pharmacies(id,name,owner_id) VALUES ('${fixture.pharmacy}','${prefix}','${user}');
  INSERT INTO public.branches(id,pharmacy_id,name,is_main) VALUES ('${fixture.branch}','${fixture.pharmacy}','EDGE002',true);
  INSERT INTO public.pharmacy_members(user_id,pharmacy_id,role,default_branch_id,status) VALUES ('${user}','${fixture.pharmacy}','OWNER','${fixture.branch}','ACTIVE');
  INSERT INTO public.devices(id,pharmacy_id,branch_id,registered_by,device_name,platform,public_key_pem,status) VALUES ('${fixture.device}','${fixture.pharmacy}','${fixture.branch}','${user}','${prefix}','WEB',$pem$${pem}$pem$,'ACTIVE');
  INSERT INTO public.products(id,pharmacy_id,name,selling_price) VALUES ('${fixture.product}','${fixture.pharmacy}','${prefix}',250);
  INSERT INTO public.inventory_batches(id,pharmacy_id,product_id,branch_id,batch_number,quantity,cost_price,selling_price) VALUES ('${fixture.batch}','${fixture.pharmacy}','${fixture.product}','${fixture.branch}','${prefix}',10,1,250);
  INSERT INTO public.sales(id,pharmacy_id,branch_id,cashier_id,currency,subtotal,discount,tax,total,payment_method,amount_tendered,change_due,payment_status) VALUES ('${fixture.sale}','${fixture.pharmacy}','${fixture.branch}','${user}','NGN',500,0,0,500,'CASH',500,0,'SETTLED');
  INSERT INTO public.sale_items(id,sale_id,pharmacy_id,product_id,batch_id,quantity,unit_price,discount,tax,total) VALUES ('${fixture.item}','${fixture.sale}','${fixture.pharmacy}','${fixture.product}','${fixture.batch}',2,250,0,0,500);
  `);
  const sign = async (body) => Buffer.from(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, new TextEncoder().encode(['PF-V2', 'POST', '/sync-push-return-v2', body.pharmacy_id, body.device_id, body.client_op_id, body.timestamp, body.nonce, body.payload_hash].join('\n'))))).toString('base64');
  const makeBody = async (client_op_id, nonce, payload) => ({ pharmacy_id: fixture.pharmacy, branch_id: fixture.branch, device_id: fixture.device, client_op_id, nonce, sale_id: fixture.sale, contract_version: 2, items: [{ sale_item_id: fixture.item, quantity: 1 }], expected_refund_amount_minor: 250, original_payment_method: 'CASH', payload, payload_hash: await hash(canonical(payload)), timestamp: Date.now() });
  const post = async (body) => {
    const response = await fetch(`${api}/functions/v1/sync-push-return-v2`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${session.access_token}`, 'X-Device-Signature': await sign(body), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const text = await response.text(); let payload = null; try { payload = text ? JSON.parse(text) : null; } catch { /* never report raw response */ }
    return { status: response.status, operation_status: payload?.operation_status ?? null, error_code: payload?.error_code ?? payload?.error ?? (response.ok ? null : 'UNPARSEABLE_EDGE_RESPONSE') };
  };
  const state = (op, nonce) => JSON.parse(psql(`SELECT json_build_object('returns',(SELECT count(*) FROM public.sale_returns WHERE original_sale_id='${fixture.sale}'),'ledger',(SELECT count(*) FROM public.stock_ledger WHERE pharmacy_id='${fixture.pharmacy}'),'journal_original',(SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='${fixture.pharmacy}' AND client_op_id='${fixture.originalOp}'),'journal_test',(SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='${fixture.pharmacy}' AND client_op_id='${op}'),'nonces',(SELECT count(*) FROM public.sync_nonces WHERE pharmacy_id='${fixture.pharmacy}'),'nonce_test',(SELECT count(*) FROM public.sync_nonces WHERE pharmacy_id='${fixture.pharmacy}' AND nonce='${nonce}'),'stock',(SELECT quantity FROM public.inventory_batches WHERE id='${fixture.batch}'));`));
  const requirePass = (condition, scenario, expected, actual, before, after) => { if (!condition) { console.log(JSON.stringify({ pass: false, scenario, expected, actual, before, after })); throw new Error(`${scenario} acceptance assertions failed.`); } };

  const originalPayload = { reason: prefix };
  const originalBody = await makeBody(fixture.originalOp, fixture.originalNonce, originalPayload);
  const originalResponse = await post(originalBody);
  requirePass(originalResponse.status === 200 && originalResponse.operation_status === 'COMMITTED', 'EDGE-002-SETUP', { status: 200, operation_status: 'COMMITTED' }, originalResponse);

  const replayNonce = id(), replayBody = await makeBody(fixture.originalOp, replayNonce, originalPayload);
  const replayBefore = state(fixture.originalOp, replayNonce), replayResponse = await post(replayBody), replayAfter = state(fixture.originalOp, replayNonce);
  requirePass(replayResponse.status === 200 && replayResponse.operation_status === 'ALREADY_COMMITTED' && replayAfter.returns === replayBefore.returns && replayAfter.ledger === replayBefore.ledger && replayAfter.journal_original === replayBefore.journal_original && replayAfter.stock === replayBefore.stock && replayAfter.nonces === replayBefore.nonces + 1 && replayAfter.nonce_test === 1, 'EDGE-002-A', { status: 200, operation_status: 'ALREADY_COMMITTED', nonce_delta: 1, no_financial_mutation: true }, replayResponse, replayBefore, replayAfter);

  const conflictNonce = id(), conflictBody = await makeBody(fixture.originalOp, conflictNonce, { reason: 'EDGE002_CONFLICT' });
  const conflictBefore = state(fixture.originalOp, conflictNonce), conflictResponse = await post(conflictBody), conflictAfter = state(fixture.originalOp, conflictNonce);
  requirePass(conflictResponse.status === 409 && conflictResponse.error_code === 'IDEMPOTENCY_CONFLICT' && JSON.stringify(conflictAfter) === JSON.stringify(conflictBefore), 'EDGE-002-B', { status: 409, error_code: 'IDEMPOTENCY_CONFLICT', no_mutation: true }, conflictResponse, conflictBefore, conflictAfter);

  const newOperation = id(), nonceBefore = state(newOperation, fixture.originalNonce), nonceBody = await makeBody(newOperation, fixture.originalNonce, originalPayload);
  const nonceResponse = await post(nonceBody), nonceAfter = state(newOperation, fixture.originalNonce);
  requirePass(nonceResponse.status === 409 && nonceResponse.error_code === 'NONCE_REPLAY' && JSON.stringify(nonceAfter) === JSON.stringify(nonceBefore), 'EDGE-002-C', { status: 409, error_code: 'NONCE_REPLAY', no_mutation: true }, nonceResponse, nonceBefore, nonceAfter);
  console.log(JSON.stringify({ pass: true, actor: user, scenarios: { 'EDGE-002-A': { response: replayResponse, before: replayBefore, after: replayAfter }, 'EDGE-002-B': { response: conflictResponse, before: conflictBefore, after: conflictAfter }, 'EDGE-002-C': { response: nonceResponse, before: nonceBefore, after: nonceAfter } } }));
}, async () => {
  const proof = runGuardedEdgeCleanup(psql, cleanupRoots);
  console.log(JSON.stringify({ cleanup: 'EDGE-002', pass: true, proof }));
});
