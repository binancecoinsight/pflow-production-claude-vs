import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let passed = 0;
const assert = (condition, message) => { if (!condition) throw new Error(`FAIL: ${message}`); passed += 1; };
const read = (path) => readFileSync(path, 'utf8');
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const sql = read('supabase/migrations/20261030000037_entitlement_foundation_acceptance_completion_v1.sql');
const lifecycle = read('src/lib/subscription/lifecycle.ts');
const security = read('src/lib/subscription/foundationSecurity.ts');
const enforcement = read('src/lib/subscription/entitlementEnforcement.ts');
const adapter = read('src/lib/subscription/entitlementAdapter.ts');

const exactRevokes = [
  'public.rpc_record_entitlement_anchor_v1(UUID,VARCHAR,TEXT,BOOLEAN)',
  'public.rpc_get_effective_entitlement_v1(UUID)',
  'public.assert_pharmacy_mutation_entitled_v1(UUID,TEXT,UUID)',
  'public.is_subscription_active(UUID)',
  'public.authorize_exact_entitlement_replay_v2(UUID,TEXT,UUID,UUID,UUID,TEXT)',
  'public.latest_entitlement_decision_v1(UUID,TIMESTAMPTZ)',
];
for (const signature of exactRevokes) {
  assert(sql.includes(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role;`), `closes superseded signature ${signature}`);
}
assert(sql.includes("to_regprocedure('public.assert_pharmacy_mutation_entitled_v1(uuid,text,uuid,text)')") &&
  sql.includes("EXECUTE 'REVOKE ALL ON FUNCTION public.assert_pharmacy_mutation_entitled_v1(UUID,TEXT,UUID,TEXT) FROM PUBLIC, anon, authenticated, service_role'"),
  'conditionally closes the observed but non-baseline four-argument helper without assuming it exists');

assert(sql.includes('CREATE OR REPLACE FUNCTION public.rpc_get_effective_entitlement_v2(p_pharmacy_id UUID)'), 'defines the exact v2 effective-entitlement signature');
assert(sql.includes('ORDER BY d.effective_at DESC, d.decision_sequence DESC, d.id DESC LIMIT 1;'), 'uses PostgreSQL deterministic effective-time/sequence/UUID ordering');
assert(sql.includes("v_decision.decision_kind IN ('SUSPEND','DENY_MUTATIONS')"), 'negative administrative decisions override commercial renewal state');
assert(sql.includes("auth.uid() IS NULL OR NOT (public.is_pharmacy_member(p_pharmacy_id) OR public.is_platform_admin('ADMIN'))"), 'v2 evaluator preserves request-bound membership or platform-admin checks');
assert(sql.includes("COALESCE(auth.jwt()->>'role','') <> 'service_role'"), 'committed-evidence producer uses caller JWT role rather than definer owner');
assert(!sql.includes("session_user = 'postgres'") && !sql.includes("current_user = 'postgres'"), 'proposal contains no definer-owner caller-trust bypass');
assert(sql.includes('auth.uid() <> p_actor_id'), 'replay proof requires the current actor');
assert(sql.includes('e.pharmacy_id = p_pharmacy_id AND e.operation_kind = p_operation_kind') &&
  sql.includes('e.client_operation_id = p_client_operation_id AND e.actor_id = p_actor_id') &&
  sql.includes('e.device_id IS NOT DISTINCT FROM p_device_id') &&
  sql.includes('e.payload_fingerprint = p_payload_fingerprint'), 'SQL replay proof binds the complete operation scope');
assert(sql.includes('REVOKE ALL ON FUNCTION public.authorize_exact_entitlement_replay_v3') && !sql.includes('GRANT EXECUTE ON FUNCTION public.authorize_exact_entitlement_replay_v3'), 'v3 replay helper remains private until route wiring is authorized');
assert(!sql.includes('CREATE OR REPLACE FUNCTION public.rpc_commit_sale_v1') && !sql.includes('CREATE OR REPLACE FUNCTION public.rpc_process_sale_return_v2'), 'proposal does not wire or replace business routes');

assert(lifecycle.includes('parseStrictTimestampMicros') && lifecycle.includes("BigInt((fraction + '000000').slice(0, 6))"), 'client ordering preserves six fractional timestamp digits');
assert(security.includes('consumeReplayAuthorization') && security.includes('scope.clientOperationId === current.clientOperationId') && security.includes('scope.actorId === current.actorId') && security.includes('scope.deviceId === current.deviceId'), 'authorization consumption rechecks full current scope');
assert(enforcement.includes('consumeReplayAuthorization(replay.currentRequest, replay.authorization)') && !enforcement.includes("'operationKind' in replay"), 'final decision consumes only the evidence-bearing proof contract');
assert(adapter.includes("rpc_get_effective_entitlement_v2"), 'production adapter consumes the corrected evaluator');

assert(hash('supabase/migrations/20261029000035_server_authoritative_entitlement_v1.sql') === '46a285069ea3a29b4e8c73ea3e8148f890b6e692df7581ce9c8ac8ebb5d8fb64', 'current 000035 bytes match the PF-SUP-03 recorded baseline');
assert(hash('docs/development/MVP02_CLOSE_CORRECTION_PF-SUP-2026-10-29-02.sha256') === 'be600c1f53aa4ca508b0162694af278f2b8f5568ef9ddf121cf6eb789cefef1f', 'accepted inventory correction manifest is preserved');
assert(hash('src/lib/inventory/service.ts') === '3bb0bc0fd47007a12553ad75767fab821bb0dc9acfb6ee20776e0c5151b40137', 'accepted inventory service is preserved');
assert(hash('src/lib/pos/orchestrator.ts') === 'c11edc1c7bbbf91b9326530441af63cdf7f06625d8a0d11cc4ffb45181dd5a6c', 'accepted POS orchestrator is preserved');

console.log(`Entitlement foundation acceptance static assertions: ${passed} passed`);
