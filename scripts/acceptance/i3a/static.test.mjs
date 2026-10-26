import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const root='scripts/acceptance/i3a/'; const read=p=>readFileSync(p,'utf8');
const contract=read(`${root}contract.ts`), preflightTs=read(`${root}preflight.ts`), preflightPs=read(`${root}preflight.ps1`);
const required=[...contract.matchAll(/'((?:scripts\/acceptance\/i3a|supabase\/(?:migrations|functions))\/[^']+)'/g)].map(m=>m[1]);
for(const path of new Set(required)){assert(existsSync(path),`required inventory exists: ${path}`);assert(preflightPs.includes(`'${path}'`),`PowerShell uses canonical inventory path ${path}`);}
for(const term of ['complete source/runner/migration hash inventory','sealed migration hash override','command is not narrowly authorized','exact permission']) assert(preflightTs.includes(term));
assert(preflightPs.includes('$sealedMigrationHashes')&&preflightPs.includes('sealed migration hash override'),'PowerShell pins sealed migration hashes independently of authorization observations');

for(const file of ['contract.ts','preflight.ts','orchestrator.ts','concurrency-evidence.ts','evidence.ts','process-output.ts']){
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
for(const dependency of ['owner_identity_issuance_attempts','owner_security_operation_claims','owner_security_operations','owner_admission_decisions','owner_eligibility_revocation_decisions','unresolved work']) assert(cleanup.includes(dependency));
assert(!cleanup.includes('DROP TABLE')&&!cleanup.includes('DROP SCHEMA')&&!cleanup.includes('DROP DATABASE'),'cleanup preserves shared objects/environment');

for(const term of ['pg_blocking_pids','pg_locks','observed_blocker_pid','observed_waiter_pid','statement_timeout','lock_timeout','pg_cancel_backend','VERIFIED_ROLLBACK','UNVERIFIED_CANCELLATION','stale concurrency evidence']) assert(concurrency.includes(term)||scenarios.includes(term),`concurrency proof contains ${term}`);
assert(!concurrency.includes('lock_wait_observed=true'),'sessions/coordinator cannot self-assert a boolean overlap claim');
assert(!scenarios.includes('pg_advisory_xact_lock'),'harness never wraps business operations in its own advisory lock');
for(const rpc of ['rpc_gateway_begin_owner_identity_v3','rpc_platform_owner_admission_decide_v2']) assert(scenarios.includes(rpc),`concurrency invokes actual ${rpc}`);
for(const blocked of ['does not acquire an observable application lock','genuine consumption requires confirmed Auth identity']) assert(scenarios.includes(blocked),`non-genuine case is explicitly blocked: ${blocked}`);
for(const caseId of ['OPERATION_COLLISION_PENDING_FIRST','OPERATION_COLLISION_COMPLETED_FIRST','DURABLE_PENDING_RECOVERY','RESERVATION_REVOCATION','CONSUMPTION_REVOCATION']) assert(scenarios.includes(`'${caseId}'`));

const cases=['20_acl_rls_assertions.sql','21_role_dml_denial.sql','22_authority_assertions.sql','23_operation_recovery_assertions.sql','24_atomic_replay_assertions.sql','25_lifecycle_recovery_assertions.sql'].map(f=>read(`${root}sql/${f}`)).join('\n');
for(const term of ['has_function_privilege','relforcerowsecurity','assert_dml_denied','private_i3_require_gateway_v1','OPERATION_COLLISION_PENDING_FIRST','rpc_gateway_recover_owner_identity_v3','INJECTED_AUDIT_FAILURE','CANONICAL_REPLAY','UTF8_NULL_UUID_PARITY','CONSUMPTION_REVOCATION']) assert(cases.includes(term),`concrete SQL contains ${term}`);
assert(cases.includes('PASS_SIMULATED_DATABASE_CLAIMS')&&cases.includes('NOT_IMPLEMENTED_AUTH_REQUIRED'),'simulated database claims and remaining Auth gap are explicit');
assert(cases.includes('JSON_NULL_SQL_NULL_MISSING')&&cases.includes('rpc_gateway_begin_owner_identity_v3'),'SQL distinguishes null forms and uses intended recovery boundary');
for(const file of ['01_target_proof.sql','10_fixture.sql','20_acl_rls_assertions.sql','21_role_dml_denial.sql','22_authority_assertions.sql','23_operation_recovery_assertions.sql','24_atomic_replay_assertions.sql','25_lifecycle_recovery_assertions.sql','90_cleanup.sql']) assert(read(`${root}sql/${file}`).includes('PF_I3A_RESULT='),`${file} emits one framed result contract`);
assert(!read(`${root}sql/20_acl_rls_assertions.sql`).includes('BEGIN READ ONLY'),'temporary assertion setup is not incorrectly declared read only');

const evidencePs=read(`${root}evidence.ps1`);for(const runner of [executor,concurrency]) assert(runner.includes('Write-I3aEvidence')&&runner.includes('ConvertTo-I3aSanitizedText'),'every runner sanitizes persisted success/error evidence');
for(const term of ['REDACTED_JWT','REDACTED_CONNECTION','password|passwd|pwd']) assert(evidencePs.includes(term));
for(const term of ['Protect-I3aEvidenceValue','System.Collections.IDictionary','System.Collections.IEnumerable','ConvertFrom-Json']) assert(evidencePs.includes(term),`PowerShell sanitizer recursively handles ${term}`);
const processOutput=read(`${root}process-output.ts`),processOutputPs=read(`${root}process-output.ps1`);
for(const source of [processOutput,processOutputPs]) for(const term of ['PF_I3A_RESULT=','exactly one','pharmacyflow-i3a-process-v1']) assert(source.toLowerCase().includes(term.toLowerCase()),`process framing contains ${term}`);
const example=JSON.parse(read(`${root}authorization.example.json`));assert.equal(example.status,'NOT_AUTHORIZED');assert.equal(example.providerAuthBrowserEnabled,false);
console.log('ACC-01 PF-SUP-10 execution-fidelity static contract tests: passed');
