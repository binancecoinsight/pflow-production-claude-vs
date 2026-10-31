import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root='scripts/acceptance/i3a/'; const read=p=>readFileSync(p,'utf8');
const contract=read(`${root}contract.ts`), preflightTs=read(`${root}preflight.ts`), preflightPs=read(`${root}preflight.ps1`);
const required=[...contract.matchAll(/'((?:scripts\/acceptance\/i3a|supabase\/(?:migrations|functions))\/[^']+)'/g)].map(m=>m[1]);
for(const path of new Set(required)){assert(existsSync(path),`required inventory exists: ${path}`);assert(preflightPs.includes(`'${path}'`),`PowerShell uses canonical inventory path ${path}`);}
for(const term of ['complete source/runner/migration hash inventory','sealed migration hash override','command is not narrowly authorized','exact permission']) assert(preflightTs.includes(term));
assert(preflightPs.includes('$sealedMigrationHashes')&&preflightPs.includes('sealed migration hash override'),'PowerShell pins sealed migration hashes independently of authorization observations');

for(const file of ['contract.ts','preflight.ts','orchestrator.ts','concurrency-evidence.ts','evidence.ts','process-output.ts','runner-contract.ts','identity-response.ts']){
 const source=read(`${root}${file}`);for(const forbidden of ['child_process','execFile','spawn(','fetch(','Deno.env','process.env','@supabase/supabase-js']) assert(!source.includes(forbidden),`${file} import is side-effect free`);
}
const executor=read(`${root}executor.ps1`), concurrency=read(`${root}concurrency-runner.ps1`), scenarios=read(`${root}scenarios.ps1`);
for(const source of [executor,concurrency]){
 for(const exact of ["-h '127.0.0.1'","-p '57322'","-d 'postgres'","-U 'postgres'",'--no-password','PGSERVICEFILE','PGPASSWORD']) assert(source.includes(exact),`runner pins/clears ${exact}`);
 assert(!source.includes('service='),'service aliases are never used');assert(!source.includes('docker'),'no service discovery');
 assert(!source.includes('2>&1'),'stdout and stderr are never merged');assert(source.includes('process-output.ps1'),'runner validates framed output');
}
assert(executor.indexOf('01_target_proof.sql')<executor.indexOf("'sql\\10_fixture.sql'"),'authoritative target proof precedes writable fixture dispatch');
for(const term of ['system_identifier','database_oid','server_addr','session_user']) assert(executor.includes(term));

const fixture=read(`${root}sql/10_fixture.sql`),cleanup=read(`${root}sql/90_cleanup.sql`);
for(const term of ['refusing adoption','attributes_digest','fixture run ownership mismatch','gateway fixture attributes mismatch','operator fixture attributes mismatch']) assert(fixture.includes(term));
assert(!fixture.includes('ON CONFLICT (principal_id) DO NOTHING'),'existing identities are not silently adopted');
for(const term of ['owner_gateway_authority_scopes','gateway-authority-scope','unknown existing gateway scope','refusing adoption']) assert(fixture.includes(term),`disposable scope fixture enforces ${term}`);
for(const dependency of ['owner_identity_execution_audit','owner_identity_issuance_attempts','owner_security_operation_claims','owner_security_operations','owner_admission_decisions','owner_eligibility_revocation_decisions','unresolved work']) assert(cleanup.includes(dependency));
assert(cleanup.indexOf('DELETE FROM public.owner_gateway_authority_scopes')<cleanup.indexOf('DELETE FROM public.owner_gateway_authorities'),'scope cleanup precedes referenced authority cleanup');
assert(!cleanup.includes('DROP TABLE')&&!cleanup.includes('DROP SCHEMA')&&!cleanup.includes('DROP DATABASE'),'cleanup preserves shared objects/environment');

