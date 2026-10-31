param([Parameter(Mandatory)][string]$AuthorizationFile,[Parameter(Mandatory)][string]$Manifest,[Parameter(Mandatory)][ValidateSet('runtime-preflight','apply-migrations','acceptance-assertions','concurrency','fixture-cleanup')][string]$Command)
Set-StrictMode -Version Latest;. (Join-Path $PSScriptRoot 'preflight.ps1');. (Join-Path $PSScriptRoot 'runner-lib.ps1');. (Join-Path $PSScriptRoot 'command-dispatch.ps1')
$preflight=Assert-PfMvp10Preflight $AuthorizationFile $Manifest $Command
$result=Invoke-PfMvp10Command -Preflight $preflight -Command $Command
if($result.Success -ne $true -or $result.Command -cne $Command){throw 'EXECUTION_FAILED: command dispatch returned invalid structured result'}
$result
