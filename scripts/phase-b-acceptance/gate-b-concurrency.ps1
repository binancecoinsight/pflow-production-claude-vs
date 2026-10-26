param()

$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'acceptance\target-guard.ps1')
. (Join-Path (Split-Path $PSScriptRoot -Parent) 'acceptance\concurrency-harness.ps1')
$target = Get-AcceptanceTarget
Assert-AcceptanceDockerTarget $target
$targetId = $target.Id
$container = $target.DbContainer
$expectedDatabase = 'postgres'
function Invoke-Psql([string]$sql) {
  $output = & docker exec $container psql -U postgres -d $expectedDatabase -X -A -t -v ON_ERROR_STOP=1 -c $sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $($output | Out-String)" }
  return ($output | Out-String).Trim()
}

$actualDatabase = Invoke-Psql 'SELECT current_database();'
if ($actualDatabase -cne $expectedDatabase) {
  throw "ABORT: database identity mismatch. Expected [$expectedDatabase], found [$actualDatabase]."
}

$fixtureIdentity = Invoke-Psql "SELECT name FROM public.pharmacies WHERE id='b1000000-0000-4000-8000-000000000001';"
if ($fixtureIdentity -cne 'PF Phase B Acceptance Tenant A') {
  throw 'ABORT: committed Gate A/B fixture identity is absent or mismatched.'
}

function Run-Pair([string]$name, [string]$sqlA, [string]$sqlB, [string]$expectedA, [string]$expectedB, [bool]$allowSwapped = $false) {
  Invoke-DeterministicConcurrencyPair -Name $name -Container $container -Database $expectedDatabase -SqlA $sqlA -SqlB $sqlB -ExpectedA $expectedA -ExpectedB $expectedB -AllowSwappedOutcomes:$allowSwapped -InvokeSql { param($query) Invoke-Psql $query }
}

$replayA = @'
BEGIN;
SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='15s';
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT 'pid='||pg_backend_pid();
SELECT 'PF_RESULT|' || operation_status FROM public.rpc_commit_sale_v1(
'b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
'ba000000-0000-4000-8000-000000000201','bb000000-0000-4000-8000-000000000201','bc000000-0000-4000-8000-000000000201',repeat('d',64),
jsonb_build_object('id','b8000000-0000-4000-8000-000000000201','currency','NGN','subtotal',1000,'discount',0,'tax',0,'total',1000,'payment_method','CASH','amount_tendered',1000,'change_due',0,'payment_status','SETTLED','client_created_at','2026-10-23T12:00:00Z'),
jsonb_build_array(jsonb_build_object('id','b9000000-0000-4000-8000-000000000201','product_id','b5000000-0000-4000-8000-000000000001','batch_id','b6000000-0000-4000-8000-000000000201','quantity',1,'unit_price',1000,'discount',0,'tax',0,'line_total',1000)));
SELECT pg_sleep(4); COMMIT;
'@
$replayB = $replayA.Replace("bc000000-0000-4000-8000-000000000201","bc000000-0000-4000-8000-000000000202").Replace("SELECT pg_sleep(4); ","")
Run-Pair 'M18-CONC-01' $replayA $replayB 'COMMITTED' 'ALREADY_COMMITTED' $true

$checkoutA = @'
BEGIN;
SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='15s';
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT 'pid='||pg_backend_pid();
DO $body$ DECLARE c text; r record; BEGIN
  BEGIN
    SELECT * INTO r FROM public.rpc_commit_sale_v1(
'b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
'ba000000-0000-4000-8000-000000000202','bb000000-0000-4000-8000-000000000202','bc000000-0000-4000-8000-000000000203',repeat('e',64),
jsonb_build_object('id','b8000000-0000-4000-8000-000000000202','currency','NGN','subtotal',1000,'discount',0,'tax',0,'total',1000,'payment_method','CASH','amount_tendered',1000,'change_due',0,'payment_status','SETTLED','client_created_at','2026-10-23T12:01:00Z'),
jsonb_build_array(jsonb_build_object('id','b9000000-0000-4000-8000-000000000202','product_id','b5000000-0000-4000-8000-000000000001','batch_id','b6000000-0000-4000-8000-000000000202','quantity',1,'unit_price',1000,'discount',0,'tax',0,'line_total',1000)));
    RAISE NOTICE 'PF_RESULT|%',r.operation_status;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS c=CONSTRAINT_NAME;
    IF c <> 'uq_sales_pharmacy_checkout_intent' THEN RAISE; END IF;
    RAISE NOTICE 'PF_RESULT|CHECKOUT_CONFLICT constraint=%',c;
  END;
