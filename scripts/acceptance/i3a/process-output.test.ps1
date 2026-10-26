Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'evidence.ps1')
. (Join-Path $PSScriptRoot 'process-output.ps1')
$good='PF_I3A_RESULT={"schema":"pharmacyflow-i3a-process-v1","kind":"synthetic","payload":{"status":"PASS"}}'
$parsed=ConvertFrom-I3aProcessOutput 0 $good 'NOTICE: synthetic diagnostic' 'synthetic'
if($parsed.Envelope.payload.status -cne 'PASS' -or $parsed.Diagnostics -cne 'NOTICE: synthetic diagnostic'){throw 'normal separated process streams failed'}
$bad=@('',"$good`n$good","COMMAND TAG`n$good",'PF_I3A_RESULT={bad')
foreach($stdout in $bad){$failed=$false;try{ConvertFrom-I3aProcessOutput 0 $stdout '' 'synthetic'|Out-Null}catch{$failed=$true};if(-not $failed){throw 'malformed stdout stream was accepted'}}
$failed=$false;try{ConvertFrom-I3aProcessOutput 1 $good 'password=synthetic-secret' 'synthetic'|Out-Null}catch{$failed=$true;if($_.Exception.Message.Contains('synthetic-secret')){throw 'stderr was not sanitized'}};if(-not $failed){throw 'nonzero exit was accepted'}
Write-Output 'ACC-01 PowerShell separated process-output synthetic tests: passed'
