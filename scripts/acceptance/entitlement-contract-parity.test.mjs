import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { inspectSqlSource, normalizedSql, requireOrdered } from './sql-source-structure.mjs';

let passed = 0;
const assert = (condition, message) => { if (!condition) throw new Error(`FAIL: ${message}`); passed += 1; };
const read = (path) => readFileSync(path, 'utf8');
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const candidatePath = 'docs/development/quarantined-proposals/20261029000037_consolidated_entitlement_enforcement_v1.sql';
const candidate = read(candidatePath);
const structureErrors = inspectSqlSource(candidate, candidatePath);
const functionSlice = (name) => {
  const start = candidate.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (start < 0) return '';
  const next = candidate.indexOf('CREATE OR REPLACE FUNCTION public.', start + 40);
  return candidate.slice(start, next < 0 ? candidate.length : next);
};

assert(structureErrors.some((error) => error.includes(':54: DO body is not dollar-quoted')), 'detects the missing quoted DO body');
assert(structureErrors.some((error) => error.includes(':80: malformed dollar delimiter after AS')), 'detects the malformed function dollar delimiter');
assert(hash(candidatePath) === '279376c9a1d94205e62ceba49d349b76c9c69c21f1ec6c2cf1dde5e393de7ce6', 'quarantined proposal retains its verified pre-move bytes');

const canonicalPath = 'supabase/migrations/20261030000038_canonical_entitlement_contract_parity_v1.sql';
const canonical = read(canonicalPath);
assert(inspectSqlSource(canonical, canonicalPath).length === 0, 'canonical additive correction has balanced quoted bodies and delimiters');

const foundation = read('supabase/migrations/20261030000037_entitlement_foundation_acceptance_completion_v1.sql');
assert(inspectSqlSource(foundation, 'foundation 000037').length === 0, 'foundation acceptance proposal has balanced quoted bodies and delimiters');

const sale = read('supabase/migrations/20261012000018_unified_sales_commit.sql');
assert(normalizedSql(sale).includes(normalizedSql('GRANT EXECUTE ON FUNCTION public.rpc_commit_sale_v1(UUID, UUID, UUID, UUID, UUID, UUID, UUID, TEXT, JSONB, JSONB) TO service_role;')), 'sealed M-18 final grant is service_role-only');
for (const fragment of [
  "INSERT INTO public.sync_nonces(nonce, pharmacy_id, device_id, created_at)",
  "ON CONFLICT (nonce) DO NOTHING",
  "INSERT INTO public.sync_journal",
  "ON CONFLICT (pharmacy_id, client_op_id) DO NOTHING",
  "FOR UPDATE",
  "FORBIDDEN_SALE_AUTHORIZATION",
  "DEVICE_BRANCH_FORBIDDEN",
  "SALE_TOTAL_MISMATCH",
  "OFFLINE_CONTROLLED_DEFICIT",
  "status = 'COMMITTED', response_status = 'COMMITTED'",
]) assert(normalizedSql(sale).includes(normalizedSql(fragment)), `sealed M-18 includes ${fragment}`);

const candidateSaleStart = candidate.indexOf('CREATE OR REPLACE FUNCTION public.rpc_commit_sale_v1(');
const candidateSaleEnd = candidate.indexOf('REVOKE ALL ON FUNCTION public.rpc_commit_sale_v1', candidateSaleStart);
const candidateSale = candidate.slice(candidateSaleStart, candidateSaleEnd);
for (const fragment of ['INSERT INTO public.sync_journal', 'FOR UPDATE', 'DEVICE_BRANCH_FORBIDDEN', 'SALE_TOTAL_MISMATCH', "status = 'COMMITTED'"]) {
  assert(normalizedSql(candidateSale).includes(normalizedSql(fragment)), `candidate M-18 retains ${fragment}`);
}
for (const missing of ['INSERT INTO public.sync_nonces', 'FORBIDDEN_SALE_AUTHORIZATION', 'OFFLINE_CONTROLLED_DEFICIT']) {
  assert(!normalizedSql(candidateSale).includes(normalizedSql(missing)), `detects candidate M-18 omission of ${missing}`);
}

