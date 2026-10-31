Set-StrictMode -Version Latest;$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'runner-lib.ps1');if(-not ('PfProcessBridge' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'BoundedProcess.cs')}
class PfFakeWorker {
 [string]$Name;[string]$Source;[int]$Backend;[string]$StdOut='';[string]$StdErr='';[bool]$Overflow=$false;[bool]$HasExited=$false;[int]$ExitCode=0;[int]$StopCount=0;[int]$DisposeCount=0
 PfFakeWorker([string]$name,[string]$source,[int]$backend,[bool]$ready){$this.Name=$name;$this.Source=$source;$this.Backend=$backend;if($ready){$this.StdOut="PF_EVENT|1|$name|READY|backend=$backend"}}
 [void] Complete(){if($this.HasExited){return};if($this.Name -eq 'worker-one'){$this.StdOut+="`nPF_EVENT|1|worker-one|TERMINAL|status=COMPLETED;purchase=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"}else{$this.StdErr="psql:$($this.Source):8: NOTICE: PF_EVENT|1|worker-two|TERMINAL|status=CONFLICT;sqlstate=23505"};$this.HasExited=$true}
 [void] Stop(){$this.StopCount++;$this.HasExited=$true}
 [void] Dispose(){$this.DisposeCount++}
}
$scratch=Join-Path ([IO.Path]::GetTempPath()) ('pf-mvp10-concurrency-'+[guid]::NewGuid().ToString('N'));[IO.Directory]::CreateDirectory($scratch)|Out-Null;$fakePsql=Join-Path $scratch 'psql.exe';Set-Content $fakePsql 'not executed';$credential=Join-Path $scratch 'pgpass';Set-Content $credential 'not read'
$authorization=[pscustomobject]@{target=[pscustomobject]@{host='unused.invalid';port=5432;database='unused';user='unused';sslMode='require';marker='local';systemIdentifier='123456789';databaseOid=42};authorizationId='LOCAL-ONLY'};$preflight=[pscustomobject]@{Authorization=$authorization;Psql=$fakePsql;Credential=$credential}
function New-Result([string]$out='',[string]$err='',[int]$exit=0){$r=[PfProcessResult]::new();$r.StdOut=$out;$r.StdErr=$err;$r.ExitCode=$exit;$r.AllStopped=$true;return $r}
function Add-SuccessTranscript($spy,[int]$one,[int]$two){foreach($frame in @('PF_PASS|runtime|170000|target-verified','PF_PASS|package-state|000039','PF_PASS|concurrency-setup',"PF_EVENT|1|coordinator|BLOCKER|waiting=$two;blocking=$one",'PF_COUNT|concurrency|purchase=1|item=1|stock=5|ledger=1|audit=1|evidence=1')){$spy.Results.Enqueue((New-Result $frame))}}
$passed=0
try{
 $spy=[PfSpyProcessAdapter]::new();[PfProcessBridge]::Adapter=$spy;$workers=[Collections.Generic.List[PfFakeWorker]]::new();Add-SuccessTranscript $spy 501 502
 $factory={param($sqlFile,$exe,$argv,$env);$name=if($sqlFile -like '*worker_two.sql'){'worker-two'}else{'worker-one'};$backend=if($name -eq 'worker-one'){501}else{502};$worker=[PfFakeWorker]::new($name,$sqlFile,$backend,$true);$workers.Add($worker);return $worker}.GetNewClosure()
 $delay={foreach($worker in $workers){$worker.Complete()}}.GetNewClosure();$evidence=Join-Path $scratch 'success';New-Item -ItemType Directory $evidence|Out-Null
 $result=& (Join-Path $PSScriptRoot 'concurrency.ps1') -Preflight $preflight -Evidence $evidence -WorkerProcessFactory $factory -PollDelay $delay
 if($result.Success -ne $true -or $spy.Invocations.Count -ne 5 -or @($workers|Where-Object {$_.StopCount -ne 1 -or $_.DisposeCount -ne 1}).Count){throw 'successful coordinator accounting failed'}
 if((Get-Content -Raw (Join-Path $evidence 'worker-one.out')).Trim() -notmatch '(?s)^PF_EVENT\|1\|worker-one\|READY.*PF_EVENT\|1\|worker-one\|TERMINAL' -or (Get-Content -Raw (Join-Path $evidence 'worker-two.out')).Trim() -notmatch '(?s)^PF_EVENT\|1\|worker-two\|READY.*PF_EVENT\|1\|worker-two\|TERMINAL'){throw 'validated worker events not retained exactly'};$passed++
 foreach($mode in @('timeout','cancellation')){
  $spy=[PfSpyProcessAdapter]::new();[PfProcessBridge]::Adapter=$spy;foreach($frame in @('PF_PASS|runtime|170000|target-verified','PF_PASS|package-state|000039','PF_PASS|concurrency-setup','PF_PASS|concurrency-abort-workers-stopped-state-coherent')){$spy.Results.Enqueue((New-Result $frame))};$workers=[Collections.Generic.List[PfFakeWorker]]::new()
  $factory={param($sqlFile,$exe,$argv,$env);$worker=[PfFakeWorker]::new('worker-one',$sqlFile,601,$false);$workers.Add($worker);return $worker}.GetNewClosure();$evidence=Join-Path $scratch $mode;New-Item -ItemType Directory $evidence|Out-Null
  $delay=if($mode -eq 'cancellation'){{Set-Content -LiteralPath (Join-Path $scratch 'CANCEL') -Value 'cancel'}.GetNewClosure()}else{{}.GetNewClosure()};$failed=$false
  try{& (Join-Path $PSScriptRoot 'concurrency.ps1') -Preflight $preflight -Evidence $evidence -WorkerProcessFactory $factory -PollDelay $delay -ReadyTimeoutMilliseconds 5|Out-Null}catch{$failed=$true}
  Remove-Item -LiteralPath (Join-Path $scratch 'CANCEL') -ErrorAction SilentlyContinue;if(-not $failed -or $spy.Invocations.Count -ne 4 -or $workers[0].StopCount -lt 1 -or $workers[0].DisposeCount -ne 1){throw "$mode coordinator accounting failed"};$passed++
 }
 $base=Join-Path $scratch 'retention-gap';$valid="PF_EVENT|1|worker-one|READY|backend=701`nPF_EVENT|1|worker-one|TERMINAL|status=COMPLETED;purchase=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
 $workerSource=Join-Path $PSScriptRoot 'sql/31_concurrency_worker.sql';foreach($extra in @('PF_PASS|token=secret','PF_RESULT|cleanup|REFUSED|immutable-evidence-preserved','PF_COUNT|x|value=1','PF_EVENT|1|intruder|READY|backend=9','PF_EVENT|1|worker-one|READY|backend=701','PF_EVENT|1|worker-one|TERMINAL|status=COMPLETED;purchase=aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa;secret=value')){$failed=$false;try{Complete-PfMvp10WorkerEvidence ([pscustomobject]@{ExitCode=0;StdOut=$valid;StdErr="NOTICE: $extra";TimedOut=$false;Cancelled=$false;Overflow=$false;AllStopped=$true}) 'worker-one' 'COMPLETED' $base $workerSource|Out-Null}catch{$failed=$true};if(-not $failed){throw "unexpected worker frame accepted: $extra"};$retained=(Get-Content -Raw ($base+'.out'))+(Get-Content -Raw ($base+'.err'));if($retained -match 'secret|intruder|cleanup|PF_COUNT'){throw 'unexpected worker frame retained'}};$passed++
 Write-Output "PF-MVP-10 actual concurrency coordinator rehearsal: $passed passed"
}finally{[PfProcessBridge]::Reset();Remove-Item -LiteralPath $scratch -Recurse -Force}
