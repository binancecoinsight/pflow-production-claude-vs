Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'runner-contract.ps1')
if((Assert-I3aMutationAcknowledgement 'COORDINATOR_OBSERVED|2' 'COORDINATOR_OBSERVED' 2) -ne 2){throw 'valid mutation acknowledgment failed'}
foreach($value in @('COORDINATOR_OBSERVED|0','COORDINATOR_OBSERVED|1','COORDINATOR_OBSERVED|3','WRONG_TAG|2','COORDINATOR_OBSERVED|2|EXTRA','')){$failed=$false;try{Assert-I3aMutationAcknowledgement $value 'COORDINATOR_OBSERVED' 2|Out-Null}catch{$failed=$true};if(-not $failed){throw "invalid mutation acknowledgment accepted: $value"}}
$sql=Get-I3aAdvisoryLockComponentsSql "hashtextextended('operation',2)"
if($sql -notmatch '4294967295' -or $sql -match '::int'){throw 'unsigned advisory-lock SQL decomposition is absent'}
Write-Output 'ACC-01 PowerShell mutation acknowledgment and lock-source tests: passed'
