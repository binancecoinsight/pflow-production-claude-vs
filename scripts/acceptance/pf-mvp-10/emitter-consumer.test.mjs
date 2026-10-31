import {readFileSync,readdirSync} from 'node:fs';
let passed=0;const check=(value,message)=>{if(!value)throw new Error(`FAIL:${message}`);passed++};const root='scripts/acceptance/pf-mvp-10/';const read=path=>readFileSync(path,'utf8');
const sqlFiles=readdirSync(root+'sql').filter(name=>name.endsWith('.sql')).sort();const emitters=new Map();
for(const name of sqlFiles){const source=read(root+'sql/'+name);emitters.set(name,[...source.matchAll(/PF_(?:PASS|RESULT|COUNT|EVENT)\|[A-Za-z0-9_.:=;|'-]+/g)].map(match=>match[0].replace(/'$/,'')))}
const expectedCounts={
 '00_runtime_compatibility.sql':1,'01_empty_target.sql':1,'02_package_state.sql':1,'10_acl_and_contracts.sql':1,'15_api_role_rls.sql':1,'20_transactional_scenarios.sql':1,'25_financial_refund.sql':1,'30_concurrency_setup.sql':1,'31_concurrency_worker.sql':2,'31_concurrency_worker_two.sql':2,'32_concurrency_verify.sql':1,'33_concurrency_verify.sql':1,'34_concurrency_abort_verify.sql':1,'90_cleanup.sql':1,
};
for(const [name,count] of Object.entries(expectedCounts))check(emitters.get(name)?.length===count,`${name} emits ${count} protocol frame source${count===1?'':'s'}`);
check(!read(root+'sql/20_transactional_scenarios.sql').includes("RAISE NOTICE 'PF_PASS"),'transactional module has no duplicate success notice');
const runtime=read(root+'sql/00_runtime_compatibility.sql'),runnerLib=read(root+'runner-lib.ps1'),dispatch=read(root+'command-dispatch.ps1'),concurrency=read(root+'concurrency.ps1');
check(runtime.includes("'PF_PASS|runtime|'||current_setting('server_version_num')||'|target-verified'")&&dispatch.includes('Get-PfMvp10RuntimeFramePattern')&&concurrency.includes('Get-PfMvp10RuntimeFramePattern'),'shared runtime frame source and consumers agree');
check(runnerLib.includes('Test-PfMvp10BenignNotice')&&runnerLib.includes('extension "pgcrypto" already exists, skipping')&&read('supabase/migrations/20261003000000_foundation_v1.sql').includes('CREATE EXTENSION IF NOT EXISTS pgcrypto'),'benign migration notice policy is source-backed and narrow');
check(runnerLib.includes('column "[A-Za-z0-9_.-]+" of relation')&&runnerLib.includes('constraint "[A-Za-z0-9_.-]+" of relation')&&read('supabase/migrations/20261007000015_m15_stock_transfers.sql').includes('DROP CONSTRAINT IF EXISTS'),'column/constraint notice forms match migration-chain DDL');
check(runnerLib.includes('malformed psql diagnostic prefix')&&runnerLib.includes('unrelated psql diagnostic source')&&read(root+'native-client-conformance.test.ps1').includes('approved input with spaces.sql'),'native diagnostic prefixes bind to the approved SQL input');
check(runnerLib.includes('unexpected worker evidence frame')&&runnerLib.includes('unexpected worker process output'),'worker consumer rejects non-event and unframed output');
check(read(root+'concurrency-coordinator.test.ps1').includes("'PF_PASS|token=secret'")&&read(root+'concurrency-coordinator.test.ps1').includes("'PF_EVENT|1|intruder|READY|backend=9'"),'retention-gap regressions cover secret frame and extra actor');
check(read(root+'command-surface.test.ps1').includes('Get-RepresentativeSqlFrame'),'five-command rehearsal derives representative frames from SQL sources');
for(const [name,consumer] of Object.entries({
 '00_runtime_compatibility.sql':dispatch,'01_empty_target.sql':dispatch,'02_package_state.sql':dispatch,'10_acl_and_contracts.sql':dispatch,'15_api_role_rls.sql':dispatch,'20_transactional_scenarios.sql':dispatch,'25_financial_refund.sql':dispatch,'90_cleanup.sql':dispatch,
 '30_concurrency_setup.sql':concurrency,'31_concurrency_worker.sql':concurrency,'31_concurrency_worker_two.sql':concurrency,'32_concurrency_verify.sql':concurrency,'33_concurrency_verify.sql':concurrency,'34_concurrency_abort_verify.sql':concurrency,
}))check(consumer.includes(name),`${name} has an explicit production consumer`);
console.log(`PF-MVP-10 emitter/consumer static conformance: ${passed} passed`);
