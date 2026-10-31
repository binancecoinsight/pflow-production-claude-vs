import { existsSync, readFileSync } from 'node:fs';
import { inspectSqlSource, normalizedSql, requireOrdered } from './sql-source-structure.mjs';

const read = (path) => readFileSync(path, 'utf8');
const m9 = read('supabase/migrations/20261005000009_m9_returns_refunds.sql');
const m13 = read('supabase/migrations/20261006000013_m13_inventory_receiving.sql');
const m14 = read('supabase/migrations/20261007000014_m14_inventory_adjustments.sql');
const m15 = read('supabase/migrations/20261007000015_m15_stock_transfers.sql');
const m38 = read('supabase/migrations/20261030000038_canonical_entitlement_contract_parity_v1.sql');
const m39Path = 'supabase/migrations/20261030000039_entitlement_contract_closure_v1.sql';
const m39 = existsSync(m39Path) ? read(m39Path) : '';
const composed = `${m38}\n${m39}`;
const norm = normalizedSql(composed);
const compact = (value) => normalizedSql(value).replace(/\s*([(),])\s*/g, '$1');
const failures = [];
let passed = 0;
const check = (condition, message) => { if (condition) passed += 1; else failures.push(message); };

check(normalizedSql(m9).includes(normalizedSql('rpc_process_sale_return(UUID, UUID, UUID, JSONB, NUMERIC, VARCHAR, TEXT, UUID) TO authenticated')), 'baseline M-9 eight-argument overload exists and must remain available behind a guard');
check(m39.length > 0 && inspectSqlSource(m39, m39Path).length === 0, 'forward-only correction 000039 exists and is lexically balanced');
check(norm.includes(normalizedSql('ALTER FUNCTION public.rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID) RENAME TO rpc_process_sale_return_m9_entitlement_base')), 'M-9 eight-argument overload is renamed to a private preserved base');
check(norm.includes(normalizedSql('REVOKE ALL ON FUNCTION public.rpc_process_sale_return_m9_entitlement_base(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID) FROM PUBLIC,anon,authenticated,service_role')), 'M-9 preserved base is not directly executable');
check(norm.includes(normalizedSql('GRANT EXECUTE ON FUNCTION public.rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID) TO authenticated')), 'guarded M-9 overload retains authenticated availability and exact signature');
for (const [signature, role, base] of [
  ['rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID)', 'authenticated', 'rpc_process_sale_return_m9_entitlement_base'],
  ['rpc_process_sale_return(UUID,UUID,UUID,JSONB,NUMERIC,VARCHAR,TEXT,UUID,TEXT)', 'authenticated', 'rpc_process_sale_return_entitlement_base'],
  ['rpc_process_sale_return_v2(UUID,UUID,UUID,UUID,UUID,UUID,TEXT,UUID,JSONB,BIGINT,VARCHAR,TEXT)', 'service_role', 'rpc_process_sale_return_v2_entitlement_base'],
]) {
  check(norm.includes(normalizedSql(`GRANT EXECUTE ON FUNCTION public.${signature} TO ${role}`)), `${signature} has the composed final ${role} grant`);
  check(norm.includes(base), `${signature} delegates to its preserved sealed base`);
}

check(norm.includes('resolve_effective_entitlement_v3'), 'one canonical effective-entitlement resolver is authored');
check(norm.includes(normalizedSql('v_effective:=public.resolve_effective_entitlement_v3(p_pharmacy_id)')), 'public evaluator delegates to the canonical resolver');
check(norm.includes(normalizedSql("RETURN COALESCE((public.resolve_effective_entitlement_v3(p_pharmacy_id)->>'mutations_allowed')::BOOLEAN,FALSE)")), 'mutation helper delegates to the same canonical resolver');
check(compact(composed).includes(compact("IF v_decision.decision_kind IN ('SUSPEND','DENY_MUTATIONS')")) && compact(composed).includes(compact("ELSIF v_decision.decision_kind IN ('REINSTATE','ALLOW_MUTATIONS')")), 'ordered negative and positive administrative decisions are explicit');
check(norm.includes(normalizedSql("EXISTS (SELECT 1 FROM public.pharmacy_entitlement_anchors a WHERE a.pharmacy_id=p_pharmacy_id AND a.status='SUSPENDED')")), 'historical suspension anchors fail closed when no effective administrative decision supersedes them');

for (const [name, sealed] of [
  ['entitlement_intake_fingerprint_v2', m13],
  ['entitlement_adjustment_fingerprint_v2', m14],
  ['entitlement_dispatch_fingerprint_v2', m15],
  ['entitlement_receive_fingerprint_v2', m15],
]) check(norm.includes(name), `${name} centralizes wrapper/base idempotency equivalence after sealed-source inspection`);
for (const fragment of [
  "ORDER BY lower(trim(elem->>'product_id')), trim(elem->>'batch_number'), trim(elem->>'expiry_date')",
  "'cost_price', COALESCE((elem->>'cost_price')::BIGINT, 0)",
  "'selling_price', COALESCE((elem->>'selling_price')::BIGINT, 0)",
  "'supplier_id', COALESCE(lower(p_supplier_id::TEXT), '')",
]) check(compact(composed).includes(compact(fragment)) && compact(m13).includes(compact(fragment)), `intake fingerprint retains sealed M-13 fragment: ${fragment}`);
for (const [sealed, fragment, label] of [
  [m14, "'direction', v_clean_direction, 'notes', v_clean_notes, 'pharmacy_id', lower(p_pharmacy_id::TEXT)", 'adjustment normalized direction/notes/tenant'],
  [m15, "'client_op_id', lower(p_client_op_id::TEXT), 'destination_branch_id', lower(p_destination_branch_id::TEXT), 'items', p_items", 'dispatch operation/destination/items'],
  [m15, "'source_branch_id', lower(p_source_branch_id::TEXT)", 'dispatch source branch'],
  [m15, "'client_op_id', lower(p_client_op_id::TEXT), 'notes', v_clean_notes, 'pharmacy_id', lower(p_pharmacy_id::TEXT), 'transfer_id', lower(p_transfer_id::TEXT)", 'receive operation/notes/tenant/transfer'],
]) check(compact(sealed).includes(compact(fragment)) && compact(composed).includes(compact(fragment.replaceAll('v_clean_direction', 'upper(trim(p_direction))').replaceAll('v_clean_notes', "COALESCE(trim(p_notes),'')"))), `${label} fingerprint matches sealed canonical fields`);

check(norm.includes(normalizedSql('assert_entitlement_operation_v5')) && norm.includes(normalizedSql('rpc_receive_inventory_stock_entitlement_base')) && norm.includes(normalizedSql('record_committed_entitlement_operation_v4')), 'intake wrapper retains guard -> sealed base -> evidence sequence');
try {
  requireOrdered(composed, ['assert_entitlement_operation_v5', 'rpc_receive_inventory_stock_entitlement_base', 'record_committed_entitlement_operation_v4'], 'intake atomic evidence order');
  passed += 1;
} catch (error) { failures.push(error.message); }

if (failures.length) {
  console.error(`Entitlement contract closure baseline: ${passed} passed, ${failures.length} findings`);
  failures.forEach((failure, index) => console.error(`${index + 1}. ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Entitlement contract closure assertions: ${passed} passed`);
}
