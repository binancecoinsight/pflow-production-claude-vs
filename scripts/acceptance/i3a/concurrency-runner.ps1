param(
  [Parameter(Mandatory)][string]$AuthorizationFile,
  [Parameter(Mandatory)][string]$PackageManifest,
  [Parameter(Mandatory)][ValidateSet('OPERATION_COLLISION_PENDING_FIRST','OPERATION_COLLISION_COMPLETED_FIRST','DURABLE_PENDING_RECOVERY','RESERVATION_REVOCATION','CONSUMPTION_REVOCATION')][string]$CaseId
)
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'preflight.ps1')
. (Join-Path $PSScriptRoot 'evidence.ps1')
. (Join-Path $PSScriptRoot 'process-output.ps1')
. (Join-Path $PSScriptRoot 'scenarios.ps1')
$approved=Assert-I3aPreflight -AuthorizationFile $AuthorizationFile -Command 'postgres-concurrency' -PackageManifest $PackageManifest
$authorization=$approved.Authorization
$barrierNonce=[Guid]::NewGuid().ToString('D')
$scenario=Get-I3aScenario $CaseId $barrierNonce $authorization.authorizationId
$appA="pf_i3a:$($authorization.runId):$CaseId:A"; $appB="pf_i3a:$($authorization.runId):$CaseId:B"
$jobA=$null; $jobB=$null; $cancelDisposition='NOT_REQUIRED'
$ambient=@('PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGAPPNAME','PGPASSWORD','PGCHANNELBINDING','PGTARGETSESSIONATTRS')
$saved=@{}; foreach($name in $ambient){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process');[Environment]::SetEnvironmentVariable($name,$null,'Process')}
[Environment]::SetEnvironmentVariable('PGPASSFILE',$approved.CredentialPath,'Process');[Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT','5','Process');[Environment]::SetEnvironmentVariable('PGSSLMODE','disable','Process')

function Invoke-I3aSql([string]$Sql,[bool]$AllowEmpty=$false) {
  $bounded="SET statement_timeout='5s';SET lock_timeout='2s';SET idle_in_transaction_session_timeout='10s';$Sql"
  $stderrPath=Join-Path ([IO.Path]::GetTempPath()) ("pf-i3a-$([Guid]::NewGuid().ToString('N')).stderr")
  try{$stdout=$bounded | & $approved.PsqlPath -X --no-password -h '127.0.0.1' -p '57322' -d 'postgres' -U 'postgres' -q -A -t -v ON_ERROR_STOP=1 `
    -v "pf_target_id=$($authorization.target.projectId)" -v "pf_target_marker=$($authorization.target.marker)" `
    -v "pf_system_identifier=$($authorization.target.systemIdentifier)" -v "pf_database_oid=$($authorization.target.databaseOid)" `
    -v "pf_run_id=$($authorization.runId)" -v "pf_execution_authorization_id=$($authorization.authorizationId)" `
    -v "pf_fixture_digest=$($authorization.fixturesDigest)" -v 'pf_environment_destruction=false' 2> $stderrPath;$exit=$LASTEXITCODE;$stderr=if(Test-Path $stderrPath){Get-Content -Raw $stderrPath}else{''};if($exit -ne 0){throw "coordinator SQL failed: $(ConvertTo-I3aSanitizedText $stderr)"};$lines=@(($stdout|Out-String).Trim() -split "`r?`n"|Where-Object{$_.Length -gt 0});if($lines.Count -eq 0 -and $AllowEmpty){return ''};if($lines.Count -ne 1){throw 'coordinator query requires exactly one scalar result'};return $lines[0]}finally{Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue}
}
function Invoke-I3aProofFile([string]$Path) {
  $stderrPath=Join-Path ([IO.Path]::GetTempPath()) ("pf-i3a-$([Guid]::NewGuid().ToString('N')).stderr")
  try{$stdout=& $approved.PsqlPath -X --no-password -h '127.0.0.1' -p '57322' -d 'postgres' -U 'postgres' -q -A -t -v ON_ERROR_STOP=1 -f $Path 2> $stderrPath;$stderr=if(Test-Path $stderrPath){Get-Content -Raw $stderrPath}else{''};return [pscustomobject]@{ExitCode=$LASTEXITCODE;Stdout=($stdout|Out-String).Trim();Stderr=$stderr}}finally{Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue}
}
function Get-GuardedSql([string]$Body) {
  $guard=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'sql\00_guard.sql')
  return "$guard`n$Body"
}
$sessionBlock={
 param($Psql,$Credential,$Application,$Sql,$Target,$SystemIdentifier,$DatabaseOid,$AuthorizationId,$FixtureDigest)
 $env:PGPASSFILE=$Credential;$env:PGCONNECT_TIMEOUT='5';$env:PGSSLMODE='disable'
  $stderrPath=Join-Path ([IO.Path]::GetTempPath()) ("pf-i3a-$([Guid]::NewGuid().ToString('N')).stderr")
  $stdout=$Sql | & $Psql -X --no-password -h '127.0.0.1' -p '57322' -d 'postgres' -U 'postgres' -q -A -t -v ON_ERROR_STOP=1 `
   -v "pf_target_id=$Target" -v "pf_target_marker=$Target" -v "pf_system_identifier=$SystemIdentifier" -v "pf_database_oid=$DatabaseOid" `
   -v 'pf_run_id=I3A-20261026-001' -v "pf_execution_authorization_id=$AuthorizationId" -v "pf_fixture_digest=$FixtureDigest" -v 'pf_environment_destruction=false' 2> $stderrPath
  $exit=$LASTEXITCODE;$stderr=if(Test-Path $stderrPath){Get-Content -Raw $stderrPath}else{''};Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
  [pscustomobject]@{ExitCode=$exit;Stdout=($stdout|Out-String).Trim();Stderr=$stderr;ApplicationName=$Application}
}
try {
  $proofStreams=Invoke-I3aProofFile (Join-Path $PSScriptRoot 'sql\01_target_proof.sql');$proof=(ConvertFrom-I3aProcessOutput $proofStreams.ExitCode $proofStreams.Stdout $proofStreams.Stderr 'target-proof').Envelope.payload
  if($proof.marker -cne $authorization.target.marker -or $proof.database -cne 'postgres' -or $proof.server_addr -cne '127.0.0.1' -or [int]$proof.server_port -ne 57322 -or [string]$proof.system_identifier -cne [string]$authorization.target.systemIdentifier -or [int]$proof.database_oid -ne [int]$authorization.target.databaseOid -or $proof.session_user -cne 'postgres'){throw 'target identity proof mismatch before concurrency access'}
  $stale=Invoke-I3aSql "SET statement_timeout='5s'; SELECT count(*) FROM public.pf_i3a_concurrency_evidence WHERE run_id='I3A-20261026-001' AND case_id='$CaseId';"
  if($stale -cne '0'){throw 'stale concurrency evidence exists; refusing reuse'}
  if($scenario.ExecutionClassification -cne 'RPC_PRODUCTION_LOCK'){throw 'scenario is not classified for production RPC lock execution'}
  if($scenario.SetupSql){Invoke-I3aSql (Get-GuardedSql $scenario.SetupSql) $true|Out-Null}
  $argsA=@($approved.PsqlPath,$approved.CredentialPath,$appA,(Get-GuardedSql "SET application_name='$appA'; $($scenario.A)"),$authorization.target.projectId,$authorization.target.systemIdentifier,$authorization.target.databaseOid,$authorization.authorizationId,$authorization.fixturesDigest)
  $argsB=@($approved.PsqlPath,$approved.CredentialPath,$appB,(Get-GuardedSql "SET application_name='$appB'; $($scenario.B)"),$authorization.target.projectId,$authorization.target.systemIdentifier,$authorization.target.databaseOid,$authorization.authorizationId,$authorization.fixturesDigest)
  $jobA=Start-Job -ScriptBlock $sessionBlock -ArgumentList $argsA; $jobB=Start-Job -ScriptBlock $sessionBlock -ArgumentList $argsB
  $readyDeadline=[DateTimeOffset]::UtcNow.AddSeconds(10);$ready=''
  do{$ready=Invoke-I3aSql "SELECT count(*)||'|'||count(DISTINCT backend_pid)||'|'||count(DISTINCT application_name) FROM public.pf_i3a_concurrency_evidence WHERE run_id='I3A-20261026-001' AND case_id='$CaseId' AND authorization_id='$($authorization.authorizationId.Replace("'","''"))' AND barrier_nonce='$barrierNonce' AND readiness_committed;";if($ready -ceq '2|2|2'){break};Start-Sleep -Milliseconds 50}while([DateTimeOffset]::UtcNow -lt $readyDeadline)
  if($ready -cne '2|2|2'){throw 'committed readiness from two distinct bound backends was not proven'}
  $backendBinding=Invoke-I3aSql "SELECT count(*) FROM public.pf_i3a_concurrency_evidence e JOIN pg_stat_activity a ON a.pid=e.backend_pid AND a.application_name=e.application_name WHERE e.run_id='I3A-20261026-001' AND e.case_id='$CaseId' AND e.barrier_nonce='$barrierNonce' AND e.application_name IN ('$appA','$appB');"
  if($backendBinding -cne '2'){throw 'backend/application binding is unproven'}
  Invoke-I3aSql "UPDATE public.pf_i3a_concurrency_evidence SET released=true WHERE run_id='I3A-20261026-001' AND case_id='$CaseId' AND session_name='A' AND barrier_nonce='$barrierNonce' RETURNING 'A_RELEASED';" | Out-Null
  $expectedLock=Invoke-I3aSql "SELECT (($($scenario.LockKeySql))>>32)::int::oid||'|'||(($($scenario.LockKeySql))::int)::oid;"
  if($expectedLock -cnotmatch '^(\d+)\|(\d+)$'){throw 'application lock identity could not be derived'};$lockClass=$Matches[1];$lockObject=$Matches[2]
  $grantDeadline=[DateTimeOffset]::UtcNow.AddSeconds(8);$granted=''
  do{$granted=Invoke-I3aSql "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='$appA' AND l.locktype='advisory' AND l.granted AND l.classid=${lockClass}::oid AND l.objid=${lockObject}::oid AND l.objsubid=1;";if($granted -ceq '1'){break};Start-Sleep -Milliseconds 50}while([DateTimeOffset]::UtcNow -lt $grantDeadline)
  if($granted -cne '1'){throw 'blocker did not acquire the actual application advisory lock'}
  Invoke-I3aSql "UPDATE public.pf_i3a_concurrency_evidence SET released=true WHERE run_id='I3A-20261026-001' AND case_id='$CaseId' AND session_name='B' AND barrier_nonce='$barrierNonce' RETURNING 'B_RELEASED';" | Out-Null
  $lockDeadline=[DateTimeOffset]::UtcNow.AddSeconds(8);$lockProof='';$lockPattern="^\d+\|\d+\|$lockClass\|$lockObject$"
  do{
   $lockProof=Invoke-I3aSql "SELECT b.pid||'|'||w.pid||'|'||wl.classid||'|'||wl.objid FROM pg_stat_activity w CROSS JOIN LATERAL unnest(pg_blocking_pids(w.pid)) bp(pid) JOIN pg_stat_activity b ON b.pid=bp.pid JOIN pg_locks wl ON wl.pid=w.pid AND NOT wl.granted AND wl.locktype='advisory' JOIN pg_locks bl ON bl.pid=b.pid AND bl.granted AND bl.locktype='advisory' AND bl.classid=wl.classid AND bl.objid=wl.objid AND bl.objsubid=wl.objsubid WHERE w.application_name='$appB' AND b.application_name='$appA' AND wl.classid=${lockClass}::oid AND wl.objid=${lockObject}::oid AND wl.objsubid=1;"
   if($lockProof -match $lockPattern){break};Start-Sleep -Milliseconds 50
  }while([DateTimeOffset]::UtcNow -lt $lockDeadline)
  if($lockProof -notmatch "^(\d+)\|(\d+)\|$lockClass\|$lockObject$"){throw 'exact application advisory lock blocker/waiter relationship was not observed'}
  $blocker=[int]$Matches[1];$waiter=[int]$Matches[2]
  Invoke-I3aSql "UPDATE public.pf_i3a_concurrency_evidence SET coordinator_observed_at=clock_timestamp(),observed_blocker_pid=$blocker,observed_waiter_pid=$waiter WHERE run_id='I3A-20261026-001' AND case_id='$CaseId' AND barrier_nonce='$barrierNonce';" | Out-Null
  $done=@(Wait-Job $jobA,$jobB -Timeout 30);if($done.Count -ne 2){throw 'bounded concurrency completion timeout'}
  $results=@($jobA,$jobB|Receive-Job);$outcomes=@();foreach($result in $results){$parsed=ConvertFrom-I3aProcessOutput $result.ExitCode $result.Stdout $result.Stderr 'concurrency-session';$payload=$parsed.Envelope.payload;if($payload.case -cne $CaseId){throw 'case-bound result mismatch'};$outcomes+=[string]$payload.outcome;if([int]$payload.effect_count -ne [int]$scenario.ExpectedEffectCount){throw 'backend authoritative count mismatch'}}
  if((@($outcomes|Sort-Object)-join '|') -cne (@($scenario.ExpectedOutcomes|Sort-Object)-join '|')){throw 'exact outcome set mismatch'}
  if([int](Invoke-I3aSql $scenario.FinalCountSql) -ne [int]$scenario.ExpectedEffectCount){throw 'final authoritative effect count mismatch'}
  $overlap=Invoke-I3aSql "SELECT count(*)||'|'||count(DISTINCT backend_pid)||'|'||(max(entered_critical_at)<min(left_critical_at))||'|'||bool_and(coordinator_observed_at IS NOT NULL)||'|'||min(observed_blocker_pid)||'|'||min(observed_waiter_pid) FROM public.pf_i3a_concurrency_evidence WHERE run_id='I3A-20261026-001' AND case_id='$CaseId' AND barrier_nonce='$barrierNonce';"
  if($overlap -cnotmatch "^2\|2\|t\|t\|$blocker\|$waiter$"){throw 'overlap/backend/coordinator proof mismatch'}
  Write-I3aEvidence $authorization.evidenceRoot $authorization.runId 'postgres-concurrency' 'EXECUTED_UNREVIEWED' @{case=$CaseId;barrier=$barrierNonce;lock="application-advisory:${lockClass}:${lockObject}";blocker=$blocker;waiter=$waiter;outcomes=$outcomes;effectCount=$scenario.ExpectedEffectCount;cancellation='NOT_REQUIRED'}
} catch {
  $safe=ConvertTo-I3aSanitizedText $_.Exception.Message
  try{
   $pids=Invoke-I3aSql "SELECT COALESCE(string_agg(backend_pid::text,','),'') FROM public.pf_i3a_concurrency_evidence WHERE run_id='I3A-20261026-001' AND case_id='$CaseId' AND barrier_nonce='$barrierNonce';"
   if($pids -match '^\d+(,\d+)?$'){Invoke-I3aSql "SELECT bool_and(pg_cancel_backend(pid)) FROM pg_stat_activity WHERE pid=ANY(string_to_array('$pids',',')::int[]) AND application_name IN ('$appA','$appB');"|Out-Null;$deadline=[DateTimeOffset]::UtcNow.AddSeconds(5);do{$remaining=Invoke-I3aSql "SELECT count(*) FROM pg_stat_activity WHERE pid=ANY(string_to_array('$pids',',')::int[]) AND application_name IN ('$appA','$appB');";if($remaining -ceq '0'){break};Start-Sleep -Milliseconds 50}while([DateTimeOffset]::UtcNow -lt $deadline);$noLock=Invoke-I3aSql "SELECT count(*) FROM pg_locks WHERE pid=ANY(string_to_array('$pids',',')::int[]) AND locktype='advisory';";$rolled=Invoke-I3aSql $scenario.RollbackProofSql;if($remaining -ceq '0' -and $noLock -ceq '0' -and $rolled -ceq 't'){$cancelDisposition='VERIFIED_ROLLBACK';Invoke-I3aSql "UPDATE public.pf_i3a_concurrency_evidence SET cancelled=true,rollback_verified=true WHERE run_id='I3A-20261026-001' AND case_id='$CaseId' AND barrier_nonce='$barrierNonce' RETURNING 'ROLLBACK_VERIFIED';"|Out-Null}else{$cancelDisposition='UNVERIFIED_PARTIAL_EVIDENCE'}}
  }catch{$cancelDisposition='UNVERIFIED_CANCELLATION'}
  Write-I3aEvidence $authorization.evidenceRoot $authorization.runId 'postgres-concurrency' 'ABORTED_NOT_PASS' @{case=$CaseId;error=$safe;cancellation=$cancelDisposition}
  throw "$safe; cancellation=$cancelDisposition"
} finally {
  if($jobA){$jobA|Stop-Job -ErrorAction SilentlyContinue;$jobA|Remove-Job -Force -ErrorAction SilentlyContinue};if($jobB){$jobB|Stop-Job -ErrorAction SilentlyContinue;$jobB|Remove-Job -Force -ErrorAction SilentlyContinue}
  [Environment]::SetEnvironmentVariable('PGPASSFILE',$null,'Process');[Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT',$null,'Process');[Environment]::SetEnvironmentVariable('PGSSLMODE',$null,'Process');foreach($name in $ambient){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
}
