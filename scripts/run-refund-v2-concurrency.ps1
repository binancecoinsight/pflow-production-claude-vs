param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'acceptance\target-guard.ps1')
. (Join-Path $PSScriptRoot 'acceptance\concurrency-harness.ps1')
$target = Get-AcceptanceTarget
Assert-AcceptanceDockerTarget $target
$container = $target.DbContainer
$fixturePharmacy = '81111111-1111-4111-8111-111111111111'
$fixtureUser = '81333333-3333-4333-8333-333333333333'

function Invoke-DbSql([string]$Sql) {
  $output = & docker exec $container psql -U postgres -d postgres -X -A -t -v ON_ERROR_STOP=1 -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "psql failed: $($output | Out-String)" }
  return ($output | Out-String).Trim()
}
function Invoke-DbFile([string]$Path) {
  Get-Content -Raw -LiteralPath $Path | docker exec -i $container psql -U supabase_admin -d postgres -X -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) { throw "psql fixture setup failed ($LASTEXITCODE)." }
}
function Invoke-AdminSql([string]$Sql) {
  $output = & docker exec $container psql -U supabase_admin -d postgres -X -A -t -v ON_ERROR_STOP=1 -c $Sql 2>&1
  if ($LASTEXITCODE -ne 0) { throw "admin fixture cleanup failed: $($output | Out-String)" }
  return ($output | Out-String).Trim()
}
function Assert-Equal([string]$Name, [string]$Expected, [string]$Sql) {
  $actual = Invoke-DbSql $Sql
  if ($actual -ne $Expected) { throw "$Name expected [$Expected], actual [$actual]" }
  Write-Host "$Name state=$actual"
}
function Run-Pair([string]$Name, [string]$SqlA, [string]$SqlB, [string]$ExpectedA, [string]$ExpectedB, [bool]$AllowSwapped = $false) {
  Invoke-DeterministicConcurrencyPair -Name $Name -Container $container -Database 'postgres' -SqlA $SqlA -SqlB $SqlB -ExpectedA $ExpectedA -ExpectedB $ExpectedB -AllowSwappedOutcomes:$AllowSwapped -InvokeSql { param($query) Invoke-DbSql $query }
}

$p = $fixturePharmacy; $b = '81222222-2222-4222-8222-222222222222'; $u = $fixtureUser; $d = '81444444-4444-4444-8444-444444444444'
function RpcSql([string]$op,[string]$nonce,[string]$hash,[string]$sale,[string]$items,[int]$amount,[string]$reason,[bool]$hold) {
  $sleep = if ($hold) { "SELECT pg_sleep(4);" } else { '' }
  return "BEGIN; SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='12s'; SELECT set_config('request.jwt.claim.role','service_role',true); SELECT 'PF_RESULT|' || operation_status FROM public.rpc_process_sale_return_v2('$u','$p','$b','$d','$op','$nonce','$hash','$sale',$items,$amount,'CASH','$reason'); $sleep COMMIT;"
}
function OutcomeSql([string]$op,[string]$nonce,[string]$hash,[string]$sale,[string]$items,[int]$amount,[string]$reason,[bool]$hold) {
  $sleep = if ($hold) { "PERFORM pg_sleep(4);" } else { '' }
  return "BEGIN; SET LOCAL lock_timeout='8s'; SET LOCAL statement_timeout='12s'; SELECT set_config('request.jwt.claim.role','service_role',true); DO `$`$ DECLARE r record; BEGIN SELECT * INTO r FROM public.rpc_process_sale_return_v2('$u','$p','$b','$d','$op','$nonce','$hash','$sale',$items,$amount,'CASH','$reason'); RAISE NOTICE 'PF_RESULT|%', r.operation_status; $sleep EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PF_RESULT|SQLSTATE=%', SQLSTATE; END `$`$; COMMIT;"
}
function Cleanup-Fixture {
  $sql = "DO `$`$ DECLARE p uuid := '$fixturePharmacy'; u uuid := '$fixtureUser'; n text; e text; BEGIN SELECT name INTO n FROM public.pharmacies WHERE id=p; IF n IS NOT NULL AND n <> 'Refund V2 concurrency harness' THEN RAISE EXCEPTION 'refusing cleanup unexpected pharmacy'; END IF; PERFORM set_config('session_replication_role','replica',true); DELETE FROM public.sale_return_line_allocations WHERE pharmacy_id=p; DELETE FROM public.return_items WHERE pharmacy_id=p; DELETE FROM public.stock_ledger WHERE pharmacy_id=p; DELETE FROM public.sale_returns WHERE pharmacy_id=p; DELETE FROM public.sync_journal WHERE pharmacy_id=p; DELETE FROM public.sync_nonces WHERE pharmacy_id=p; DELETE FROM public.audit_logs WHERE pharmacy_id=p; DELETE FROM public.sale_items WHERE pharmacy_id=p; DELETE FROM public.sales WHERE pharmacy_id=p; DELETE FROM public.inventory_batches WHERE pharmacy_id=p; DELETE FROM public.products WHERE pharmacy_id=p; DELETE FROM public.devices WHERE pharmacy_id=p; DELETE FROM public.pharmacy_members WHERE pharmacy_id=p; DELETE FROM public.branches WHERE pharmacy_id=p; DELETE FROM public.pharmacies WHERE id=p; SELECT email INTO e FROM auth.users WHERE id=u; IF e IS NOT NULL AND e <> 'refund-v2-concurrency@test.local' THEN RAISE EXCEPTION 'refusing cleanup unexpected user'; END IF; IF e IS NOT NULL THEN DELETE FROM auth.users WHERE id=u; END IF; END `$`$;"
  Invoke-AdminSql $sql | Out-Null
  Assert-Equal 'cleanup' '0|0' "SELECT (SELECT count(*) FROM public.pharmacies WHERE id='$fixturePharmacy') || '|' || (SELECT count(*) FROM auth.users WHERE id='$fixtureUser');"
}

