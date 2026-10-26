import { execFileSync, spawnSync } from 'node:child_process';
import { randomUUID, webcrypto } from 'node:crypto';
import { loadAndVerifyAcceptanceTarget } from './acceptance/target-guard.mjs';
import { preserveFailureThroughCleanup, runGuardedEdgeCleanup } from './acceptance/edge-fixture-cleanup.mjs';

const target = loadAndVerifyAcceptanceTarget(process.env, execFileSync);
const crypto = webcrypto, api = target.apiUrl, endpoint = `${api}/functions/v1/sync-push-return-v2`;
const service = process.env.PF_ACCEPTANCE_SERVICE_ROLE_KEY, anon = process.env.PF_ACCEPTANCE_ANON_KEY;
if (!service || !anon) throw new Error('ABORT: acceptance API credentials must be supplied out of band.');
const id = () => randomUUID();
const canonical = (v) => v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
const hash = async (value) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, '0')).join('');
const psql = (sql) => { const r = spawnSync('docker', ['exec', '-i', target.dbContainer, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-t', '-A'], { input: sql, encoding: 'utf8' }); if (r.status) throw new Error(`Disposable fixture/state command failed: ${r.stderr.trim()}`); return r.stdout.trim(); };
const fixture = { pa: id(), pb: id(), a1: id(), a2: id(), b1: id(), productA: id(), productB: id(), batchA1: id(), batchA2: id(), batchB1: id(), saleA1: id(), saleA2: id(), saleB1: id(), saleEur: id(), itemA1: id(), itemA2: id(), itemB1: id(), itemEur: id() };
const runTag = `${Date.now()}-${id().slice(0, 8)}`;
const userSpecs = ['owner-a', 'owner-b', 'outsider', 'cashier', 'pharmacist'].map((tag) => ({ tag, id: null, email: `edge003-${tag}-${runTag}@local.test`, bootstrapName: `EDGE003_BOOTSTRAP_${tag}_${fixture.pa}` }));
const cleanupRoots = { pharmacies: [{ id: fixture.pa, name: 'EDGE003-A' }, { id: fixture.pb, name: 'EDGE003-B' }], users: userSpecs };
const authUser = async (spec) => { const password = `E3!${id()}aA`; const created = await fetch(`${api}/auth/v1/admin/users`, { method: 'POST', headers: { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: spec.email, password, email_confirm: true, user_metadata: { pharmacy_name: spec.bootstrapName } }) }); const createdBody = await created.json(); const user = createdBody.id || createdBody.user?.id; if (!created.ok || !user) throw new Error(`Auth creation failed: ${spec.tag}`); spec.id = user; const signed = await fetch(`${api}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: anon, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: spec.email, password }) }); const session = await signed.json(); if (!signed.ok || !session.access_token) throw new Error(`Auth session failed: ${spec.tag}`); return { user, token: session.access_token }; };

await preserveFailureThroughCleanup(async () => {
const makeSigner = async (spec) => { const identity = await authUser(spec); const keys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); const encoded = Buffer.from(await crypto.subtle.exportKey('spki', keys.publicKey)).toString('base64').match(/.{1,64}/g).join('\n'); return { ...identity, device: id(), privateKey: keys.privateKey, pem: `-----BEGIN PUBLIC KEY-----\n${encoded}\n-----END PUBLIC KEY-----` }; };
const ownerA = await makeSigner(userSpecs[0]), ownerB = await makeSigner(userSpecs[1]), outsider = await makeSigner(userSpecs[2]), cashier = await makeSigner(userSpecs[3]), pharmacist = await makeSigner(userSpecs[4]);
const inactiveDevice = id();
const inactiveKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const inactiveSpki = Buffer.from(await crypto.subtle.exportKey('spki', inactiveKeys.publicKey)).toString('base64').match(/.{1,64}/g).join('\n');
const inactivePem = `-----BEGIN PUBLIC KEY-----\n${inactiveSpki}\n-----END PUBLIC KEY-----`;
psql(`
INSERT INTO public.pharmacies(id,name,owner_id) VALUES ('${fixture.pa}','EDGE003-A','${ownerA.user}'),('${fixture.pb}','EDGE003-B','${ownerB.user}');
INSERT INTO public.branches(id,pharmacy_id,name,is_main) VALUES ('${fixture.a1}','${fixture.pa}','A1',true),('${fixture.a2}','${fixture.pa}','A2',false),('${fixture.b1}','${fixture.pb}','B1',true);
INSERT INTO public.pharmacy_members(user_id,pharmacy_id,role,default_branch_id,status) VALUES ('${ownerA.user}','${fixture.pa}','OWNER','${fixture.a1}','ACTIVE'),('${ownerB.user}','${fixture.pb}','OWNER','${fixture.b1}','ACTIVE'),('${cashier.user}','${fixture.pa}','CASHIER','${fixture.a1}','ACTIVE'),('${pharmacist.user}','${fixture.pa}','PHARMACIST','${fixture.a1}','ACTIVE');
INSERT INTO public.devices(id,pharmacy_id,branch_id,registered_by,device_name,platform,public_key_pem,status) VALUES
('${ownerA.device}','${fixture.pa}','${fixture.a1}','${ownerA.user}','EDGE003_OWNER_A','WEB',$pem$${ownerA.pem}$pem$,'ACTIVE'),
('${ownerB.device}','${fixture.pb}','${fixture.b1}','${ownerB.user}','EDGE003_OWNER_B','WEB',$pem$${ownerB.pem}$pem$,'ACTIVE'),
('${outsider.device}','${fixture.pa}','${fixture.a1}','${ownerA.user}','EDGE003_OUTSIDER','WEB',$pem$${outsider.pem}$pem$,'ACTIVE'),
('${cashier.device}','${fixture.pa}','${fixture.a1}','${ownerA.user}','EDGE003_CASHIER','WEB',$pem$${cashier.pem}$pem$,'ACTIVE'),
('${pharmacist.device}','${fixture.pa}','${fixture.a2}','${ownerA.user}','EDGE003_PHARMACIST','WEB',$pem$${pharmacist.pem}$pem$,'ACTIVE'),
('${inactiveDevice}','${fixture.pa}','${fixture.a1}','${ownerA.user}','EDGE003_INACTIVE','WEB',$pem$${inactivePem}$pem$,'BLOCKED');
INSERT INTO public.products(id,pharmacy_id,name,selling_price) VALUES ('${fixture.productA}','${fixture.pa}','EDGE003-A',100),('${fixture.productB}','${fixture.pb}','EDGE003-B',100);
INSERT INTO public.inventory_batches(id,pharmacy_id,product_id,branch_id,batch_number,quantity,cost_price,selling_price) VALUES ('${fixture.batchA1}','${fixture.pa}','${fixture.productA}','${fixture.a1}','EDGE003-A1',10,1,100),('${fixture.batchA2}','${fixture.pa}','${fixture.productA}','${fixture.a2}','EDGE003-A2',10,1,100),('${fixture.batchB1}','${fixture.pb}','${fixture.productB}','${fixture.b1}','EDGE003-B1',10,1,100);
INSERT INTO public.sales(id,pharmacy_id,branch_id,cashier_id,currency,subtotal,discount,tax,total,payment_method,amount_tendered,change_due,payment_status) VALUES ('${fixture.saleA1}','${fixture.pa}','${fixture.a1}','${ownerA.user}','NGN',100,0,0,100,'CASH',100,0,'SETTLED'),('${fixture.saleA2}','${fixture.pa}','${fixture.a2}','${ownerA.user}','NGN',100,0,0,100,'CASH',100,0,'SETTLED'),('${fixture.saleB1}','${fixture.pb}','${fixture.b1}','${ownerB.user}','NGN',100,0,0,100,'CASH',100,0,'SETTLED'),('${fixture.saleEur}','${fixture.pa}','${fixture.a1}','${ownerA.user}','EUR',100,0,0,100,'CASH',100,0,'SETTLED');
INSERT INTO public.sale_items(id,sale_id,pharmacy_id,product_id,batch_id,quantity,unit_price,discount,tax,total) VALUES ('${fixture.itemA1}','${fixture.saleA1}','${fixture.pa}','${fixture.productA}','${fixture.batchA1}',1,100,0,0,100),('${fixture.itemA2}','${fixture.saleA2}','${fixture.pa}','${fixture.productA}','${fixture.batchA2}',1,100,0,0,100),('${fixture.itemB1}','${fixture.saleB1}','${fixture.pb}','${fixture.productB}','${fixture.batchB1}',1,100,0,0,100),('${fixture.itemEur}','${fixture.saleEur}','${fixture.pa}','${fixture.productA}','${fixture.batchA1}',1,100,0,0,100);
`);
const snapshot = () => JSON.parse(psql(`SELECT json_build_object('returns',(SELECT count(*) FROM public.sale_returns WHERE pharmacy_id IN ('${fixture.pa}','${fixture.pb}')),'ledger',(SELECT count(*) FROM public.stock_ledger WHERE pharmacy_id IN ('${fixture.pa}','${fixture.pb}')),'journal',(SELECT count(*) FROM public.sync_journal WHERE pharmacy_id IN ('${fixture.pa}','${fixture.pb}')),'nonces',(SELECT count(*) FROM public.sync_nonces WHERE pharmacy_id IN ('${fixture.pa}','${fixture.pb}')),'stock',(SELECT sum(quantity) FROM public.inventory_batches WHERE id IN ('${fixture.batchA1}','${fixture.batchA2}','${fixture.batchB1}')));`));
const bodyFor = async ({ signer = ownerA, pharmacy = fixture.pa, branch = fixture.a1, sale = fixture.saleA1, item = fixture.itemA1, device = signer.device, quantity = 1, expected = 100, payment = 'CASH', payload = { reason: 'EDGE003' }, timestamp = Date.now() } = {}) => ({ pharmacy_id: pharmacy, branch_id: branch, device_id: device, client_op_id: id(), nonce: id(), sale_id: sale, contract_version: 2, items: [{ sale_item_id: item, quantity }], expected_refund_amount_minor: expected, original_payment_method: payment, payload, payload_hash: await hash(canonical(payload)), timestamp });
const signatureFor = async (signer, body) => Buffer.from(new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, signer.privateKey, new TextEncoder().encode(['PF-V2', 'POST', '/sync-push-return-v2', body.pharmacy_id, body.device_id, body.client_op_id, body.timestamp, body.nonce, body.payload_hash].join('\n'))))).toString('base64');
const request = async ({ token, signer = ownerA, body, signature, rawBody, omitAuth = false }) => { const headers = { apikey: anon, 'X-Device-Signature': signature || await signatureFor(signer, body), 'Content-Type': 'application/json' }; if (!omitAuth) headers.Authorization = `Bearer ${token}`; const r = await fetch(endpoint, { method: 'POST', headers, body: rawBody ?? JSON.stringify(body) }); const text = await r.text(); let payload = null; try { payload = text ? JSON.parse(text) : null; } catch { /* never emit opaque response text */ } return { http: r.status, code: payload?.error_code ?? payload?.error ?? payload?.operation_status ?? 'UNPARSEABLE_EDGE_RESPONSE', disclosed: /(?:sqlstate|postgres|public\.|constraint|error:|stack|-----begin|eyJ)/i.test(text) }; };
const scenarios = [];
const startAt = Number(process.env.EDGE003_START_AT || '1');
const run = async (idValue, expected, action) => { if (Number(idValue.slice(-2)) < startAt) return; const before = snapshot(); const actual = await action(); const after = snapshot(); const pass = actual.http === expected.http && expected.codes.includes(actual.code) && !actual.disclosed && JSON.stringify(before) === JSON.stringify(after); const report = { id: idValue, expected, actual, before, after, pass }; scenarios.push(report); if (!pass) { console.log(JSON.stringify({ pass: false, scenarios })); throw new Error(`${idValue} acceptance assertions failed.`); } };

await run('EDGE-003-01', { http: 401, codes: ['UNAUTHENTICATED'] }, async () => request({ omitAuth: true, body: await bodyFor(), signature: 'AA==' }));
await run('EDGE-003-02', { http: 401, codes: ['INVALID_JWT', 'UNPARSEABLE_EDGE_RESPONSE'] }, async () => request({ token: 'invalid.local.jwt', body: await bodyFor(), signature: 'AA==' }));
{ const body = await bodyFor(); await run('EDGE-003-03', { http: 401, codes: ['SIGNATURE_INVALID'] }, async () => request({ token: ownerA.token, body, signature: 'AA==' })); }
{ const body = await bodyFor(); const signature = await signatureFor(ownerA, body); body.payload = { reason: 'ALTERED_AFTER_SIGNING' }; await run('EDGE-003-04', { http: 400, codes: ['PAYLOAD_HASH_MISMATCH'] }, async () => request({ token: ownerA.token, body, signature })); }
{ const body = await bodyFor({ timestamp: Date.now() - 600001 }); await run('EDGE-003-05', { http: 401, codes: ['TIMESTAMP_OUT_OF_RANGE'] }, async () => request({ token: ownerA.token, body })); }
await run('EDGE-003-06', { http: 403, codes: ['DEVICE_BRANCH_FORBIDDEN'] }, async () => request({ token: ownerA.token, body: await bodyFor({ device: inactiveDevice }) }));
await run('EDGE-003-07', { http: 403, codes: ['DEVICE_BRANCH_FORBIDDEN'] }, async () => request({ token: ownerB.token, signer: ownerB, body: await bodyFor({ signer: ownerB, device: ownerB.device }) }));
await run('EDGE-003-08', { http: 403, codes: ['REFUND_FORBIDDEN'] }, async () => request({ token: outsider.token, signer: outsider, body: await bodyFor({ signer: outsider }) }));
await run('EDGE-003-09', { http: 403, codes: ['REFUND_FORBIDDEN'] }, async () => request({ token: cashier.token, signer: cashier, body: await bodyFor({ signer: cashier }) }));
await run('EDGE-003-10', { http: 403, codes: ['REFUND_FORBIDDEN'] }, async () => request({ token: ownerA.token, signer: ownerB, body: await bodyFor({ signer: ownerB, pharmacy: fixture.pb, branch: fixture.b1, sale: fixture.saleB1, item: fixture.itemB1 }) }));
await run('EDGE-003-11', { http: 403, codes: ['REFUND_FORBIDDEN'] }, async () => request({ token: pharmacist.token, signer: pharmacist, body: await bodyFor({ signer: pharmacist, branch: fixture.a2, sale: fixture.saleA2, item: fixture.itemA2 }) }));
await run('EDGE-003-12', { http: 400, codes: ['INVALID_REFUND_REQUEST'] }, async () => request({ token: ownerA.token, body: await bodyFor({ quantity: 0 }) }));
await run('EDGE-003-13', { http: 409, codes: ['REFUND_NOT_ALLOWED'] }, async () => request({ token: ownerA.token, body: await bodyFor({ quantity: 2, expected: 200 }) }));
await run('EDGE-003-14', { http: 400, codes: ['INVALID_REFUND_REQUEST'] }, async () => request({ token: ownerA.token, body: await bodyFor({ sale: fixture.saleEur, item: fixture.itemEur }) }));
await run('EDGE-003-15', { http: 400, codes: ['INVALID_JSON'] }, async () => request({ token: ownerA.token, rawBody: '{', body: await bodyFor() }));
console.log(JSON.stringify({ pass: true, scenarios }));
}, async () => {
  const proof = runGuardedEdgeCleanup(psql, cleanupRoots);
  console.log(JSON.stringify({ cleanup: 'EDGE-003', pass: true, proof }));
});
