import { createHash } from 'node:crypto';

let passed = 0;
const assert = (condition, message) => { if (!condition) throw new Error(`FAIL: ${message}`); passed += 1; };
const stable = (value) => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(stable).join(',')}]`
    : `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
const sha = (value) => createHash('sha256').update(stable(value)).digest('hex');

function intakeFingerprint({ branchId, invoiceNumber, items, supplierId }) {
  const normalized = items.map((item) => ({
    batch_number: String(item.batch_number).trim(),
    cost_price: item.cost_price == null ? 0 : Number(item.cost_price),
    expiry_date: String(item.expiry_date).trim(),
    product_id: String(item.product_id).trim().toLowerCase(),
    quantity: Number(item.quantity),
    selling_price: item.selling_price == null ? 0 : Number(item.selling_price),
  })).sort((a, b) => a.product_id.localeCompare(b.product_id) || a.batch_number.localeCompare(b.batch_number) || a.expiry_date.localeCompare(b.expiry_date));
  return sha({ branch_id: branchId.toLowerCase(), invoice_number: String(invoiceNumber ?? '').trim(), items: normalized, supplier_id: supplierId?.toLowerCase() ?? '' });
}

function resolve({ now, subscription, decisions = [], historicalSuspension = false }) {
  if (!subscription?.start || !subscription?.end || subscription.end < subscription.start) return { state: 'UNKNOWN', allowed: false };
  const grace = subscription.end + 7;
  let result = subscription.status === 'ACTIVE' || subscription.status === 'TRIAL'
    ? now < subscription.end ? { state: subscription.status, allowed: true } : now < grace ? { state: 'GRACE', allowed: true } : { state: 'EXPIRED', allowed: false }
    : subscription.status === 'PAST_DUE' && now < grace ? { state: 'GRACE', allowed: true } : { state: 'EXPIRED', allowed: false };
  const effective = decisions.filter((row) => row.at <= now).sort((a, b) => b.at - a.at || b.sequence - a.sequence || b.id.localeCompare(a.id))[0];
  if (effective?.kind === 'SUSPEND' || effective?.kind === 'DENY_MUTATIONS') result = { state: 'SUSPENDED', allowed: false };
  else if (!effective && historicalSuspension) result = { state: 'SUSPENDED', allowed: false };
  return result;
}

const base = { status: 'ACTIVE', start: 1, end: 20 };
for (const scenario of [
  { args: { now: 10, subscription: base }, expected: ['ACTIVE', true] },
  { args: { now: 20, subscription: base }, expected: ['GRACE', true] },
  { args: { now: 27, subscription: base }, expected: ['EXPIRED', false] },
  { args: { now: 10, subscription: null }, expected: ['UNKNOWN', false] },
  { args: { now: 10, subscription: base, historicalSuspension: true }, expected: ['SUSPENDED', false] },
  { args: { now: 10, subscription: base, historicalSuspension: true, decisions: [{ id: 'a', at: 9, sequence: 1, kind: 'REINSTATE' }] }, expected: ['ACTIVE', true] },
  { args: { now: 10, subscription: base, decisions: [{ id: 'a', at: 11, sequence: 9, kind: 'SUSPEND' }] }, expected: ['ACTIVE', true] },
  { args: { now: 10, subscription: base, decisions: [{ id: 'a', at: 9, sequence: 1, kind: 'REINSTATE' }, { id: 'b', at: 9, sequence: 2, kind: 'SUSPEND' }] }, expected: ['SUSPENDED', false] },
]) {
  const read = resolve(scenario.args);
  const guard = resolve(scenario.args).allowed;
  assert(read.state === scenario.expected[0] && read.allowed === scenario.expected[1], `read evaluator resolves ${scenario.expected[0]}`);
  assert(guard === read.allowed, 'mutation guard and public read decision agree');
}

const request = {
  branchId: 'BBBBBBBB-BBBB-4BBB-8BBB-BBBBBBBBBBBB', invoiceNumber: ' INV-1 ', supplierId: null,
  items: [
    { product_id: '22222222-2222-4222-8222-222222222222', batch_number: ' B ', expiry_date: '2027-02-01', quantity: 2 },
    { product_id: '11111111-1111-4111-8111-111111111111', batch_number: ' A ', expiry_date: '2027-01-01', quantity: 1, cost_price: 0, selling_price: 0 },
  ],
};
const reordered = { ...request, branchId: request.branchId.toLowerCase(), invoiceNumber: 'INV-1', items: [...request.items].reverse() };
assert(intakeFingerprint(request) === intakeFingerprint(reordered), 'reordered intake and explicit/default zero prices are an equivalent retry');
assert(intakeFingerprint(request) !== intakeFingerprint({ ...request, items: [{ ...request.items[0], quantity: 3 }, request.items[1]] }), 'material intake quantity change conflicts');
assert(intakeFingerprint(request) !== intakeFingerprint({ ...request, supplierId: '33333333-3333-4333-8333-333333333333' }), 'material optional supplier change conflicts');

const committed = { pharmacy: 'p', branch: 'b', kind: 'INVENTORY_INTAKE', operation: 'o', actor: 'a', device: null, fingerprint: intakeFingerprint(request), outcome: 'COMMITTED' };
const exactReplay = (proof, fingerprint) => proof.outcome === 'COMMITTED' && proof.pharmacy === 'p' && proof.branch === 'b' && proof.kind === 'INVENTORY_INTAKE' && proof.operation === 'o' && proof.actor === 'a' && proof.device === null && proof.fingerprint === fingerprint;
assert(exactReplay(committed, intakeFingerprint(reordered)), 'expired exact committed replay remains authorized');
assert(!exactReplay(committed, intakeFingerprint({ ...request, invoiceNumber: 'INV-2' })), 'changed-payload replay remains unauthorized');

const durable = { purchases: [], evidence: [] };
const transaction = (work) => { const draft = structuredClone(durable); try { work(draft); durable.purchases = draft.purchases; durable.evidence = draft.evidence; } catch { /* rollback */ } };
transaction((draft) => { draft.purchases.push('purchase-1'); throw new Error('evidence conflict'); });
assert(durable.purchases.length === 0 && durable.evidence.length === 0, 'evidence failure atomically rolls back delegated mutation in the injected transaction model');
transaction((draft) => { draft.purchases.push('purchase-1'); draft.evidence.push('proof-1'); });
assert(durable.purchases.length === 1 && durable.evidence.length === 1, 'successful mutation and evidence publish together');

console.log(`Entitlement contract closure injected-model assertions: ${passed} passed`);
