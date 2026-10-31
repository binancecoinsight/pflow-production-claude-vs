param([Parameter(Mandatory)]$Preflight,[Parameter(Mandatory)][string]$Evidence,[scriptblock]$WorkerProcessFactory,[scriptblock]$PollDelay,[int]$ReadyTimeoutMilliseconds=15000,[int]$CompletionTimeoutMilliseconds=20000)
Set-StrictMode -Version Latest;. (Join-Path $PSScriptRoot 'runner-lib.ps1')
if(-not ('PfRunningProcess' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'BoundedProcess.cs')}
$a=$Preflight.Authorization;$sql=Join-Path $PSScriptRoot 'sql';$cancel=Join-Path (Split-Path $Evidence -Parent) 'CANCEL';$environmentMap=@{PGPASSFILE=$Preflight.Credential;PGCONNECT_TIMEOUT='5';PGSSLMODE=$a.target.sslMode};$environmentDictionary=ConvertTo-PfMvp10EnvironmentDictionary $environmentMap;$workers=@();$workerOnePid=$null;$workerTwoPid=$null
function New-ArgumentVector([string]$sqlFile,[string[]]$additionalArguments=@()) {return @('-X','--no-password','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',$a.target.host,'-p',[string]$a.target.port,'-d',$a.target.database,'-U',$a.target.user,'-v',"pf_target_marker=$($a.target.marker)",'-v',"pf_system_identifier=$($a.target.systemIdentifier)",'-v',"pf_database_oid=$($a.target.databaseOid)",'-v',"pf_authorization_id=$($a.authorizationId)")+$additionalArguments+@('-f',$sqlFile)}
function Invoke-Sync([string]$sqlFile,[string]$expectedPattern,[string[]]$additionalArguments=@(),[int]$seconds=30,[bool]$accountAfterCancellation=$false){$cancellationPath=if($accountAfterCancellation){Join-Path $Evidence '.accounting-cancel'}else{$cancel};return Invoke-PfMvp10Psql $Preflight.Psql (New-ArgumentVector $sqlFile $additionalArguments) $environmentDictionary $cancellationPath ($seconds*1000) $expectedPattern (Join-Path $Evidence ([IO.Path]::GetFileName($sqlFile))) }
function Invoke-PollDelay {if($PollDelay){& $PollDelay}else{Start-Sleep -Milliseconds 100}}
function Start-Worker([string]$sqlFile){if(Test-Path $cancel){throw 'concurrency cancelled'};$arguments=New-ArgumentVector $sqlFile;$processHandle=if($WorkerProcessFactory){& $WorkerProcessFactory $sqlFile $Preflight.Psql $arguments $environmentDictionary}else{[PfRunningProcess]::Start($Preflight.Psql,$arguments,$environmentDictionary,65536)};if($null -eq $processHandle){throw 'concurrency worker factory returned no process'};$script:workers+=$processHandle;return $processHandle}
function Wait-Ready($worker,[string]$name){$clock=[Diagnostics.Stopwatch]::StartNew();while($clock.ElapsedMilliseconds -lt $ReadyTimeoutMilliseconds){if(Test-Path $cancel){throw 'concurrency cancelled'};if($worker.Overflow){throw 'concurrency output overflow'};if($worker.StdOut -match "PF_EVENT\|1\|$name\|READY\|backend=([0-9]+)"){return [int]$Matches[1]};if($worker.HasExited){throw "concurrency $name exited before readiness"};Invoke-PollDelay};throw "concurrency $name readiness timeout"}
function Wait-Accounted($worker){$clock=[Diagnostics.Stopwatch]::StartNew();while(-not $worker.HasExited -and $clock.ElapsedMilliseconds -lt $CompletionTimeoutMilliseconds){if(Test-Path $cancel){throw 'concurrency cancelled'};Invoke-PollDelay};if(-not $worker.HasExited){throw 'concurrency worker completion timeout'}}
try {
 Invoke-Sync (Join-Path $sql '00_runtime_compatibility.sql') (Get-PfMvp10RuntimeFramePattern)|Out-Null
 Invoke-Sync (Join-Path $sql '02_package_state.sql') '^PF_PASS\|package-state\|000039$'|Out-Null
 Invoke-Sync (Join-Path $sql '30_concurrency_setup.sql') '^PF_PASS\|concurrency-setup$'|Out-Null
 $one=Start-Worker (Join-Path $sql '31_concurrency_worker.sql');$workerOnePid=Wait-Ready $one 'worker-one'
 $two=Start-Worker (Join-Path $sql '31_concurrency_worker_two.sql');$workerTwoPid=Wait-Ready $two 'worker-two'
 if($workerOnePid -eq $workerTwoPid){throw 'concurrency backend identities are not distinct'}
 $blockerFrame=Invoke-Sync (Join-Path $sql '32_concurrency_verify.sql') '^PF_EVENT\|1\|coordinator\|BLOCKER\|waiting=[0-9]+;blocking=[0-9]+$' @('-v',"pf_worker_one_pid=$workerOnePid",'-v',"pf_worker_two_pid=$workerTwoPid");Assert-PfMvp10BlockerEvent $blockerFrame $workerTwoPid $workerOnePid
 Wait-Accounted $one;Wait-Accounted $two
 if((Complete-PfMvp10WorkerEvidence ([pscustomobject]@{ExitCode=$one.ExitCode;StdOut=$one.StdOut;StdErr=$one.StdErr;TimedOut=$false;Cancelled=$false;Overflow=$one.Overflow;AllStopped=$one.HasExited}) 'worker-one' 'COMPLETED' (Join-Path $Evidence 'worker-one') (Join-Path $sql '31_concurrency_worker.sql')) -ne $workerOnePid){throw 'worker-one backend transcript changed'}
 if((Complete-PfMvp10WorkerEvidence ([pscustomobject]@{ExitCode=$two.ExitCode;StdOut=$two.StdOut;StdErr=$two.StdErr;TimedOut=$false;Cancelled=$false;Overflow=$two.Overflow;AllStopped=$two.HasExited}) 'worker-two' 'CONFLICT' (Join-Path $Evidence 'worker-two') (Join-Path $sql '31_concurrency_worker_two.sql')) -ne $workerTwoPid){throw 'worker-two backend transcript changed'}
 Invoke-Sync (Join-Path $sql '33_concurrency_verify.sql') '^PF_COUNT\|concurrency\|purchase=1\|item=1\|stock=5\|ledger=1\|audit=1\|evidence=1$'|Out-Null
 [pscustomobject]@{Success=$true;Frame='PF_PASS|bounded-concurrency|distinct-backends=2|production-blocker=proven'}
} catch {
 $original=$_
 foreach($worker in $workers){$worker.Stop()};$onePid=if($workerOnePid){$workerOnePid}else{0};$twoPid=if($workerTwoPid){$workerTwoPid}else{0}
 try{Invoke-Sync (Join-Path $sql '34_concurrency_abort_verify.sql') '^PF_PASS\|concurrency-abort-workers-stopped-state-coherent$' @('-v',"pf_worker_one_pid=$onePid",'-v',"pf_worker_two_pid=$twoPid") 30 $true|Out-Null}catch{throw 'concurrency failed and rollback evidence could not be established'}
 throw $original
} finally {foreach($worker in $workers){$worker.Stop();$worker.Dispose()}}
