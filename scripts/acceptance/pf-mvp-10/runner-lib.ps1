Set-StrictMode -Version Latest
function Get-PfMvp10RuntimeFramePattern {return '^PF_PASS\|runtime\|[0-9]+\|target-verified$'}
function Test-PfMvp10BenignNotice([string]$Line) {
 return $Line -cmatch '^NOTICE:\s+(?:extension "pgcrypto" already exists, skipping|relation "[A-Za-z0-9_.-]+" already exists, skipping|column "[A-Za-z0-9_.-]+" of relation "[A-Za-z0-9_.-]+" already exists, skipping|(?:policy|trigger) "[A-Za-z0-9_.-]+" for relation "[A-Za-z0-9_.-]+" does not exist, skipping|constraint "[A-Za-z0-9_.-]+" of relation "[A-Za-z0-9_.-]+" does not exist, skipping)$'
}
function Get-PfMvp10NormalizedDiagnosticLines([AllowEmptyString()][string]$Text,[Parameter(Mandatory)][string]$ApprovedSqlPath) {
 $approved=[IO.Path]::GetFullPath($ApprovedSqlPath);$maximumLine=@(Get-Content -LiteralPath $approved).Count;$normalized=@()
 foreach($line in @($Text -split "`r?`n"|Where-Object {$_.Length -gt 0})){
  if($line -notlike 'psql:*'){$normalized+=$line;continue}
  if($line -cnotmatch '^psql:(.+):([1-9][0-9]*):\s+(NOTICE:\s+.+)$'){throw 'EXECUTION_FAILED: malformed psql diagnostic prefix'}
  try{$source=[IO.Path]::GetFullPath($Matches[1])}catch{throw 'EXECUTION_FAILED: malformed psql diagnostic source'}
  if(-not [string]::Equals($source,$approved,[StringComparison]::OrdinalIgnoreCase) -or [int]$Matches[2] -gt $maximumLine){throw 'EXECUTION_FAILED: unrelated psql diagnostic source'}
  $normalized+=$Matches[3]
 }
 return @($normalized)
}
function Get-PfMvp10Frames([string]$StdOut,[string]$StdErr) {
 $frames=@();foreach($line in @(($StdOut+"`n"+$StdErr)-split "`r?`n")){if($line -cmatch '^(?:NOTICE:\s*)?(PF_(?:PASS|RESULT|COUNT|EVENT)\|[A-Za-z0-9_.:=;-]+(?:\|[A-Za-z0-9_.:=;-]+)*)$'){$frames+=$Matches[1]}};return $frames
}
function Set-PfMvp10SafeEvidence([string]$EvidenceBase,[string[]]$Frames,[string]$Disposition='accepted') {
 $safeFrames=@($Frames|Where-Object {$_ -cmatch '^PF_(?:PASS|RESULT|COUNT|EVENT)\|[A-Za-z0-9_.:=;-]+(?:\|[A-Za-z0-9_.:=;-]+)*$'})
 if($safeFrames.Count -ne @($Frames).Count){throw 'EXECUTION_FAILED: unsafe evidence frame'}
 Set-Content -LiteralPath ($EvidenceBase+'.out') -Value ($safeFrames -join "`n") -Encoding utf8
 Set-Content -LiteralPath ($EvidenceBase+'.err') -Value ("PF_DIAGNOSTIC|"+$Disposition) -Encoding utf8
}
function ConvertFrom-PfMvp10Event([Parameter(Mandatory)][string]$Frame) {
 if($Frame -cnotmatch '^PF_EVENT\|1\|(worker-one|worker-two|coordinator)\|(READY|BLOCKER|TERMINAL)\|(.+)$'){throw 'EXECUTION_FAILED: malformed worker transcript event'}
 $actor=$Matches[1];$eventName=$Matches[2];$payload=$Matches[3];$fields=[ordered]@{};foreach($part in $payload -split ';'){if($part -cnotmatch '^([a-z_]+)=([A-Za-z0-9-]+)$' -or $fields.Contains($Matches[1])){throw 'EXECUTION_FAILED: malformed worker transcript field'};$fields[$Matches[1]]=$Matches[2]}
 return [pscustomobject]@{Actor=$actor;Event=$eventName;Fields=$fields;Frame=$Frame}
}
function Assert-PfMvp10WorkerTranscript([string]$Worker,[string]$StdOut,[string]$StdErr,[string]$ExpectedStatus) {
 $events=@(Get-PfMvp10Frames $StdOut $StdErr|Where-Object {$_ -like 'PF_EVENT|*'}|ForEach-Object {ConvertFrom-PfMvp10Event $_})
 if($events.Count -ne 2 -or $events[0].Actor -cne $Worker -or $events[0].Event -cne 'READY' -or $events[1].Actor -cne $Worker -or $events[1].Event -cne 'TERMINAL'){throw 'EXECUTION_FAILED: incomplete or reordered worker transcript'}
 if(@($events[0].Fields.Keys) -join '|' -cne 'backend' -or [string]$events[0].Fields.backend -cnotmatch '^[1-9][0-9]*$'){throw 'EXECUTION_FAILED: worker backend identity invalid'}
 if($events[1].Fields.status -cne $ExpectedStatus){throw 'EXECUTION_FAILED: worker terminal status mismatch'}
 if($ExpectedStatus -ceq 'COMPLETED'){if((@($events[1].Fields.Keys)-join '|') -cne 'status|purchase' -or [string]$events[1].Fields.purchase -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){throw 'EXECUTION_FAILED: completed worker outcome malformed'}}
 elseif($ExpectedStatus -ceq 'CONFLICT'){if((@($events[1].Fields.Keys)-join '|') -cne 'status|sqlstate' -or $events[1].Fields.sqlstate -cne '23505'){throw 'EXECUTION_FAILED: conflict worker outcome malformed'}}
 return [int]$events[0].Fields.backend
}
function Assert-PfMvp10BlockerEvent([string]$Frame,[int]$WaitingBackend,[int]$BlockingBackend) {
 $event=ConvertFrom-PfMvp10Event $Frame;if($event.Actor -cne 'coordinator' -or $event.Event -cne 'BLOCKER' -or (@($event.Fields.Keys)-join '|') -cne 'waiting|blocking' -or [int]$event.Fields.waiting -ne $WaitingBackend -or [int]$event.Fields.blocking -ne $BlockingBackend){throw 'EXECUTION_FAILED: blocker transcript mismatch'}
}
function Complete-PfMvp10WorkerEvidence($Result,[string]$Worker,[string]$ExpectedStatus,[string]$EvidenceBase,[Parameter(Mandatory)][string]$ApprovedSqlPath) {
 if(-not $Result.AllStopped -or $Result.TimedOut -or $Result.Cancelled -or $Result.Overflow -or [int]$Result.ExitCode -ne 0){Set-PfMvp10SafeEvidence $EvidenceBase @() 'worker-rejected';throw 'EXECUTION_FAILED: worker lifecycle/result invalid'}
 try{$normalizedError=@(Get-PfMvp10NormalizedDiagnosticLines ([string]$Result.StdErr) $ApprovedSqlPath)}catch{Set-PfMvp10SafeEvidence $EvidenceBase @() 'worker-rejected';throw};$normalizedErrorText=$normalizedError -join "`n"
 $stdoutLines=@($Result.StdOut -split "`r?`n"|Where-Object {$_.Trim().Length -gt 0});$stderrLines=@($normalizedError)
 if(@($stdoutLines|Where-Object {$_ -cnotmatch '^PF_EVENT\|'}).Count -or @($stderrLines|Where-Object {$_ -cnotmatch '^NOTICE:\s+PF_EVENT\|'}).Count){Set-PfMvp10SafeEvidence $EvidenceBase @() 'worker-rejected';throw 'EXECUTION_FAILED: unexpected worker process output'}
 try{$frames=@(Get-PfMvp10Frames ([string]$Result.StdOut) $normalizedErrorText);if($frames.Count -ne 2 -or @($frames|Where-Object {$_ -cnotmatch '^PF_EVENT\|'}).Count){throw 'EXECUTION_FAILED: unexpected worker evidence frame'};$backend=Assert-PfMvp10WorkerTranscript $Worker ([string]$Result.StdOut) $normalizedErrorText $ExpectedStatus;Set-PfMvp10SafeEvidence $EvidenceBase $frames;return $backend}catch{Set-PfMvp10SafeEvidence $EvidenceBase @() 'worker-rejected';throw}
}
function Complete-PfMvp10ProcessEvidence {
 param([Parameter(Mandatory)]$Result,[Parameter(Mandatory)][AllowEmptyString()][string]$Expected,[Parameter(Mandatory)][string]$EvidenceBase,[Parameter(Mandatory)][string]$ApprovedSqlPath)
 if(-not $Result.AllStopped){Set-PfMvp10SafeEvidence $EvidenceBase @() 'lifecycle-rejected';throw 'EXECUTION_FAILED: process lifecycle is unaccounted'}
 if($Result.Cancelled){Set-PfMvp10SafeEvidence $EvidenceBase @() 'cancelled';throw 'EXECUTION_ABORTED: cancellation requested'}
 if($Result.TimedOut){Set-PfMvp10SafeEvidence $EvidenceBase @() 'timeout';throw 'EXECUTION_ABORTED: bounded timeout'}
 if($Result.Overflow){Set-PfMvp10SafeEvidence $EvidenceBase @() 'overflow';throw 'EXECUTION_FAILED: output exceeded bounded capture'}
 if([int]$Result.ExitCode -ne 0){Set-PfMvp10SafeEvidence $EvidenceBase @() 'process-failed';throw 'EXECUTION_FAILED: protected process failed; diagnostic content discarded'}
 try{$normalizedError=@(Get-PfMvp10NormalizedDiagnosticLines ([string]$Result.StdErr) $ApprovedSqlPath)}catch{Set-PfMvp10SafeEvidence $EvidenceBase @() 'diagnostic-prefix-rejected';throw};$normalizedErrorText=$normalizedError -join "`n"
 $unexpected=@($Result.StdOut -split "`r?`n"|Where-Object {$_.Trim().Length -gt 0 -and $_ -notmatch '^PF_(?:PASS|RESULT|COUNT|EVENT)\|'})
 $unexpectedError=@($normalizedError|Where-Object {$_ -notmatch '^NOTICE:\s+PF_(?:PASS|RESULT|COUNT|EVENT)\|' -and -not (Test-PfMvp10BenignNotice $_)})
 if($unexpected.Count -gt 0 -or $unexpectedError.Count -gt 0){Set-PfMvp10SafeEvidence $EvidenceBase @() 'unframed-rejected';throw 'EXECUTION_FAILED: unframed process evidence'}
 $frames=@(Get-PfMvp10Frames ([string]$Result.StdOut) $normalizedErrorText)
 if($Expected){if($frames.Count -ne 1 -or $frames[0] -cnotmatch $Expected){Set-PfMvp10SafeEvidence $EvidenceBase @() 'frame-rejected';throw 'EXECUTION_FAILED: malformed or ambiguous result evidence'};Set-PfMvp10SafeEvidence $EvidenceBase $frames;return $frames[0]}
 if($frames.Count -ne 0){Set-PfMvp10SafeEvidence $EvidenceBase @() 'frame-rejected';throw 'EXECUTION_FAILED: unexpected framed migration output'};Set-PfMvp10SafeEvidence $EvidenceBase @();return 'PF_PROCESS_OK'
}
function ConvertTo-PfMvp10EnvironmentDictionary([Parameter(Mandatory)][System.Collections.IDictionary]$EnvironmentMap) {
 $dictionary=[System.Collections.Generic.Dictionary[string,string]]::new([StringComparer]::Ordinal)
 foreach($key in $EnvironmentMap.Keys){$dictionary.Add([string]$key,[string]$EnvironmentMap[$key])};return $dictionary
}
function Invoke-PfMvp10Psql {
 param([Parameter(Mandatory)][string]$ExecutablePath,[Parameter(Mandatory)][string[]]$ArgumentVector,[Parameter(Mandatory)][System.Collections.IDictionary]$EnvironmentMap,
  [Parameter(Mandatory)][string]$CancellationPath,[Parameter(Mandatory)][int]$TimeoutMilliseconds,[Parameter(Mandatory)][AllowEmptyString()][string]$Expected,
  [Parameter(Mandatory)][string]$EvidenceBase)
 if(Test-Path -LiteralPath $CancellationPath){throw 'EXECUTION_ABORTED: cancellation requested'}
 $fileFlags=@(0..($ArgumentVector.Count-1)|Where-Object {$ArgumentVector[$_] -ceq '-f'});if($fileFlags.Count -ne 1 -or $fileFlags[0] -ne $ArgumentVector.Count-2){throw 'EXECUTION_FAILED: approved SQL input argument malformed'}
 if(-not ('PfProcessBridge' -as [type])){Add-Type -Path (Join-Path $PSScriptRoot 'BoundedProcess.cs')}
 $environmentDictionary=ConvertTo-PfMvp10EnvironmentDictionary $EnvironmentMap
 $result=[PfProcessBridge]::Run($ExecutablePath,[string[]]$ArgumentVector,$environmentDictionary,$TimeoutMilliseconds,$CancellationPath,65536)
 return Complete-PfMvp10ProcessEvidence $result $Expected $EvidenceBase $ArgumentVector[$fileFlags[0]+1]
}