for(const term of ['pg_blocking_pids','pg_locks','observed_blocker_pid','observed_waiter_pid','statement_timeout','lock_timeout','pg_cancel_backend','VERIFIED_ROLLBACK','UNVERIFIED_CANCELLATION','stale concurrency evidence']) assert(concurrency.includes(term)||scenarios.includes(term),`concurrency proof contains ${term}`);
assert(!concurrency.includes('lock_wait_observed=true'),'sessions/coordinator cannot self-assert a boolean overlap claim');
assert(!scenarios.includes('pg_advisory_xact_lock'),'harness never wraps business operations in its own advisory lock');
assert(!scenarios.includes('::int::oid')&&!concurrency.includes('::int::oid'),'advisory lock identity never narrows through signed int');
const runnerContractPs=read(`${root}runner-contract.ps1`);
assert(runnerContractPs.includes('4294967295')&&scenarios.includes('Get-I3aAdvisoryLockComponentsSql')&&concurrency.includes('LockComponentsSql'),'both SQL paths share unsigned 32-bit lock decomposition');
for(const term of ['COORDINATOR_OBSERVED','WITH changed AS','Assert-I3aMutationAcknowledgement']) assert(concurrency.includes(term),`coordinator mutation validates ${term}`);
for(const term of ['ExpectedOutcomeEffectCounts','ExpectedFinalEffectCount','FinalInvariantSql','outcomeEffectCounts=$observedCounts','finalStateInvariant=$finalInvariant','scenario fixture path escapes reviewed SQL root']) assert(concurrency.includes(term),`runner enforces reservation/revocation contract ${term}`);
for(const rpc of ['rpc_gateway_begin_owner_identity_v4','rpc_platform_owner_admission_decide_v2']) assert(scenarios.includes(rpc),`concurrency invokes actual ${rpc}`);
assert(scenarios.includes('rpc_gateway_reserve_owner_eligibility_v2'),'reservation concurrency invokes actual reserve RPC');
for(const caseId of ['RESERVATION_REVOCATION_RESERVATION_FIRST','RESERVATION_REVOCATION_REVOCATION_FIRST']) assert(scenarios.includes(`'${caseId}'`),`reservation/revocation ordering is wired: ${caseId}`);
for(const setup of ['41_reservation_first_fixture.sql','42_revocation_first_fixture.sql']) assert(scenarios.includes(setup),`scenario binds reviewed committed fixture ${setup}`);
assert(scenarios.includes("hashtextextended('$k',1)"),'both reservation/revocation paths prove the production applicant/email lock');
for(const blocked of ['provider-resolution outcomes and a reviewed committed pending fixture lifecycle remain outside this package','genuine consumption requires confirmed Auth identity']) assert(scenarios.includes(blocked),`non-genuine case is explicitly blocked: ${blocked}`);
for(const caseId of ['OPERATION_COLLISION_PENDING_FIRST','OPERATION_COLLISION_COMPLETED_FIRST','DURABLE_PENDING_RECOVERY','CONSUMPTION_REVOCATION']) assert(scenarios.includes(`'${caseId}'`));

const reservationFixture=read(`${root}sql/41_reservation_first_fixture.sql`),revocationFixture=read(`${root}sql/42_revocation_first_fixture.sql`);
for(const source of [reservationFixture,revocationFixture]){
 assert(source.includes('rpc_platform_owner_admission_decide_v2'),'committed active admission fixture uses production RPC');
 assert(source.includes('refusing adoption'),'fixture refuses pre-existing identifiers');
 assert(!source.includes('INSERT INTO public.owner_'),'fixture does not directly insert business/security rows');
}
assert(cleanup.includes('reservation/revocation immutable evidence exists; fixture cleanup refused'),'cleanup preserves immutable scenario evidence');