const refund = read('supabase/migrations/20261013000020_refund_v2_authoritative_commit.sql');
const refund25 = read('supabase/migrations/20261013000025_refund_v2_gateway_claim_compatibility.sql');
assert(normalizedSql(refund25).includes(normalizedSql('GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) TO service_role;')), 'latest Refund V2 correction preserves service_role-only grant');
requireOrdered(refund, [
  'INSERT INTO public.sync_journal',
  'INSERT INTO public.sync_nonces',
  'FOR UPDATE',
  'reconciliation_status = \'LEGACY_UNVERIFIED\'',
  'sale_return_line_allocations',
  'ORDER BY ib.id FOR UPDATE',
  "contract_version, created_at",
  "status = 'COMMITTED'",
], 'sealed Refund V2');
for (const correction of [21, 22, 23, 24, 25]) {
  const path = `supabase/migrations/202610130000${correction}_` + ({21:'refund_v2_locking_correction.sql',22:'refund_v2_item_lock_correction.sql',23:'refund_v2_replay_ambiguity_correction.sql',24:'refund_v2_device_lookup_grant.sql',25:'refund_v2_gateway_claim_compatibility.sql'}[correction]);
  assert(inspectSqlSource(read(path), path).length === 0, `Refund V2 correction ${correction} is structurally balanced`);
}
const candidateRefundStart = candidate.indexOf('CREATE OR REPLACE FUNCTION public.rpc_process_sale_return_v2(');
const candidateRefundEnd = candidate.indexOf('REVOKE ALL ON FUNCTION public.rpc_process_sale_return_v2', candidateRefundStart);
const candidateRefund = candidate.slice(candidateRefundStart, candidateRefundEnd);
assert(candidateRefund.includes('FOR UPDATE'), 'candidate Refund V2 retains at least one locking path');
for (const missing of ['sale_return_line_allocations', 'contract_version', 'reconciliation_status', 'INSERT INTO public.sync_nonces', 'v_item_ids := ARRAY[]::UUID[]', 'FOR UPDATE OF sj']) {
  assert(!candidateRefund.includes(missing), `detects candidate Refund V2 omission of ${missing}`);
}