END $body$;
SELECT pg_sleep(4); COMMIT;
'@
$checkoutB = @'
BEGIN;
SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='15s';
SELECT set_config('request.jwt.claim.role','service_role',true);
SELECT 'pid='||pg_backend_pid();
DO $body$ DECLARE c text; r record; BEGIN
  BEGIN
    SELECT * INTO r FROM public.rpc_commit_sale_v1(
    'b3000000-0000-4000-8000-000000000004','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001',
    'ba000000-0000-4000-8000-000000000203','bb000000-0000-4000-8000-000000000202','bc000000-0000-4000-8000-000000000204',repeat('f',64),
    jsonb_build_object('id','b8000000-0000-4000-8000-000000000203','currency','NGN','subtotal',1000,'discount',0,'tax',0,'total',1000,'payment_method','CASH','amount_tendered',1000,'change_due',0,'payment_status','SETTLED','client_created_at','2026-10-23T12:01:01Z'),
    jsonb_build_array(jsonb_build_object('id','b9000000-0000-4000-8000-000000000203','product_id','b5000000-0000-4000-8000-000000000001','batch_id','b6000000-0000-4000-8000-000000000202','quantity',1,'unit_price',1000,'discount',0,'tax',0,'line_total',1000)));
    RAISE NOTICE 'PF_RESULT|%',r.operation_status;
  EXCEPTION WHEN unique_violation THEN
    GET STACKED DIAGNOSTICS c=CONSTRAINT_NAME;
    IF c <> 'uq_sales_pharmacy_checkout_intent' THEN RAISE; END IF;
    RAISE NOTICE 'PF_RESULT|CHECKOUT_CONFLICT constraint=%',c;
  END;
END $body$;
COMMIT;
'@
Run-Pair 'M18-CONC-02' $checkoutA $checkoutB 'COMMITTED' 'CHECKOUT_CONFLICT constraint=uq_sales_pharmacy_checkout_intent' $true

$assertion = Invoke-Psql @'
SELECT
 (SELECT count(*) FROM public.sales WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND checkout_intent_id='bb000000-0000-4000-8000-000000000201') || '|' ||
 (SELECT count(*) FROM public.stock_ledger WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND reference_id='b8000000-0000-4000-8000-000000000201') || '|' ||
 (SELECT count(*) FROM public.sync_nonces WHERE nonce IN ('bc000000-0000-4000-8000-000000000201','bc000000-0000-4000-8000-000000000202')) || '|' ||
 (SELECT count(*) FROM public.sales WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND checkout_intent_id='bb000000-0000-4000-8000-000000000202') || '|' ||
 (SELECT count(*) FROM public.stock_ledger WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND reference_id IN ('b8000000-0000-4000-8000-000000000202','b8000000-0000-4000-8000-000000000203')) || '|' ||
 (SELECT count(*) FROM public.sync_nonces WHERE nonce IN ('bc000000-0000-4000-8000-000000000203','bc000000-0000-4000-8000-000000000204')) || '|' ||
 (SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='b1000000-0000-4000-8000-000000000001' AND client_op_id IN ('ba000000-0000-4000-8000-000000000202','ba000000-0000-4000-8000-000000000203'));
'@
if ($assertion -cne '1|1|2|1|1|1|1') {
  throw "Gate B concurrency invariant mismatch: $assertion"
}
Write-Host 'GATE_B_CONCURRENCY_PASS state=1|1|2|1|1|1|1'
