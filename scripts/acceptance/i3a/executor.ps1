param(
  [Parameter(Mandatory)][string]$AuthorizationFile,
  [Parameter(Mandatory)][ValidateSet('postgres-fixture','postgres-assertions','fixture-cleanup')][string]$Command,
  [Parameter(Mandatory)][string]$PackageManifest
)
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'preflight.ps1')
. (Join-Path $PSScriptRoot 'evidence.ps1')
. (Join-Path $PSScriptRoot 'process-output.ps1')
$approved = Assert-I3aPreflight -AuthorizationFile $AuthorizationFile -Command $Command -PackageManifest $PackageManifest
$authorization=$approved.Authorization

function Invoke-I3aPsql([string]$SqlPath) {
  $ambient=@('PGHOST','PGHOSTADDR','PGPORT','PGDATABASE','PGUSER','PGSERVICE','PGSERVICEFILE','PGOPTIONS','PGAPPNAME','PGPASSWORD','PGCHANNELBINDING','PGTARGETSESSIONATTRS')
  $saved=@{}; foreach($name in $ambient){ $saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process'); [Environment]::SetEnvironmentVariable($name,$null,'Process') }
  [Environment]::SetEnvironmentVariable('PGPASSFILE',$approved.CredentialPath,'Process')
  [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT','5','Process')
  [Environment]::SetEnvironmentVariable('PGSSLMODE','disable','Process')
  $stderrPath=Join-Path ([IO.Path]::GetTempPath()) ("pf-i3a-$([Guid]::NewGuid().ToString('N')).stderr")
  try {
    $stdout = & $approved.PsqlPath -X --no-password -h '127.0.0.1' -p '57322' -d 'postgres' -U 'postgres' -q -A -t -v ON_ERROR_STOP=1 `
      -v "pf_target_id=$($authorization.target.projectId)" -v "pf_target_marker=$($authorization.target.marker)" `
      -v "pf_system_identifier=$($authorization.target.systemIdentifier)" -v "pf_database_oid=$($authorization.target.databaseOid)" `
      -v "pf_run_id=$($authorization.runId)" -v "pf_execution_authorization_id=$($authorization.authorizationId)" `
      -v "pf_fixture_digest=$($authorization.fixturesDigest)" -v 'pf_environment_destruction=false' -f $SqlPath 2> $stderrPath
    $exit=$LASTEXITCODE
    $stderr=if(Test-Path -LiteralPath $stderrPath){Get-Content -Raw -LiteralPath $stderrPath}else{''}
    return [pscustomobject]@{ ExitCode=$exit; Stdout=($stdout|Out-String).Trim(); Stderr=$stderr }
  } finally {
    Remove-Item -LiteralPath $stderrPath -Force -ErrorAction SilentlyContinue
    [Environment]::SetEnvironmentVariable('PGPASSFILE',$null,'Process'); [Environment]::SetEnvironmentVariable('PGCONNECT_TIMEOUT',$null,'Process'); [Environment]::SetEnvironmentVariable('PGSSLMODE',$null,'Process')
    foreach($name in $ambient){ [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') }
  }
}

try {
  $proof=Invoke-I3aPsql (Join-Path $PSScriptRoot 'sql\01_target_proof.sql')
  $proofEnvelope=ConvertFrom-I3aProcessOutput $proof.ExitCode $proof.Stdout $proof.Stderr 'target-proof'
  $identity=$proofEnvelope.Envelope.payload
  if ($identity.marker -cne $authorization.target.marker -or $identity.database -cne 'postgres' -or $identity.server_addr -cne '127.0.0.1' -or
      [int]$identity.server_port -ne 57322 -or [string]$identity.system_identifier -cne [string]$authorization.target.systemIdentifier -or
      [int]$identity.database_oid -ne [int]$authorization.target.databaseOid -or $identity.session_user -cne 'postgres') { throw 'target identity proof mismatch before fixture/schema access' }
  $files = if($Command -ceq 'postgres-fixture'){ @('sql\10_fixture.sql') }
    elseif($Command -ceq 'postgres-assertions'){ @('sql\20_acl_rls_assertions.sql','sql\21_role_dml_denial.sql','sql\22_authority_assertions.sql','sql\23_operation_recovery_assertions.sql','sql\24_atomic_replay_assertions.sql','sql\25_lifecycle_recovery_assertions.sql') }
    else { @('sql\90_cleanup.sql') }
  $results=@(); foreach($relative in $files){ $result=Invoke-I3aPsql (Join-Path $PSScriptRoot $relative); $kind=[IO.Path]::GetFileNameWithoutExtension($relative); $parsed=ConvertFrom-I3aProcessOutput $result.ExitCode $result.Stdout $result.Stderr $kind; $results += [pscustomobject]@{File=$relative;Payload=$parsed.Envelope.payload;Diagnostics=$parsed.Diagnostics} }
  Write-I3aEvidence $authorization.evidenceRoot $authorization.runId $Command 'EXECUTED_UNREVIEWED' $results
} catch {
  $safe=ConvertTo-I3aSanitizedText $_.Exception.Message
  Write-I3aEvidence $authorization.evidenceRoot $authorization.runId $Command 'ABORTED_NOT_PASS' $safe
  throw $safe
}