try {
  Invoke-DbFile (Join-Path $PSScriptRoot 'refund-v2-concurrency-setup.sql')

  # CONC-001: same operation/hash, distinct nonces. B waits on A's journal lock then replays.
  $items1 = "jsonb_build_array(jsonb_build_object('sale_item_id','81888888-8888-4888-8888-888888888701','quantity',1))"
  Run-Pair 'CONC-001' (RpcSql '81999999-9999-4999-8999-999999999701' '81aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' (('a'*64)) '81777777-7777-4777-8777-777777777701' $items1 100 'same-op-a' $true) (RpcSql '81999999-9999-4999-8999-999999999701' '81aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02' (('a'*64)) '81777777-7777-4777-8777-777777777701' $items1 100 'same-op-b' $false) 'COMMITTED' 'ALREADY_COMMITTED' $true
  Assert-Equal 'CONC-001' '1|1|1|2|11|100' "SELECT (SELECT count(*) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777701') || '|' || (SELECT count(*) FROM public.stock_ledger sl JOIN public.sale_returns sr ON sr.id=sl.reference_id WHERE sr.original_sale_id='81777777-7777-4777-8777-777777777701') || '|' || (SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='$p' AND client_op_id='81999999-9999-4999-8999-999999999701') || '|' || (SELECT count(*) FROM public.sync_nonces WHERE nonce IN ('81aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01','81aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02')) || '|' || (SELECT quantity FROM public.inventory_batches WHERE id='81666666-6666-4666-8666-666666666701') || '|' || COALESCE((SELECT sum(refund_amount_minor) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777701'),0);"

  # CONC-002: both request the only unit; exactly one can commit.
  $items2 = "jsonb_build_array(jsonb_build_object('sale_item_id','81888888-8888-4888-8888-888888888702','quantity',1))"
  Run-Pair 'CONC-002' (OutcomeSql '81999999-9999-4999-8999-999999999702' '82aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' (('b'*64)) '81777777-7777-4777-8777-777777777702' $items2 100 'over-a' $true) (OutcomeSql '82999999-9999-4999-8999-999999999702' '82aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02' (('c'*64)) '81777777-7777-4777-8777-777777777702' $items2 100 'over-b' $false) 'COMMITTED' 'SQLSTATE=23514' $true
  Assert-Equal 'CONC-002' '1|1|1|1|11|100' "SELECT (SELECT count(*) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777702') || '|' || (SELECT count(*) FROM public.stock_ledger sl JOIN public.sale_returns sr ON sr.id=sl.reference_id WHERE sr.original_sale_id='81777777-7777-4777-8777-777777777702') || '|' || (SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='$p' AND client_op_id IN ('81999999-9999-4999-8999-999999999702','82999999-9999-4999-8999-999999999702')) || '|' || (SELECT count(*) FROM public.sync_nonces WHERE nonce IN ('82aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01','82aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02')) || '|' || (SELECT quantity FROM public.inventory_batches WHERE id='81666666-6666-4666-8666-666666666702') || '|' || COALESCE((SELECT sum(refund_amount_minor) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777702'),0);"

  # CONC-003: two different one-unit refunds of a two-unit sale both commit.
  $items3 = "jsonb_build_array(jsonb_build_object('sale_item_id','81888888-8888-4888-8888-888888888703','quantity',1))"
  Run-Pair 'CONC-003' (RpcSql '81999999-9999-4999-8999-999999999703' '83aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' (('d'*64)) '81777777-7777-4777-8777-777777777703' $items3 100 'partial-a' $true) (RpcSql '83999999-9999-4999-8999-999999999703' '83aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02' (('e'*64)) '81777777-7777-4777-8777-777777777703' $items3 100 'partial-b' $false) 'COMMITTED' 'COMMITTED'
  Assert-Equal 'CONC-003' '2|2|2|2|12|200' "SELECT (SELECT count(*) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777703') || '|' || (SELECT count(*) FROM public.stock_ledger sl JOIN public.sale_returns sr ON sr.id=sl.reference_id WHERE sr.original_sale_id='81777777-7777-4777-8777-777777777703') || '|' || (SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='$p' AND client_op_id IN ('81999999-9999-4999-8999-999999999703','83999999-9999-4999-8999-999999999703')) || '|' || (SELECT count(*) FROM public.sync_nonces WHERE nonce IN ('83aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01','83aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa02')) || '|' || (SELECT quantity FROM public.inventory_batches WHERE id='81666666-6666-4666-8666-666666666703') || '|' || COALESCE((SELECT sum(refund_amount_minor) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777703'),0);"

  # CONC-004: three independent repeated schedules with reversed JSON item order.
  $deadlockSchedules = @(
    @{ Sale='81777777-7777-4777-8777-777777777704'; ItemA='81888888-8888-4888-8888-888888888704'; ItemB='81888888-8888-4888-8888-888888888705'; OpA='84999999-9999-4999-8999-999999999704'; NonceA='84aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04'; OpB='85999999-9999-4999-8999-999999999704'; NonceB='85aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa04' },
    @{ Sale='81777777-7777-4777-8777-777777777705'; ItemA='81888888-8888-4888-8888-888888888706'; ItemB='81888888-8888-4888-8888-888888888707'; OpA='84999999-9999-4999-8999-999999999705'; NonceA='84aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05'; OpB='85999999-9999-4999-8999-999999999705'; NonceB='85aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa05' },
    @{ Sale='81777777-7777-4777-8777-777777777706'; ItemA='81888888-8888-4888-8888-888888888708'; ItemB='81888888-8888-4888-8888-888888888709'; OpA='84999999-9999-4999-8999-999999999706'; NonceA='84aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06'; OpB='85999999-9999-4999-8999-999999999706'; NonceB='85aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa06' }
  )
  foreach ($schedule in $deadlockSchedules) {
    $ia = $schedule.ItemA; $ib = $schedule.ItemB; $sale = $schedule.Sale
    $itemsForward = "jsonb_build_array(jsonb_build_object('sale_item_id','$ia','quantity',1),jsonb_build_object('sale_item_id','$ib','quantity',1))"
    $itemsReverse = "jsonb_build_array(jsonb_build_object('sale_item_id','$ib','quantity',1),jsonb_build_object('sale_item_id','$ia','quantity',1))"
    Run-Pair "CONC-004-$($sale.Substring($sale.Length-3))" (OutcomeSql $schedule.OpA $schedule.NonceA (('5'*64)) $sale $itemsForward 200 'deadlock-a' $true) (OutcomeSql $schedule.OpB $schedule.NonceB (('6'*64)) $sale $itemsReverse 200 'deadlock-b' $false) 'COMMITTED' 'SQLSTATE=23514' $true
  }
  Assert-Equal 'CONC-004' '3|6|600|3' "SELECT (SELECT count(*) FROM public.sale_returns WHERE original_sale_id IN ('81777777-7777-4777-8777-777777777704','81777777-7777-4777-8777-777777777705','81777777-7777-4777-8777-777777777706')) || '|' || (SELECT count(*) FROM public.stock_ledger sl JOIN public.sale_returns sr ON sr.id=sl.reference_id WHERE sr.original_sale_id IN ('81777777-7777-4777-8777-777777777704','81777777-7777-4777-8777-777777777705','81777777-7777-4777-8777-777777777706')) || '|' || COALESCE((SELECT sum(refund_amount_minor) FROM public.sale_returns WHERE original_sale_id IN ('81777777-7777-4777-8777-777777777704','81777777-7777-4777-8777-777777777705','81777777-7777-4777-8777-777777777706')),0) || '|' || (SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='$p' AND client_op_id IN ('84999999-9999-4999-8999-999999999704','85999999-9999-4999-8999-999999999704','84999999-9999-4999-8999-999999999705','85999999-9999-4999-8999-999999999705','84999999-9999-4999-8999-999999999706','85999999-9999-4999-8999-999999999706'));"

  # CONC-005: rollback an otherwise valid call, then retry it with a fresh operation.
  $items5 = "jsonb_build_array(jsonb_build_object('sale_item_id','81888888-8888-4888-8888-888888888710','quantity',1))"
  Invoke-DbSql ((RpcSql '86999999-9999-4999-8999-999999999707' '86aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' (('7'*64)) '81777777-7777-4777-8777-777777777707' $items5 100 'rollback' $false) -replace 'COMMIT;','ROLLBACK;') | Out-Null
  Assert-Equal 'CONC-005 rollback' '0|0|0|0|10' "SELECT (SELECT count(*) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777707') || '|' || (SELECT count(*) FROM public.stock_ledger sl JOIN public.sale_returns sr ON sr.id=sl.reference_id WHERE sr.original_sale_id='81777777-7777-4777-8777-777777777707') || '|' || (SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='$p' AND client_op_id='86999999-9999-4999-8999-999999999707') || '|' || (SELECT count(*) FROM public.sync_nonces WHERE nonce='86aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') || '|' || (SELECT quantity FROM public.inventory_batches WHERE id='81666666-6666-4666-8666-666666666710');"
  Invoke-DbSql (RpcSql '87999999-9999-4999-8999-999999999707' '87aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01' (('8'*64)) '81777777-7777-4777-8777-777777777707' $items5 100 'retry' $false) | Out-Null
  Assert-Equal 'CONC-005 retry' '1|1|1|1|11|100' "SELECT (SELECT count(*) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777707') || '|' || (SELECT count(*) FROM public.stock_ledger sl JOIN public.sale_returns sr ON sr.id=sl.reference_id WHERE sr.original_sale_id='81777777-7777-4777-8777-777777777707') || '|' || (SELECT count(*) FROM public.sync_journal WHERE pharmacy_id='$p' AND client_op_id='87999999-9999-4999-8999-999999999707') || '|' || (SELECT count(*) FROM public.sync_nonces WHERE nonce='87aaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa01') || '|' || (SELECT quantity FROM public.inventory_batches WHERE id='81666666-6666-4666-8666-666666666710') || '|' || COALESCE((SELECT sum(refund_amount_minor) FROM public.sale_returns WHERE original_sale_id='81777777-7777-4777-8777-777777777707'),0);"
  Write-Host 'CONCURRENCY PASS: CONC-001..005; separate sessions used for CONC-001..004; CONC-004 iterations=3.'
}
finally {
  Cleanup-Fixture
}
