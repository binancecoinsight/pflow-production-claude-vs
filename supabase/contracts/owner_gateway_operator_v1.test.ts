import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let passed = 0;
const assert = (condition: unknown, message: string): void => { if (!condition) throw new Error(`FAIL: ${message}`); passed += 1; };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const hash = (path: string): string => createHash('sha256').update(read(path)).digest('hex');
const sql = read('supabase/migrations/20261026000030_owner_gateway_operator_contract_v1.sql');
const correction = read('supabase/migrations/20261026000031_owner_gateway_operator_correction_v1.sql');
const parity = read('supabase/migrations/20261026000032_owner_gateway_boundary_parity_v1.sql');
const linearization = read('supabase/migrations/20261026000033_owner_identity_recovery_linearization_v1.sql');
const principalBinding = read('supabase/migrations/20261026000034_owner_identity_issue_principal_binding_v1.sql');
const gateway = read('supabase/functions/owner-eligibility-gateway/index.ts');
const gatewayTest = read('supabase/functions/owner-eligibility-gateway/index.test.ts');
const operator = read('supabase/functions/platform-admission-operator/index.ts');
const shared = read('supabase/functions/_shared/owner-security-i3.ts');

// Sealed migration dependencies are byte-identical to the I3 entry baseline.
assert(hash('supabase/migrations/20261025000027_owner_onboarding_v1.sql') === 'd2e66b3560cda174e062b8f8b8810c57429c3b4680b59b2a6a8e20aea965da6c', 'migration 000027 remains unchanged');
assert(hash('supabase/migrations/20261025000028_owner_eligibility_issuer_v1.sql') === 'cb9e0ceb134d430e2d7fb8ac3812d3f243eb2660e3e655a3a8608c50a54c4445', 'migration 000028 remains unchanged');
assert(hash('supabase/migrations/20261025000029_owner_eligibility_recovery_v1.sql') === '3973ba51139a4ccfef03aca80e9231b0465738937de0af97f60bd2e425bcfb9e', 'migration 000029 remains unchanged');
assert(hash('supabase/migrations/20261026000030_owner_gateway_operator_contract_v1.sql') === 'e6b5ee258573eab85e8913601fd64eeff97c3a1f59d497369cdc847cab8cae54', 'migration 000030 remains unchanged');
assert(hash('supabase/migrations/20261026000031_owner_gateway_operator_correction_v1.sql') === '9e2a85990b85ec73746f3114d3b798a61135b42072c22558a4fa51c9ce4cba6e', 'migration 000031 remains unchanged');
assert(hash('supabase/migrations/20261026000032_owner_gateway_boundary_parity_v1.sql') === '448384e6981c66ac0090716eb1322e45f90a2464440cbe7170380c91cdbb66da', 'migration 000032 remains unchanged');
assert(hash('supabase/migrations/20261026000033_owner_identity_recovery_linearization_v1.sql') === '1065386b66fcc3b03b4a9e3026869b6aee4ebeeea6c572ead9d7e3ac0ec8477f', 'migration 000033 remains unchanged');

for (const role of ['pharmacyflow_owner_gateway_executor', 'pharmacyflow_platform_admission_operator']) {
  assert(sql.includes(`CREATE ROLE ${role} NOLOGIN NOINHERIT NOBYPASSRLS`), `${role} is a non-login, non-inheriting, non-bypass executor`);
  assert(!new RegExp(`GRANT\\s+${role}\\s+TO`, 'i').test(sql), `${role} receives no identity membership mapping`);
}
assert(sql.indexOf('I3 compatibility precondition failed') < sql.indexOf('ADD COLUMN pharmacy_context_id'), 'legacy-row compatibility abort precedes context schema changes');
assert(sql.includes('CREATE TABLE public.owner_security_operations'), 'atomic operation/audit ledger is additive');
assert(sql.includes('CREATE TABLE public.owner_admission_decisions'), 'append-only admission decisions are additive');
assert(sql.includes('CREATE TABLE public.owner_eligibility_revocation_decisions'), 'append-only eligibility revocations are additive');
assert((sql.match(/FORCE ROW LEVEL SECURITY/g) || []).length === 3, 'all three I3 evidence tables force RLS');
assert(sql.includes('I3 security decision/audit evidence is append-only'), 'audit and decision histories reject update/delete');
assert(sql.includes('NEW.pharmacy_context_id IS DISTINCT FROM OLD.pharmacy_context_id') && sql.includes('NEW.admission_decision_id IS DISTINCT FROM OLD.admission_decision_id'), 'I1 monotonic trigger is extended for immutable I3 bindings');

