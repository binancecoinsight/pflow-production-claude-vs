Set-StrictMode -Version Latest;$ErrorActionPreference='Stop';. (Join-Path $PSScriptRoot 'runner-lib.ps1')
if(-not ('PfProcessBridge' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'BoundedProcess.cs')}
$root=Join-Path ([IO.Path]::GetTempPath()) ('pf-mvp10-runner-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($root)|Out-Null
$approvedSql=Join-Path $PSScriptRoot 'sql/00_runtime_compatibility.sql'
function New-Fake([hashtable]$values){$data=[ordered]@{ExitCode=0;StdOut='PF_PASS|synthetic';StdErr='';TimedOut=$false;Cancelled=$false;Overflow=$false;AllStopped=$true};foreach($key in $values.Keys){$data[$key]=$values[$key]};$fake=[PfProcessResult]::new();foreach($key in $data.Keys){$fake.$key=$data[$key]};return $fake}
$spy=[PfSpyProcessAdapter]::new();[PfProcessBridge]::Adapter=$spy
function Invoke-Spy($fake,[string]$pattern,[bool]$reject=$false){$spy.Results.Enqueue($fake);$base=Join-Path $root ([guid]::NewGuid().ToString('N'));if($reject){$failed=$false;try{Invoke-PfMvp10Psql 'C:\Program Files\PostgreSQL 17\bin\psql.exe' @('-X','value with spaces','-f',$approvedSql) @{PGPASSFILE='C:\credential path\pgpass';PGSSLMODE='require'} (Join-Path $root 'CANCEL') 1000 '^PF_PASS\|synthetic$' $base|Out-Null}catch{$failed=$_.Exception.Message -match $pattern};if(-not $failed){throw "expected rejection: $pattern"};return};return Invoke-PfMvp10Psql 'C:\Program Files\PostgreSQL 17\bin\psql.exe' @('-X','value with spaces','-f',$approvedSql) @{PGPASSFILE='C:\credential path\pgpass';PGSSLMODE='require'} (Join-Path $root 'CANCEL') 1000 '^PF_PASS\|synthetic$' $base}
try {
 $frame=Invoke-Spy (New-Fake @{}) '' $false;if($frame -cne 'PF_PASS|synthetic'){throw 'default bridge valid framing failed'}
 $invocation=$spy.Invocations[0];if($invocation.FileName -cne 'C:\Program Files\PostgreSQL 17\bin\psql.exe' -or ($invocation.Arguments -join '|') -cne ("-X|value with spaces|-f|$approvedSql")){throw 'argument vector changed across PowerShell/C# bridge'}
 if($invocation.Environment['PGPASSFILE'] -cne 'C:\credential path\pgpass' -or $invocation.Environment['PGSSLMODE'] -cne 'require' -or $invocation.Environment.Count -ne 2){throw 'environment dictionary changed across PowerShell/C# bridge'}
 Invoke-Spy (New-Fake @{StdOut="PF_PASS|synthetic`nPF_PASS|synthetic"}) 'malformed or ambiguous' $true
 Invoke-Spy (New-Fake @{StdOut="UNFRAMED`nPF_PASS|synthetic"}) 'unframed process evidence' $true
 Invoke-Spy (New-Fake @{StdErr='NOTICE: {"token":"secret"}'}) 'unframed process evidence' $true
 $benignBase=Join-Path $root 'benign';$spy.Results.Enqueue((New-Fake @{StdErr='NOTICE: extension "pgcrypto" already exists, skipping'}));if((Invoke-PfMvp10Psql 'psql.exe' @('-X','-f',$approvedSql) @{} (Join-Path $root 'CANCEL') 1000 '^PF_PASS\|synthetic$' $benignBase) -cne 'PF_PASS|synthetic'){throw 'benign notice rejected'};if((Get-Content -Raw ($benignBase+'.err')) -match 'pgcrypto|already exists'){throw 'benign notice persisted'}
 Invoke-Spy (New-Fake @{ExitCode=1;StdErr='password=hunter2 token=abc postgres://u:p@host/db'}) 'protected process failed' $true
 Invoke-Spy (New-Fake @{TimedOut=$true}) 'bounded timeout' $true
 Invoke-Spy (New-Fake @{Cancelled=$true}) 'cancellation requested' $true
 Invoke-Spy (New-Fake @{Overflow=$true}) 'bounded capture' $true
 Invoke-Spy (New-Fake @{AllStopped=$false}) 'lifecycle is unaccounted' $true
 $before=$spy.Invocations.Count;Set-Content -LiteralPath (Join-Path $root 'CANCEL') -Value 'cancel';$failed=$false;try{Invoke-PfMvp10Psql 'ignored.exe' @('-X') @{} (Join-Path $root 'CANCEL') 1 '^x$' (Join-Path $root 'cancelled')|Out-Null}catch{$failed=$_.Exception.Message -match 'cancellation requested'};Remove-Item (Join-Path $root 'CANCEL');if(-not $failed -or $spy.Invocations.Count -ne $before){throw 'pre-launch cancellation reached process bridge'}
 $oneOut="PF_EVENT|1|worker-one|READY|backend=401`nPF_EVENT|1|worker-one|TERMINAL|status=COMPLETED;purchase=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
 $twoOut='PF_EVENT|1|worker-two|READY|backend=402';$twoErr='NOTICE: PF_EVENT|1|worker-two|TERMINAL|status=CONFLICT;sqlstate=23505'
 if((Assert-PfMvp10WorkerTranscript 'worker-one' $oneOut '' 'COMPLETED') -ne 401 -or (Assert-PfMvp10WorkerTranscript 'worker-two' $twoOut $twoErr 'CONFLICT') -ne 402){throw 'complete real-format worker transcript rejected'}
 Assert-PfMvp10BlockerEvent 'PF_EVENT|1|coordinator|BLOCKER|waiting=402;blocking=401' 402 401
 foreach($bad in @("PF_EVENT|1|worker-one|TERMINAL|status=COMPLETED;purchase=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`nPF_EVENT|1|worker-one|READY|backend=401",'PF_EVENT|1|worker-two|READY|backend=402')){$failed=$false;try{Assert-PfMvp10WorkerTranscript 'worker-two' $bad '' 'CONFLICT'|Out-Null}catch{$failed=$true};if(-not $failed){throw 'incomplete/reordered transcript accepted'}}
 $secretBase=Join-Path $root 'secret';try{Complete-PfMvp10ProcessEvidence (New-Fake @{ExitCode=1;StdErr='password=hunter2 token=abc postgres://u:p@host/db'}) '^x$' $secretBase 'scripts/acceptance/pf-mvp-10/sql/00_runtime_compatibility.sql'|Out-Null}catch{};$retained=Get-Content -Raw ($secretBase+'.err');if($retained -match 'hunter2|token=abc|u:p@host'){throw 'secret-bearing diagnostics retained'}
 Write-Output 'PF-MVP-10 production-bridge/process/transcript rehearsal: 15 passed'
} finally {[PfProcessBridge]::Reset();Remove-Item -LiteralPath $root -Recurse -Force}