const intake = read('supabase/migrations/20261006000013_m13_inventory_receiving.sql');
assert(normalizedSql(intake).includes(normalizedSql('GRANT EXECUTE ON FUNCTION public.rpc_receive_inventory_stock(UUID, UUID, JSONB, UUID, TEXT, TEXT, UUID) TO authenticated;')), 'sealed intake exact signature remains authenticated');
for (const fragment of ["DEFAULT 'COMPLETED'", "status IN ('COMPLETED', 'PENDING', 'CANCELLED')", "status := 'COMPLETED'", 'v_calc_total_cost := v_calc_total_cost + (v_qty * v_cost_price)', 'p.client_op_id = p_client_op_id']) {
  assert(normalizedSql(intake).includes(normalizedSql(fragment)), `sealed intake retains ${fragment}`);
}
const adjustment = read('supabase/migrations/20261007000014_m14_inventory_adjustments.sql');
for (const fragment of ["v_new_stock := v_current_stock + p_quantity", "v_new_stock := v_current_stock - p_quantity", 'a.client_op_id = p_client_op_id', 'FORBIDDEN_PERMISSION']) assert(normalizedSql(adjustment).includes(normalizedSql(fragment)), `sealed adjustment retains ${fragment}`);
const transfers = read('supabase/migrations/20261007000015_m15_stock_transfers.sql');
for (const fragment of ['dispatch_client_op_id = p_client_op_id', 'receive_client_op_id = p_client_op_id', "v_current_status <> 'DISPATCHED'", 'FORBIDDEN_PERMISSION']) assert(normalizedSql(transfers).includes(normalizedSql(fragment)), `sealed transfers retain ${fragment}`);
const staff = read('supabase/migrations/20261011000016_m16_staff_management_rpcs.sql');
for (const fragment of ['rpc_create_staff_invitation', 'rpc_accept_staff_invitation', 'rpc_revoke_staff_invitation', 'rpc_change_member_role', 'rpc_reactivate_pharmacy_member', 'rpc_suspend_pharmacy_member', "status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')", "SET status = 'REVOKED'", "SET status = 'ACCEPTED'"]) assert(normalizedSql(staff).includes(normalizedSql(fragment)), `sealed staff lifecycle retains ${fragment}`);
for (const signature of [
  'rpc_create_staff_invitation(UUID, UUID, TEXT, VARCHAR)', 'rpc_accept_staff_invitation(UUID, TEXT)',
  'rpc_revoke_staff_invitation(UUID)', 'rpc_change_member_role(UUID, UUID, VARCHAR)',
  'rpc_reactivate_pharmacy_member(UUID, UUID)', 'rpc_suspend_pharmacy_member(UUID, UUID)',
]) assert(normalizedSql(staff).includes(normalizedSql(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`)), `sealed staff exact grant retained for ${signature}`);

const candidateIntake = functionSlice('rpc_receive_inventory_stock');
assert(candidateIntake.includes("v_calc_total_cost := v_calc_total_cost + (v_qty::BIGINT * v_cost_price)"), 'candidate intake retains authoritative cost arithmetic');
assert(candidateIntake.includes("v_calc_total_cost, 'RECEIVED'"), 'detects candidate intake writing REJECTED-by-schema purchase status RECEIVED');
assert(!candidateIntake.includes("status := 'COMPLETED'"), 'detects candidate intake response drift from accepted COMPLETED contract');
const candidateAdjustment = functionSlice('rpc_adjust_inventory_stock');
assert(candidateAdjustment.includes('a.client_op_id = p_client_op_id') && candidateAdjustment.includes('FORBIDDEN_PERMISSION'), 'candidate adjustment retains idempotency and permission checks');
const candidateDispatch = functionSlice('rpc_dispatch_stock_transfer');
const candidateReceive = functionSlice('rpc_receive_stock_transfer');
assert(!candidateDispatch.includes('FORBIDDEN_PERMISSION') && !candidateReceive.includes('FORBIDDEN_PERMISSION'), 'detects transfer permission-path loss in candidate replacements');
for (const staffFunction of ['rpc_create_staff_invitation','rpc_accept_staff_invitation','rpc_revoke_staff_invitation']) {
  assert(functionSlice(staffFunction).length > 0, `candidate contains staff replacement ${staffFunction}`);
}
assert(candidate.includes('REVOKE ALL ON FUNCTION public.rpc_adjust_inventory_stock FROM public, anon;'), 'detects non-exact adjustment grant signature');
assert(candidate.includes('REVOKE ALL ON FUNCTION public.rpc_dispatch_stock_transfer FROM public, anon;'), 'detects non-exact dispatch grant signature');
assert(candidate.includes('REVOKE ALL ON FUNCTION public.rpc_accept_staff_invitation FROM public, anon;'), 'detects non-exact staff grant signature');

assert(!candidate.includes('CREATE OR REPLACE FUNCTION public.record_committed_entitlement_operation_v2'), 'candidate does not wire the trusted committed-evidence producer');
assert(candidate.includes("current_setting('request.jwt.claim.role', true) = 'service_role'"), 'candidate contains role-string gateway trust requiring provenance correction');
assert(!candidate.includes("rpc_get_effective_entitlement_v2(p_pharmacy_id UUID)"), 'candidate bypasses the corrected v2 administrative evaluator');

for (const [publicName, baseName, ordered] of [
  ['rpc_commit_sale_v1', 'rpc_commit_sale_v1_entitlement_base', ['assert_entitlement_operation_v5', 'rpc_commit_sale_v1_entitlement_base', 'record_committed_entitlement_operation_v4']],
  ['rpc_process_sale_return_v2', 'rpc_process_sale_return_v2_entitlement_base', ['assert_entitlement_operation_v5', 'rpc_process_sale_return_v2_entitlement_base', 'record_committed_entitlement_operation_v4']],
  ['rpc_receive_inventory_stock', 'rpc_receive_inventory_stock_entitlement_base', ['assert_entitlement_operation_v5', 'rpc_receive_inventory_stock_entitlement_base', 'record_committed_entitlement_operation_v4']],
  ['rpc_adjust_inventory_stock', 'rpc_adjust_inventory_stock_entitlement_base', ['assert_entitlement_operation_v5', 'rpc_adjust_inventory_stock_entitlement_base', 'record_committed_entitlement_operation_v4']],
  ['rpc_dispatch_stock_transfer', 'rpc_dispatch_stock_transfer_entitlement_base', ['assert_entitlement_operation_v5', 'rpc_dispatch_stock_transfer_entitlement_base', 'record_committed_entitlement_operation_v4']],
  ['rpc_receive_stock_transfer', 'rpc_receive_stock_transfer_entitlement_base', ['assert_entitlement_operation_v5', 'rpc_receive_stock_transfer_entitlement_base', 'record_committed_entitlement_operation_v4']],
]) {
  assert(canonical.includes(`RENAME TO ${baseName}`), `${publicName} preserves the latest sealed body by rename`);
  const start = canonical.indexOf(`CREATE OR REPLACE FUNCTION public.${publicName}(`);
  const next = canonical.indexOf('CREATE OR REPLACE FUNCTION public.', start + 40);
  requireOrdered(canonical.slice(start, next < 0 ? canonical.length : next), ordered, `canonical ${publicName}`);
}
for (const staffName of ['rpc_create_staff_invitation','rpc_accept_staff_invitation','rpc_revoke_staff_invitation','rpc_change_member_role','rpc_reactivate_pharmacy_member','rpc_suspend_pharmacy_member']) {
  assert(canonical.includes(`RENAME TO ${staffName}_entitlement_base`), `${staffName} preserves sealed invitation/member lifecycle`);
  assert(canonical.includes(`public.${staffName}_entitlement_base(`), `${staffName} wrapper delegates to its preserved base`);
}
for (const fragment of [
  'branch_id IS NOT DISTINCT FROM p_branch_id',
  'e.operation_kind=p_operation_kind',
  'e.client_operation_id=p_client_operation_id',
  'e.actor_id=p_actor_id',
  'e.device_id IS NOT DISTINCT FROM p_device_id',
  'e.payload_fingerprint=lower(p_payload_fingerprint)',
  "e.outcome='COMMITTED'",
  'assert_entitlement_gateway_provenance_v1',
]) assert(normalizedSql(canonical).includes(normalizedSql(fragment)), `canonical replay/gateway scope retains ${fragment}`);
assert(!canonical.includes('current_user =') && !canonical.includes('session_user ='), 'canonical caller trust never relies on definer ownership');
assert(normalizedSql(canonical).includes(normalizedSql("RETURN QUERY SELECT r.purchase_id::UUID,r.status::VARCHAR(16),r.total_items::INT,r.total_cost::BIGINT,r.processed_at::TIMESTAMPTZ")), 'intake wrapper preserves the sealed COMPLETED response field contract');
for (const exactGrant of [
  'rpc_commit_sale_v1(UUID,UUID,UUID,UUID,UUID,UUID,UUID,TEXT,JSONB,JSONB) TO service_role',
  'rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT) TO service_role',
  'rpc_receive_inventory_stock(UUID,UUID,JSONB,UUID,TEXT,TEXT,UUID) TO authenticated',
  'rpc_adjust_inventory_stock(UUID,UUID,UUID,UUID,VARCHAR,INT,VARCHAR,UUID,TEXT) TO authenticated',
  'rpc_dispatch_stock_transfer(UUID,UUID,UUID,JSONB,UUID,TEXT) TO authenticated',
  'rpc_receive_stock_transfer(UUID,UUID,UUID,TEXT) TO authenticated',
]) assert(normalizedSql(canonical).includes(normalizedSql(`GRANT EXECUTE ON FUNCTION public.${exactGrant};`)), `canonical exact grant: ${exactGrant}`);

console.log(`Entitlement contract-parity/readiness assertions: ${passed} passed; quarantined structure errors: ${structureErrors.length}`);