assert(sql.includes("v_claims->>'role' IS DISTINCT FROM 'pharmacyflow_owner_gateway_executor'"), 'gateway role is derived from trusted JWT claims');
assert(sql.includes("v_claims->>'role' IS DISTINCT FROM 'pharmacyflow_platform_admission_operator'"), 'operator role is derived from trusted JWT claims');
assert(sql.includes("v_claims->>'aud' IS DISTINCT FROM 'pharmacyflow-owner-i3'"), 'both authorities require the I3 audience');
assert(sql.includes("v_claims->>'pharmacyflow_principal_class' IS DISTINCT FROM 'GATEWAY'"), 'gateway principal class is explicit');
assert(sql.includes("v_claims->>'pharmacyflow_principal_class' IS DISTINCT FROM 'PLATFORM_OPERATOR'"), 'operator principal class is explicit');
assert(sql.includes("v_claims->'pharmacyflow_capabilities'"), 'gateway capability is checked per action');
assert(sql.includes("v_claims->'pharmacyflow_permissions'"), 'operator permission is checked per action');

const gatewayGrants = sql.match(/GRANT EXECUTE ON FUNCTION public\.rpc_gateway_[\s\S]*?TO pharmacyflow_owner_gateway_executor;/g) || [];
const operatorGrants = sql.match(/GRANT EXECUTE ON FUNCTION public\.rpc_platform_[\s\S]*?TO pharmacyflow_platform_admission_operator;/g) || [];
assert(gatewayGrants.length === 3, 'gateway executor receives exactly three façade function grants');
assert(operatorGrants.length === 2, 'operator executor receives exactly two façade function grants');
assert(!/GRANT EXECUTE[\s\S]*?TO service_role;/i.test(sql), 'service_role receives no I3 execute grant');
assert(!/GRANT (SELECT|INSERT|UPDATE|DELETE|ALL).*TO pharmacyflow_owner_gateway_executor/i.test(sql), 'gateway executor receives no direct table grant');
assert(!/GRANT (SELECT|INSERT|UPDATE|DELETE|ALL).*TO pharmacyflow_platform_admission_operator/i.test(sql), 'operator executor receives no direct table grant');
assert(sql.includes('FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator'), 'gateway functions explicitly exclude ordinary and operator roles');
assert(sql.includes('FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor'), 'operator functions explicitly exclude ordinary and gateway roles');

