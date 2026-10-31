import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { inspectSqlSource, normalizedSql, requireOrdered } from './sql-source-structure.mjs';

let passed = 0;
const assert = (condition, message) => { if (!condition) throw new Error(`FAIL: ${message}`); passed += 1; };
const read = (path) => readFileSync(path, 'utf8');
const canonicalPath = 'supabase/migrations/20261030000038_canonical_entitlement_contract_parity_v1.sql';
const quarantinePath = 'docs/development/quarantined-proposals/20261029000037_consolidated_entitlement_enforcement_v1.sql';
const sql = read(canonicalPath);
const norm = normalizedSql(sql);

const versions = readdirSync('supabase/migrations').filter((name) => name.endsWith('.sql')).map((name) => name.split('_')[0]);
assert(new Set(versions).size === versions.length, 'active migration versions are unique');
assert(!existsSync('supabase/migrations/20261029000037_consolidated_entitlement_enforcement_v1.sql'), 'malformed proposal is absent from active migration chain');
assert(existsSync(quarantinePath), 'malformed proposal remains available in provenance quarantine');
assert(inspectSqlSource(sql, canonicalPath).length === 0, 'canonical source passes lexical SQL structure inspection');
assert(norm.includes(normalizedSql("CHECK (operation_kind IN ( 'SALE_COMMIT','SALE_CREATE','SALE_REFUND'")) &&
  norm.includes(normalizedSql("'TRANSFER_DISPATCH','TRANSFER_RECEIVE'")), 'evidence-table operation constraint admits every distinguished canonical replay kind');

requireOrdered(sql, [
  'ALTER TABLE public.entitlement_committed_operations_v1',
  'assert_entitlement_gateway_provenance_v1',
  'record_committed_entitlement_operation_v4',
  'entitlement_mutations_allowed_for_operator_v1',
  'assert_entitlement_operation_v5',
  'RENAME TO rpc_commit_sale_v1_entitlement_base',
  'CREATE OR REPLACE FUNCTION public.rpc_commit_sale_v1',
], 'canonical lineage and wiring order');
passed += 1;

for (const fragment of [
  "COALESCE(auth.jwt()->>'role','') <> 'service_role'",
  "entitlement_header_uuid_v1(v_headers,'x-pharmacyflow-actor-id')",
  "v_headers->>'x-pharmacyflow-operation-kind'",
  "v_headers->>'x-pharmacyflow-payload-fingerprint'",
  'branch_id IS NOT DISTINCT FROM p_branch_id',
  'operation_kind=p_operation_kind',
  'client_operation_id=p_client_operation_id',
  'actor_id=p_actor_id',
  'device_id IS NOT DISTINCT FROM p_device_id',
  "outcome='COMMITTED'",
]) assert(norm.includes(normalizedSql(fragment)), `trusted gateway/replay binding includes ${fragment}`);
assert(norm.includes(normalizedSql("v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN NULL")), 'malformed gateway UUID evidence fails closed before casting');
assert(norm.includes(normalizedSql("p_operation_kind NOT IN ('SALE_COMMIT','SALE_CREATE','SALE_REFUND'")), 'unknown operation kinds are rejected by canonical guard/evidence producer');

assert(!sql.includes('current_user =') && !sql.includes('session_user ='), 'definer/session ownership is not gateway authority');
assert(norm.includes(normalizedSql('ORDER BY d.effective_at DESC, d.decision_sequence DESC, d.id DESC')), 'administrative ordering retains timestamp precision and deterministic ties');
assert(norm.includes(normalizedSql("v_decision_kind IN ('SUSPEND', 'DENY_MUTATIONS')")), 'negative decisions block mutations');
assert(norm.includes(normalizedSql("v_sub.status IN ('TRIAL', 'ACTIVE')")), 'commercial lifecycle remains authoritative');

for (const [name, base] of [
  ['rpc_ingest_sale_stock_movement','rpc_ingest_sale_stock_movement_entitlement_base'],
  ['rpc_commit_sale_v1','rpc_commit_sale_v1_entitlement_base'],
  ['rpc_process_sale_return_v2','rpc_process_sale_return_v2_entitlement_base'],
  ['rpc_process_sale_return','rpc_process_sale_return_entitlement_base'],
  ['rpc_receive_inventory_stock','rpc_receive_inventory_stock_entitlement_base'],
  ['rpc_adjust_inventory_stock','rpc_adjust_inventory_stock_entitlement_base'],
  ['rpc_dispatch_stock_transfer','rpc_dispatch_stock_transfer_entitlement_base'],
  ['rpc_receive_stock_transfer','rpc_receive_stock_transfer_entitlement_base'],
  ['rpc_create_staff_invitation','rpc_create_staff_invitation_entitlement_base'],
  ['rpc_accept_staff_invitation','rpc_accept_staff_invitation_entitlement_base'],
  ['rpc_revoke_staff_invitation','rpc_revoke_staff_invitation_entitlement_base'],
  ['rpc_change_member_role','rpc_change_member_role_entitlement_base'],
  ['rpc_reactivate_pharmacy_member','rpc_reactivate_pharmacy_member_entitlement_base'],
  ['rpc_suspend_pharmacy_member','rpc_suspend_pharmacy_member_entitlement_base'],
]) {
  assert(sql.includes(`RENAME TO ${base}`), `${name} retains latest sealed implementation as private base`);
  assert(sql.includes(`public.${base}(`), `${name} wrapper delegates to private base`);
  const publicStart = sql.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  const publicEnd = sql.indexOf('CREATE OR REPLACE FUNCTION public.', publicStart + 40);
  const wrapper = sql.slice(publicStart, publicEnd < 0 ? sql.length : publicEnd);
  assert(wrapper.includes('assert_entitlement_'), `${name} performs entitlement check`);
  assert(wrapper.indexOf('assert_entitlement_') < wrapper.indexOf(base), `${name} guard precedes preserved mutation body`);
}

const saleEdge = read('supabase/functions/sync-push-sale/index.ts');
const refundEdge = read('supabase/functions/sync-push-return-v2/index.ts');
for (const source of [saleEdge, refundEdge]) {
  for (const header of ['X-PharmacyFlow-Actor-Id','X-PharmacyFlow-Pharmacy-Id','X-PharmacyFlow-Branch-Id','X-PharmacyFlow-Device-Id','X-PharmacyFlow-Operation-Kind','X-PharmacyFlow-Client-Operation-Id','X-PharmacyFlow-Payload-Fingerprint']) {
    assert(source.includes(header), `production gateway supplies ${header}`);
  }
}

console.log(`Canonical entitlement wiring assertions: ${passed} passed`);
