Set-StrictMode -Version Latest
function Initialize-PfMvp10EvidenceDirectory {
 param([Parameter(Mandatory)]$Preflight,[Parameter(Mandatory)][string]$Command)
 $evidenceRoot=[IO.Path]::GetFullPath([string]$Preflight.Authorization.evidenceDirectory)
 if(Test-Path -LiteralPath $evidenceRoot){
  $allowed=@('runtime-preflight','apply-migrations','acceptance-assertions','concurrency','fixture-cleanup','CANCEL')
  foreach($entry in Get-ChildItem -LiteralPath $evidenceRoot -Force){if($entry.Name -notin $allowed){throw 'PREFLIGHT_REJECTED: evidence destination contains an unowned entry'}}
 }else{New-Item -ItemType Directory -Path $evidenceRoot|Out-Null}
 $evidence=Join-Path $evidenceRoot $Command
 if(Test-Path -LiteralPath $evidence){if(@(Get-ChildItem -LiteralPath $evidence -Force).Count -gt 0){throw 'PREFLIGHT_REJECTED: command evidence destination is not empty'}}else{New-Item -ItemType Directory -Path $evidence|Out-Null}
 return [pscustomobject]@{Root=$evidenceRoot;Command=$evidence}
}
function Invoke-PfMvp10Command {
 param([Parameter(Mandatory)]$Preflight,[Parameter(Mandatory)][ValidateSet('runtime-preflight','apply-migrations','acceptance-assertions','concurrency','fixture-cleanup')][string]$Command,[scriptblock]$ConcurrencyInvoker)
 $a=$Preflight.Authorization;$locations=Initialize-PfMvp10EvidenceDirectory $Preflight $Command;$evidenceRoot=$locations.Root;$evidence=$locations.Command;$sql=Join-Path $PSScriptRoot 'sql'
 function Invoke-BoundedPsql([string]$file,[int]$seconds=60,[AllowEmptyString()][string]$expected=''){
  if(Test-Path -LiteralPath (Join-Path $evidenceRoot 'CANCEL')){throw 'EXECUTION_ABORTED: cancellation requested'}
  $base=Join-Path $evidence ([IO.Path]::GetFileName($file));$environmentMap=@{PGPASSFILE=$Preflight.Credential;PGCONNECT_TIMEOUT='5';PGSSLMODE=$a.target.sslMode}
  $argumentVector=@('-X','--no-password','-q','-A','-t','-v','ON_ERROR_STOP=1','-h',$a.target.host,'-p',[string]$a.target.port,'-d',$a.target.database,'-U',$a.target.user,'-v',"pf_target_marker=$($a.target.marker)",'-v',"pf_system_identifier=$($a.target.systemIdentifier)",'-v',"pf_database_oid=$($a.target.databaseOid)",'-v',"pf_authorization_id=$($a.authorizationId)",'-f',$file)
  return Invoke-PfMvp10Psql -ExecutablePath $Preflight.Psql -ArgumentVector $argumentVector -EnvironmentMap $environmentMap -CancellationPath (Join-Path $evidenceRoot 'CANCEL') -TimeoutMilliseconds ($seconds*1000) -Expected $expected -EvidenceBase $base
 }
 $runtimePattern=Get-PfMvp10RuntimeFramePattern
 if($Command -ceq 'runtime-preflight'){Invoke-BoundedPsql (Join-Path $sql '00_runtime_compatibility.sql') 30 $runtimePattern|Out-Null}
 elseif($Command -ceq 'apply-migrations'){
  Invoke-BoundedPsql (Join-Path $sql '00_runtime_compatibility.sql') 30 $runtimePattern|Out-Null;Invoke-BoundedPsql (Join-Path $sql '01_empty_target.sql') 30 '^PF_PASS\|empty-target$'|Out-Null
  foreach($migration in $Preflight.Migrations){Invoke-BoundedPsql $migration 90|Out-Null};Invoke-BoundedPsql (Join-Path $sql '02_package_state.sql') 30 '^PF_PASS\|package-state\|000039$'|Out-Null
 }
 elseif($Command -ceq 'acceptance-assertions'){
  Invoke-BoundedPsql (Join-Path $sql '00_runtime_compatibility.sql') 30 $runtimePattern|Out-Null;Invoke-BoundedPsql (Join-Path $sql '02_package_state.sql') 30 '^PF_PASS\|package-state\|000039$'|Out-Null
  Invoke-BoundedPsql (Join-Path $sql '10_acl_and_contracts.sql') 60 '^PF_PASS\|acl-overloads-and-private-bases$'|Out-Null;Invoke-BoundedPsql (Join-Path $sql '15_api_role_rls.sql') 60 '^PF_PASS\|api-role-rls$'|Out-Null
  Invoke-BoundedPsql (Join-Path $sql '20_transactional_scenarios.sql') 120 '^PF_PASS\|transactional-scenarios-rolled-back$'|Out-Null;Invoke-BoundedPsql (Join-Path $sql '25_financial_refund.sql') 120 '^PF_PASS\|financial-refund-preservation$'|Out-Null
 }
 elseif($Command -ceq 'concurrency'){
  $result=if($ConcurrencyInvoker){& $ConcurrencyInvoker $Preflight $evidence}else{& (Join-Path $PSScriptRoot 'concurrency.ps1') -Preflight $Preflight -Evidence $evidence}
  if($result -is [array] -or $null -eq $result -or $result.Success -ne $true -or $result.Frame -cne 'PF_PASS|bounded-concurrency|distinct-backends=2|production-blocker=proven'){throw 'EXECUTION_FAILED: concurrency runner returned invalid structured result'}
 }
 else{
  Invoke-BoundedPsql (Join-Path $sql '00_runtime_compatibility.sql') 30 $runtimePattern|Out-Null;Invoke-BoundedPsql (Join-Path $sql '02_package_state.sql') 30 '^PF_PASS\|package-state\|000039$'|Out-Null
  Invoke-BoundedPsql (Join-Path $sql '90_cleanup.sql') 60 '^PF_RESULT\|cleanup\|REFUSED\|immutable-evidence-preserved$'|Out-Null
 }
 $summary=[ordered]@{status='EXECUTED_UNREVIEWED';command=$Command;authorizationId=$a.authorizationId;targetMarker=$a.target.marker;completedAt=[DateTimeOffset]::UtcNow.ToString('O')};$summary|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $evidence 'summary.json') -Encoding utf8
 return [pscustomobject]@{Success=$true;Command=$Command;Evidence=$evidence}
}