const operationLock = sql.indexOf("pg_advisory_xact_lock(hashtextextended(p_operation_id::TEXT, 2))", sql.indexOf('rpc_gateway_reserve_owner_eligibility_v1'));
const requestLock = sql.indexOf("pg_advisory_xact_lock(hashtextextended(p_request_id::TEXT, 0))", operationLock);
const emailLock = sql.indexOf("pg_advisory_xact_lock(hashtextextended(v_email_digest, 1))", requestLock);
const admissionLock = sql.indexOf('WHERE normalized_email_digest = v_email_digest FOR SHARE', emailLock);
const eligibilityLock = sql.indexOf('ORDER BY request_id LIMIT 1 FOR UPDATE', admissionLock);
assert(operationLock < requestLock && requestLock < emailLock && emailLock < admissionLock && admissionLock < eligibilityLock, 'gateway reservation follows operation-request-email-admission-eligibility lock order');
assert(sql.includes('Same target-row lock used by 000028 consumption/revocation'), 'eligibility revocation documents compatibility with consumption target lock');
assert(sql.indexOf("private_i3_require_gateway_v1('IDENTITY_ISSUE')") < sql.indexOf("WHERE operation_id = p_operation_id FOR UPDATE", sql.indexOf('rpc_gateway_correlate_owner_identity_v1')), 'current gateway authorization precedes operation replay lookup');
assert(sql.indexOf("private_i3_require_operator_v1('ELIGIBILITY_REVOKE')") < sql.lastIndexOf('WHERE operation_id = p_operation_id FOR UPDATE'), 'current operator authorization precedes revocation replay lookup');
assert(sql.includes("WHEN 'IDENTITY_ISSUE' THEN 'IDENTITY_RECOVER'"), 'identity recovery requires its distinct gateway capability');
assert(sql.includes("v_eligibility.state = 'CONSUMED'") && sql.includes('CONSUMED_IMMUTABLE'), 'consumed eligibility cannot be revoked');

for (const source of [gateway, operator, shared]) {
  assert(!source.includes('Deno.serve') && !source.includes('createClient(') && !source.includes('Deno.env') && !source.includes('process.env'), 'I3 source remains inactive and dependency-injected');
}
assert(gateway.includes('ISSUANCE_RECOVERY_PENDING') && gateway.includes('DATABASE_EXACT_RECOVERY_REQUIRED'), 'gateway fails closed when exact recovery lacks completion evidence');
assert(gateway.includes("requireExecution(credential, 'IDENTITY_RECOVER'"), 'gateway recovery phases recheck current recovery authority');
assert(shared.includes('GatewayAuthorizationScope') && shared.includes('pharmacyContextId'), 'gateway authority is applicant/context scoped');
assert(gateway.includes('authorizeProviderDispatchAtomic') && gateway.includes('authorizeProviderResolutionAtomic'), 'provider dispatch and resolution have distinct authoritative boundaries');
assert(gateway.includes('recoverCompletedIssuanceAtomic'), 'ambiguous completion fallback uses an authorized authoritative result lookup');
assert(gateway.includes('attempt.authoritativeCommand'), 'provider work derives its typed command from stored attempt evidence');
const recoverySource = gateway.slice(gateway.indexOf('export async function recoverIssuedIdentity'));
assert(!recoverySource.includes('createUnconfirmedOwner'), 'recovery-only path is structurally unable to create a provider identity');
assert(operator.includes('requireOperator(credential, permissionFor(command.action))'), 'admission replay rechecks exact current operator permission');
assert(shared.includes('credentialVersion') && shared.includes('principalId') && shared.includes('commandFingerprint'), 'operation identity separates stable principal from credential version');
assert(sql.trimStart().startsWith('-- BLK-002-I3 gateway/operator contract v1 (UNEXECUTED).'), 'migration is explicitly marked unexecuted');

assert(correction.startsWith('-- BLK-002-I3 bounded correction v1 (UNEXECUTED; independent review required).'), 'correction migration is explicitly unexecuted');
assert(correction.includes('CREATE TABLE public.owner_identity_issuance_attempts'), 'durable issuance-attempt ledger is additive');
assert(correction.indexOf('INSERT INTO public.owner_identity_issuance_attempts') < correction.indexOf('private_mark_owner_auth_pending_v1'), 'issuance attempt persists before provider work becomes eligible');
assert(correction.includes("v_a.state='PROVIDER_PENDING'") && correction.includes("MESSAGE='ISSUANCE_RECOVERY_PENDING'"), 'pending recovery cannot assert a completed result');
assert(correction.includes('private_i3_command_fingerprint_v1') && correction.includes('private_i3_assert_fingerprint_v1'), 'SQL computes and verifies canonical fingerprints');
assert(correction.includes("'PF-I3-COMMAND-V1'") && shared.includes('PF-I3-COMMAND-V1'), 'TypeScript and SQL share the canonical framing domain');
assert(correction.includes("octet_length(convert_to(p_value,'UTF8'))") && shared.includes('new TextEncoder().encode(value).length'), 'TypeScript and SQL frame UTF-8 byte lengths');
assert(correction.includes('r.normalized_email_digest IS DISTINCT FROM p_applicant_key'), 'revocation keeps email digest as stable applicant identity');
assert(!correction.includes('COALESCE(r.subject_id::TEXT'), 'subject identity is not substituted for applicant identity');
assert(correction.includes('owner_gateway_authorities') && correction.includes('a.active AND a.credential_version=v_version'), 'gateway authority is current, active, versioned and authoritative');
assert(correction.includes('owner_operator_authorities') && correction.includes('p_permission=ANY(a.permissions)'), 'operator authority checks current action permission');
assert(correction.includes('REVOKE EXECUTE ON FUNCTION public.rpc_gateway_reserve_owner_eligibility_v1'), 'unsafe v1 executor route is withdrawn');
assert(correction.includes('This source ordering is proposed compatibility, not PostgreSQL concurrency proof'), 'lock-source limitation is explicit');