const caseFiles=['20_acl_rls_assertions.sql','21_role_dml_denial.sql','22_authority_assertions.sql','23_operation_recovery_assertions.sql','24_atomic_replay_assertions.sql','25_lifecycle_recovery_assertions.sql','26_identity_phase_assertions.sql'];
const cases=caseFiles.map(f=>read(`${root}sql/${f}`)).join('\n');
for(const term of ['has_function_privilege','relforcerowsecurity','assert_dml_denied','private_i3_require_gateway_scope_v1','OPERATION_COLLISION_PENDING_FIRST','rpc_gateway_recover_owner_identity_v4','INJECTED_AUDIT_FAILURE','CANONICAL_REPLAY','UTF8_NULL_UUID_PARITY','CONSUMPTION_REVOCATION']) assert(cases.includes(term),`concrete SQL contains ${term}`);
assert(cases.includes('PASS_SIMULATED_DATABASE_CLAIMS')&&cases.includes('NOT_IMPLEMENTED_AUTH_REQUIRED'),'simulated database claims and remaining Auth gap are explicit');
assert(cases.includes('JSON_NULL_SQL_NULL_MISSING')&&cases.includes('rpc_gateway_begin_owner_identity_v4'),'SQL distinguishes null forms and includes the current identity boundary');
const phaseCase=read(`${root}sql/26_identity_phase_assertions.sql`);
for(const term of ['CROSS_PRINCIPAL_ISSUE_DISPATCH','CROSS_PRINCIPAL_ISSUE_COMPLETION','CROSS_PRINCIPAL_ISSUE_DISCLOSURE','rpc_gateway_authorize_owner_identity_resolution_v1','RECOVERY_ONLY_CREATED_IDENTITY','CHANGED_PROVIDER_CORRELATION','APPEND_ONLY_PHASE_AUDIT_PROVENANCE','BLOCKED_AUTH_02_TRUSTED_SUBJECT_REQUIRED']) assert(phaseCase.includes(term),`phase acceptance source covers ${term}`);
const aclCase=read(`${root}sql/20_acl_rls_assertions.sql`);
for(const signature of ['rpc_gateway_begin_owner_identity_v4','rpc_gateway_authorize_owner_identity_dispatch_v1','rpc_gateway_authorize_owner_identity_resolution_v1','rpc_gateway_complete_owner_identity_issue_v4','rpc_gateway_complete_owner_identity_recovery_v4','rpc_gateway_recover_owner_identity_v4','rpc_gateway_lookup_owner_identity_issue_result_v1','rpc_gateway_lookup_owner_identity_recovery_result_v1']) assert(aclCase.includes(signature),`ACL case pins ${signature}`);
assert(aclCase.includes('SUPERSEDED_IDENTITY_RPC_CLOSED'),'superseded identity routes are explicitly denied');
const retiredPattern=/public\.(rpc_gateway_(?:correlate_owner_identity_v1|recover_owner_operation_v1|begin_owner_identity_v2|complete_owner_identity_v2|recover_owner_identity_v2|begin_owner_identity_v3|complete_owner_identity_issue_v3|complete_owner_identity_recovery_v3|recover_owner_identity_v3)\([^)]*\))/g;
const retiredFromMigrations=new Set([...read('supabase/migrations/20261026000033_owner_identity_recovery_linearization_v1.sql').matchAll(retiredPattern),...read('supabase/migrations/20261026000034_owner_identity_issue_principal_binding_v1.sql').matchAll(retiredPattern)].map(m=>m[1].toLowerCase()));
const closedBlock=aclCase.slice(aclCase.indexOf('CREATE TEMP TABLE closed_identity_rpc_acl'),aclCase.indexOf('DO $closed_acl$'));
const retiredInAcl=new Set([...closedBlock.matchAll(retiredPattern)].map(m=>m[1].toLowerCase()));
assert.deepEqual([...retiredInAcl].sort(),[...retiredFromMigrations].sort(),'closed-route ACL matrix covers every superseded identity signature revoked by 000033-000034');
assert.equal(retiredInAcl.size,9,'exactly nine superseded identity signatures are covered');
for(const v2 of ['rpc_gateway_begin_owner_identity_v2','rpc_gateway_complete_owner_identity_v2','rpc_gateway_recover_owner_identity_v2']) assert(closedBlock.includes(v2),`closed ACL contains retired ${v2}`);
for(const term of ['assert_i3a_pending_identity_response','IDENTITY_RESPONSE_OBJECT_REQUIRED','IDENTITY_RESPONSE_STATE_INVALID','IDENTITY_RESPONSE_PENDING_RESULT_INVALID','IDENTITY_RESPONSE_ORIGINAL_VERSION_INVALID','IDENTITY_RESPONSE_ORIGINAL_IDENTITY_INVALID','IDENTITY_RESPONSE_PROVIDER_OPERATION_INVALID','MALFORMED_IDENTITY_RESPONSE_ACCEPTED']) assert(phaseCase.includes(term),`SQL response assertion covers ${term}`);
for(const guard of ["p_payload IS NULL","jsonb_typeof(p_payload) IS DISTINCT FROM 'object'","NOT (p_payload ? 'result')","p_payload->'result' IS DISTINCT FROM 'null'::jsonb","?& ARRAY['operation_id','action','principal_id','applicant_key','pharmacy_context_id','command_fingerprint']"]) assert(phaseCase.includes(guard),`SQL response assertion is fail closed: ${guard}`);
for(const file of ['01_target_proof.sql','10_fixture.sql',...caseFiles,'90_cleanup.sql']) assert(read(`${root}sql/${file}`).includes('PF_I3A_RESULT='),`${file} emits one framed result contract`);
assert(!read(`${root}sql/20_acl_rls_assertions.sql`).includes('BEGIN READ ONLY'),'temporary assertion setup is not incorrectly declared read only');
const executorAssertions=read(`${root}executor.ps1`);assert(executorAssertions.includes("'sql\\26_identity_phase_assertions.sql'"),'new phase assertions are wired to postgres-assertions');