assert(parity.startsWith('-- BLK-002-I3 final boundary/parity correction (UNEXECUTED; independent review required).'), 'parity migration is explicitly unexecuted');
assert(parity.includes('CREATE TABLE public.owner_security_operation_claims'), 'one global operation claim ledger covers pending and completed identities');
assert(parity.includes('trg_i3_claim_pending_operation') && parity.includes('trg_i3_claim_completed_operation'), 'pending attempts and completed operations claim the same namespace');
assert(parity.indexOf('WHERE operation_id=p_operation_id FOR UPDATE', parity.indexOf('rpc_gateway_begin_owner_identity_v3')) < parity.indexOf('owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE', parity.indexOf('rpc_gateway_begin_owner_identity_v3')), 'issuance begin checks completed global identity before pending attempt');
assert(parity.includes("private_i3_complete_owner_identity_v2('IDENTITY_ISSUE'") && parity.includes("private_i3_complete_owner_identity_v2('IDENTITY_RECOVER'"), 'issue and recovery completion use distinct current permissions');
assert(parity.includes("private_i3_require_gateway_v1('IDENTITY_RECOVER')") && parity.includes("'state',attempt.state,'result',attempt.canonical_result"), 'pending recovery is status-only before narrow completion');

const gatewayV2 = [
  'public.rpc_gateway_reserve_owner_eligibility_v2(UUID,UUID,TEXT,UUID,TEXT,TEXT,UUID,UUID,TEXT)',
  'public.rpc_gateway_begin_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
  'public.rpc_gateway_complete_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT)',
  'public.rpc_gateway_recover_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
];
const gatewayV3 = [
  'public.rpc_gateway_begin_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
  'public.rpc_gateway_complete_owner_identity_issue_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT)',
  'public.rpc_gateway_complete_owner_identity_recovery_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT)',
  'public.rpc_gateway_recover_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
];
const operatorV2 = [
  'public.rpc_platform_owner_admission_decide_v2(UUID,TEXT,UUID,TEXT,UUID,TEXT,UUID,TEXT)',
  'public.rpc_platform_owner_eligibility_revoke_v2(UUID,UUID,UUID,TEXT,UUID,TEXT,TEXT)',
];
for (const signature of [...gatewayV2, ...gatewayV3]) {
  assert(parity.includes(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_platform_admission_operator, pharmacyflow_owner_gateway_executor;`), `${signature} has explicit closed ACL`);
}
for (const signature of operatorV2) {
  assert(parity.includes(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;`), `${signature} has explicit closed ACL`);
}
for (const signature of [gatewayV2[0], ...gatewayV3]) {
  assert(parity.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO pharmacyflow_owner_gateway_executor;`), `${signature} grants only gateway executor`);
}
for (const signature of operatorV2) {
  assert(parity.includes(`GRANT EXECUTE ON FUNCTION ${signature} TO pharmacyflow_platform_admission_operator;`), `${signature} grants only operator executor`);
}
for (const signature of gatewayV2.slice(1)) {
  assert(!parity.includes(`GRANT EXECUTE ON FUNCTION ${signature}`), `${signature} remains withdrawn after v3 replacement`);
}
assert(parity.includes('not PostgreSQL deadlock, concurrency, or effective-ACL proof'), 'ACL and concurrency evidence limitation is explicit');

assert(linearization.startsWith('-- BLK-002 REV-LIN-01 transaction-entry linearization correction (UNEXECUTED).'), 'REV-LIN-01 migration is explicitly unexecuted');
assert(linearization.includes('CREATE TABLE public.owner_gateway_authority_scopes'), 'recovery scope is authoritative and applicant/context-specific');
assert(linearization.includes("s.capability=p_capability") && linearization.includes('s.applicant_key=p_applicant_key') && linearization.includes('s.pharmacy_context_id=p_pharmacy_context_id AND s.active'), 'scope check binds active principal capability, applicant and context');
assert(!/INSERT INTO public\.owner_gateway_authority_scopes/i.test(linearization), 'migration provisions no gateway authority scope');
assert(linearization.includes('ADD COLUMN original_credential_version') && linearization.includes('ADD COLUMN eligibility_id') && linearization.includes('ADD COLUMN intended_input_fingerprint'), 'new attempts capture original credential and complete typed-command provenance');
assert(linearization.includes("MESSAGE='LEGACY_ISSUANCE_PROVENANCE_INCOMPLETE'"), 'incomplete historical provenance fails closed explicitly');
assert(linearization.includes("'IDENTITY_ISSUE',p_attempt.principal_id") && linearization.includes('p_attempt.command_fingerprint IS DISTINCT FROM expected_fingerprint'), 'recovery verifies fingerprint with stored original principal');
assert(linearization.includes('CREATE TABLE public.owner_identity_execution_audit') && linearization.includes('trg_owner_identity_execution_audit_append_only'), 'execution/recovery actor evidence is append-only');
assert(linearization.includes('execution_principal_id') && linearization.includes('original_principal_id') && linearization.includes('original_credential_version'), 'execution actor is separate from immutable original provenance');
assert(linearization.includes("'PROVIDER_DISPATCH_AUTHORIZED'") && linearization.includes("'PROVIDER_RESOLUTION_AUTHORIZED'"), 'dispatch and resolution use separately audited authorization points');
assert(linearization.includes("'ISSUE_RESULT_LOOKUP'") && linearization.includes("'RECOVERY_RESULT_LOOKUP'"), 'ambiguous completion result lookups have action-specific authorization');
assert(linearization.includes('attempt.original_credential_version,attempt.applicant_email_digest'), 'completed operation preserves original credential provenance instead of recovery actor identity');
const completionStart = linearization.indexOf('CREATE FUNCTION public.private_i3_complete_owner_identity_v3');
const completionEnd = linearization.indexOf('CREATE FUNCTION public.rpc_gateway_complete_owner_identity_issue_v4', completionStart);
const completionBody = linearization.slice(completionStart, completionEnd);
assert(completionBody.indexOf('INSERT INTO public.owner_security_operations') < completionBody.indexOf('UPDATE public.owner_identity_issuance_attempts') && completionBody.indexOf('UPDATE public.owner_identity_issuance_attempts') < completionBody.lastIndexOf('private_i3_audit_identity_phase_v1'), 'completion, result persistence and required audit share one ordered transaction body');
assert(completionBody.includes('any audit error rolls back correlation, result and completion'), 'audit rollback semantics are explicit');
assert(linearization.includes('CREATE TRIGGER trg_i3_identity_attempt_monotonic'), 'original attempt bindings and canonical results are immutable');
const beginV4 = linearization.slice(linearization.indexOf('CREATE FUNCTION public.rpc_gateway_begin_owner_identity_v4'), linearization.indexOf('CREATE FUNCTION public.private_i3_authorize_identity_phase_v1'));
assert(beginV4.indexOf('owner_security_operations WHERE operation_id=p_operation_id FOR UPDATE') < beginV4.indexOf('owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE'), 'v4 begin preserves global completed-before-pending operation collision ordering');

const superseded = [
  'public.rpc_gateway_correlate_owner_identity_v1(UUID,UUID,TEXT,UUID,TEXT,UUID,UUID,TEXT)',
  'public.rpc_gateway_recover_owner_operation_v1(UUID,TEXT,TEXT,UUID,TEXT)',
  'public.rpc_gateway_begin_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
  'public.rpc_gateway_complete_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT)',
  'public.rpc_gateway_recover_owner_identity_v2(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
  'public.rpc_gateway_begin_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
  'public.rpc_gateway_complete_owner_identity_issue_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT)',
  'public.rpc_gateway_complete_owner_identity_recovery_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,UUID,TEXT)',
  'public.rpc_gateway_recover_owner_identity_v3(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
];
for (const signature of superseded) {
  const closure = linearization.slice(linearization.indexOf('-- Close every superseded identity route explicitly'), linearization.indexOf('-- New public RPCs start closed'));
  assert(closure.includes(signature), `${signature} is explicitly named in superseded-route closure`);
}
assert(linearization.includes('FROM PUBLIC, anon, authenticated, service_role, pharmacyflow_owner_gateway_executor, pharmacyflow_platform_admission_operator;'), 'superseded and new signatures explicitly close every unintended role');
const newRpcs = [
  'public.rpc_gateway_begin_owner_identity_v4(UUID,UUID,TEXT,UUID,UUID,UUID,TEXT,TEXT,TEXT,TEXT)',
  'public.rpc_gateway_authorize_owner_identity_dispatch_v1(UUID,TEXT,UUID)',
  'public.rpc_gateway_authorize_owner_identity_resolution_v1(UUID,TEXT,UUID)',
  'public.rpc_gateway_complete_owner_identity_issue_v4(UUID,TEXT,UUID,UUID,UUID)',
  'public.rpc_gateway_complete_owner_identity_recovery_v4(UUID,TEXT,UUID,UUID,UUID)',
  'public.rpc_gateway_recover_owner_identity_v4(UUID,TEXT,UUID)',
  'public.rpc_gateway_lookup_owner_identity_issue_result_v1(UUID,TEXT,UUID)',
  'public.rpc_gateway_lookup_owner_identity_recovery_result_v1(UUID,TEXT,UUID)',
];
const newAcl = linearization.slice(linearization.indexOf('-- New public RPCs start closed'), linearization.indexOf('-- Each RPC performs its current authority'));
const revokeBlock = newAcl.slice(0, newAcl.indexOf('GRANT EXECUTE ON FUNCTION'));
const grantBlock = newAcl.slice(newAcl.indexOf('GRANT EXECUTE ON FUNCTION'));
for (const signature of newRpcs) {
  assert(linearization.includes(`ALTER FUNCTION ${signature} OWNER TO pharmacyflow_owner_eligibility_issuer;`), `${signature} has fixed SECURITY DEFINER ownership`);
  assert(revokeBlock.includes(signature) && grantBlock.includes(signature), `${signature} is explicitly revoked then granted only in the new RPC ACL block`);
}
assert(!/GRANT EXECUTE[\s\S]*?TO service_role;/i.test(linearization), '000033 grants no execution to service_role');
assert(linearization.includes('TO pharmacyflow_owner_gateway_executor;'), 'only the intended gateway executor receives new RPC execution');
assert(linearization.includes('not PostgreSQL ACL, RLS, rollback, or concurrency acceptance'), '000033 states its unexecuted evidence boundary');

assert(principalBinding.startsWith('-- BLK-002 PF-SUP-2026-10-26-15 issue-route principal binding correction (UNEXECUTED).'), '000034 is explicitly forward-only and unexecuted');
assert((principalBinding.match(/p_capability='IDENTITY_ISSUE' AND actor\.principal_id IS DISTINCT FROM attempt\.principal_id/g)||[]).length===3, 'dispatch, completion and result lookup all bind issue actor to original principal');
assert(!principalBinding.includes('actor.credential_version IS DISTINCT FROM attempt.original_credential_version'), 'issue binding preserves same-principal credential rotation');
for(const functionName of ['private_i3_authorize_identity_phase_v1','private_i3_complete_owner_identity_v3','private_i3_lookup_owner_identity_v1']){
  const start=principalBinding.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`);
  const end=principalBinding.indexOf('CREATE OR REPLACE FUNCTION public.',start+1);
  const body=principalBinding.slice(start,end<0?principalBinding.length:end);
  assert(body.indexOf('private_i3_require_gateway_scope_v1') < body.indexOf('owner_identity_issuance_attempts WHERE operation_id=p_operation_id FOR UPDATE'), `${functionName} authorizes before attempt access`);
}
const repairedCompletion=principalBinding.slice(principalBinding.indexOf('CREATE OR REPLACE FUNCTION public.private_i3_complete_owner_identity_v3'),principalBinding.indexOf('CREATE OR REPLACE FUNCTION public.private_i3_lookup_owner_identity_v1'));
assert(repairedCompletion.includes("attempt.state='COMPLETED'") && repairedCompletion.includes('attempt.subject_id IS DISTINCT FROM p_subject_id') && repairedCompletion.includes('RETURN attempt.canonical_result'), 'completed exact retry returns canonical result and rejects changed subject');
assert(repairedCompletion.indexOf('attempt.provider_operation_id IS DISTINCT FROM p_provider_operation_id') < repairedCompletion.indexOf("attempt.state='COMPLETED'"), 'provider correlation is checked before completed replay disclosure');
assert(repairedCompletion.indexOf('INSERT INTO public.owner_security_operations') < repairedCompletion.indexOf('UPDATE public.owner_identity_issuance_attempts') && repairedCompletion.indexOf('UPDATE public.owner_identity_issuance_attempts') < repairedCompletion.lastIndexOf('private_i3_audit_identity_phase_v1'), 'completion persistence and required audit remain one ordered transaction body');
assert(principalBinding.includes('an audit error rolls back correlation, operation and completion'), '000034 states atomic audit rollback semantics');
assert(gatewayTest.includes("r.scopes?.get(this.scopeKey(cap,scope)) !== true"), 'injected authority denies an absent or inactive scope by default');
assert(gatewayTest.includes('ORIGINAL_ISSUE_PRINCIPAL_REQUIRED') && gatewayTest.includes("execution.capability==='IDENTITY_ISSUE'"), 'injected repository mirrors issue-route original-principal binding');
assert(gatewayTest.includes('missing-scope') && gatewayTest.includes('inactive-scope') && gatewayTest.includes('wrong-capability-scope') && gatewayTest.includes('wrong-applicant-scope') && gatewayTest.includes('wrong-context-scope'), 'scope denial regressions cover every reviewed negative class');
assert(!/INSERT INTO public\.owner_gateway_authority_scopes/i.test(principalBinding), '000034 provisions no authority scope');
const repairAcl=principalBinding.slice(principalBinding.indexOf('-- Reassert exact 000033 public RPC ACLs'));
for(const signature of newRpcs){
  assert(repairAcl.slice(0,repairAcl.indexOf('GRANT EXECUTE ON FUNCTION')).includes(signature) && repairAcl.slice(repairAcl.indexOf('GRANT EXECUTE ON FUNCTION')).includes(signature), `${signature} is explicitly revoked then narrowly regranted by 000034`);
}
assert(!/GRANT EXECUTE[\s\S]*?TO service_role;/i.test(principalBinding), '000034 grants no execute privilege to service_role');
assert(principalBinding.includes('not PostgreSQL parsing, execution, effective ACL/RLS'), '000034 states its static evidence limitation');

console.log(`BLK-002-I3 static gateway/operator contract tests: ${passed} passed`);