for(const [migration,hash] of [
 ['20261026000033_owner_identity_recovery_linearization_v1.sql','1065386b66fcc3b03b4a9e3026869b6aee4ebeeea6c572ead9d7e3ac0ec8477f'],
 ['20261026000034_owner_identity_issue_principal_binding_v1.sql','3ed6fa4aa1a0fc85d52df0bbdd644095c40f301e357630ff9d304b5fec07582b'],
]) { assert(contract.includes(migration)&&contract.includes(hash),`TypeScript seals ${migration}`); assert(preflightPs.includes(migration)&&preflightPs.includes(hash),`PowerShell seals ${migration}`); }

const evidencePs=read(`${root}evidence.ps1`);for(const runner of [executor,concurrency]) assert(runner.includes('Write-I3aEvidence')&&runner.includes('ConvertTo-I3aSanitizedText'),'every runner sanitizes persisted success/error evidence');
for(const term of ['REDACTED_JWT','REDACTED_CONNECTION','password|passwd|pwd']) assert(evidencePs.includes(term));
for(const term of ['Protect-I3aEvidenceValue','System.Collections.IDictionary','System.Collections.IEnumerable','ConvertFrom-Json']) assert(evidencePs.includes(term),`PowerShell sanitizer recursively handles ${term}`);
const processOutput=read(`${root}process-output.ts`),processOutputPs=read(`${root}process-output.ps1`);
for(const source of [processOutput,processOutputPs]) for(const term of ['PF_I3A_RESULT=','exactly one','pharmacyflow-i3a-process-v1']) assert(source.toLowerCase().includes(term.toLowerCase()),`process framing contains ${term}`);
const example=JSON.parse(read(`${root}authorization.example.json`));assert.equal(example.status,'NOT_AUTHORIZED');assert.equal(example.providerAuthBrowserEnabled,false);
console.log('ACC-01 PF-SUP-17 assertion-closure source static tests: passed (9 retired identity signatures; fail-closed response guards)');
