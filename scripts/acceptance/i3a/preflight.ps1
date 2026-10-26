Set-StrictMode -Version Latest

function Assert-I3aPreflight {
  param(
    [Parameter(Mandatory)][string]$AuthorizationFile,
    [Parameter(Mandatory)][ValidateSet('postgres-fixture','postgres-assertions','postgres-concurrency','fixture-cleanup')][string]$Command,
    [Parameter(Mandatory)][string]$PackageManifest
  )
  $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
  $auth = Get-Content -Raw -LiteralPath (Resolve-Path -LiteralPath $AuthorizationFile -ErrorAction Stop) | ConvertFrom-Json -Depth 30
  $manifestPath = (Resolve-Path -LiteralPath $PackageManifest -ErrorAction Stop).Path
  if ($auth.status -cne 'AUTHORIZED' -or $auth.scope -cne 'I3A_DISPOSABLE_POSTGRES_ACCEPTANCE' -or [string]::IsNullOrWhiteSpace($auth.authorizationId)) { throw 'ABORT: explicit execution authorization is absent or invalid.' }
  if ([DateTimeOffset]::Parse($auth.expiresAt).ToUniversalTime() -le [DateTimeOffset]::UtcNow) { throw 'ABORT: execution authorization expired.' }
  if ($auth.target.projectId -cne 'pharmacyflow-i3a-acceptance-20261026' -or $auth.target.marker -cne 'pharmacyflow-i3a-acceptance-20261026' -or
      $auth.target.host -cne '127.0.0.1' -or [int]$auth.target.port -ne 57322 -or $auth.target.database -cne 'postgres' -or
      $auth.target.user -cne 'postgres' -or $auth.target.sslMode -cne 'disable' -or
      [string]$auth.target.systemIdentifier -cnotmatch '^[1-9][0-9]{5,29}$' -or [int]$auth.target.databaseOid -lt 1) { throw 'ABORT: exact loopback destination and target proof are not pinned.' }
  if ([string]$auth.connection.psqlPath -cnotmatch '^[A-Za-z]:\\.+\.exe$' -or [string]$auth.connection.psqlSha256 -cnotmatch '^[0-9a-f]{64}$' -or
      [string]$auth.connection.credentialFilePath -cnotmatch '^[A-Za-z]:\\.+' -or [int]$auth.connection.connectTimeoutSeconds -ne 5) { throw 'ABORT: pinned connection configuration is incomplete.' }
  $psqlPath = (Resolve-Path -LiteralPath $auth.connection.psqlPath -ErrorAction Stop).Path
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $psqlPath).Hash.ToLowerInvariant() -cne [string]$auth.connection.psqlSha256) { throw 'ABORT: pinned psql executable hash mismatch.' }
  $credentialPath = (Resolve-Path -LiteralPath $auth.connection.credentialFilePath -ErrorAction Stop).Path
  if ($credentialPath -cne [string]$auth.connection.credentialFilePath) { throw 'ABORT: credential delivery path did not resolve exactly.' }
  if ($auth.runId -cne 'I3A-20261026-001' -or $auth.evidenceRoot -cne 'C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-i3a-acceptance-20261026-evidence') { throw 'ABORT: run/evidence scope mismatch.' }
  if ($auth.providerAuthBrowserEnabled -ne $false) { throw 'ABORT: provider/Auth/browser stages must remain disabled.' }

  $fixtureNames = @('applicantA','applicantB','applicantEmailA','applicantEmailB','contextA','contextB','decisionPrefix','gateway','gatewayOther','gatewayOtherVersion','gatewayRotated','gatewayRotatedVersion','gatewayVersion','operationPrefix','operator','operatorUnderprivileged','operatorUnderprivilegedVersion','operatorVersion','providerPrefix','requestPrefix','subjectPrefix')
  if ((@($auth.fixtures.psobject.Properties.Name | Sort-Object) -join '|') -cne ($fixtureNames -join '|')) { throw 'ABORT: complete fixture property inventory mismatch.' }
  $expectedFixtures = [ordered]@{
    applicantA='c2d396e8f8a83479f2e5718aedd9a746b493540ec98baa7b23e51aad29977bcf'; applicantB='0f46f0ba6b7213ccafdfd4a8245a5b323735e7970e69f67cdbf0a3ab00633d29';
    applicantEmailA='owner.i3a.001@example.invalid'; applicantEmailB='owner.i3a.002@example.invalid'; contextA='10000000-0000-4000-8000-000000000001'; contextB='10000000-0000-4000-8000-000000000002';
    decisionPrefix='40000000-0000-4000-8000-'; gateway='i3a-gateway-0001'; gatewayOther='i3a-gateway-0002'; gatewayOtherVersion=1; gatewayRotated='i3a-gateway-0001'; gatewayRotatedVersion=2; gatewayVersion=1;
    operationPrefix='20000000-0000-4000-8000-'; operator='i3a-operator-0001'; operatorUnderprivileged='i3a-operator-none-0001'; operatorUnderprivilegedVersion=1; operatorVersion=1;
    providerPrefix='50000000-0000-4000-8000-'; requestPrefix='30000000-0000-4000-8000-'; subjectPrefix='60000000-0000-4000-8000-'
  }
  foreach ($name in $fixtureNames) { if ([string]$auth.fixtures.$name -cne [string]$expectedFixtures[$name]) { throw "ABORT: fixture mismatch for $name." } }
  if ($auth.fixturesDigest -cne '729488ac2c141b6bb69abdbb37571892dffe2db2170fe033c417cecc507d3c76') { throw 'ABORT: canonical fixture digest mismatch.' }

  $allowed = @($auth.allowedCommands)
  if ($allowed.Count -lt 1 -or @($allowed | Sort-Object -Unique).Count -ne $allowed.Count -or @($allowed | Where-Object { $_ -notin @('postgres-fixture','postgres-assertions','postgres-concurrency','fixture-cleanup') }).Count -ne 0 -or $Command -notin $allowed) { throw 'ABORT: command is not narrowly authorized.' }
  if ((@($auth.commandPermissions.psobject.Properties.Name | Sort-Object) -join '|') -cne (@($allowed | Sort-Object) -join '|')) { throw 'ABORT: command permissions differ from allowed commands.' }
  $permission = $auth.commandPermissions.$Command
  if (($Command -ceq 'postgres-fixture' -and ($permission.fixtureWrite -ne $true -or @($permission.psobject.Properties).Count -ne 1)) -or
      ($Command -ceq 'postgres-assertions' -and ($permission.readOnlyAndRollbackAssertions -ne $true -or @($permission.psobject.Properties).Count -ne 1)) -or
      ($Command -ceq 'postgres-concurrency' -and ($permission.concurrentFixtureWrite -ne $true -or $permission.cancellationAndRollbackVerification -ne $true -or @($permission.psobject.Properties).Count -ne 2)) -or
      ($Command -ceq 'fixture-cleanup' -and ($permission.fixtureCleanup -ne $true -or $permission.environmentDestruction -ne $false -or @($permission.psobject.Properties).Count -ne 2))) { throw "ABORT: exact permission for $Command is absent or overbroad." }

  $relativePaths = @(
    'supabase/functions/_shared/owner-security-i3.ts',
    'scripts/acceptance/i3a/contract.ts','scripts/acceptance/i3a/preflight.ts','scripts/acceptance/i3a/orchestrator.ts','scripts/acceptance/i3a/evidence.ts','scripts/acceptance/i3a/process-output.ts','scripts/acceptance/i3a/concurrency-evidence.ts',
    'scripts/acceptance/i3a/preflight.ps1','scripts/acceptance/i3a/evidence.ps1','scripts/acceptance/i3a/process-output.ps1','scripts/acceptance/i3a/process-output.test.ps1','scripts/acceptance/i3a/executor.ps1','scripts/acceptance/i3a/concurrency-runner.ps1','scripts/acceptance/i3a/scenarios.ps1',
    'scripts/acceptance/i3a/sql/00_guard.sql','scripts/acceptance/i3a/sql/01_target_proof.sql','scripts/acceptance/i3a/sql/10_fixture.sql','scripts/acceptance/i3a/sql/20_acl_rls_assertions.sql',
    'scripts/acceptance/i3a/sql/21_role_dml_denial.sql','scripts/acceptance/i3a/sql/22_authority_assertions.sql','scripts/acceptance/i3a/sql/23_operation_recovery_assertions.sql',
    'scripts/acceptance/i3a/sql/24_atomic_replay_assertions.sql','scripts/acceptance/i3a/sql/25_lifecycle_recovery_assertions.sql','scripts/acceptance/i3a/sql/40_concurrency_scenarios.sql','scripts/acceptance/i3a/sql/90_cleanup.sql',
    'supabase/migrations/20261025000027_owner_onboarding_v1.sql','supabase/migrations/20261025000028_owner_eligibility_issuer_v1.sql','supabase/migrations/20261025000029_owner_eligibility_recovery_v1.sql',
    'supabase/migrations/20261026000030_owner_gateway_operator_contract_v1.sql','supabase/migrations/20261026000031_owner_gateway_operator_correction_v1.sql','supabase/migrations/20261026000032_owner_gateway_boundary_parity_v1.sql'
  )
  if ((@($auth.approvedHashes.psobject.Properties.Name | Sort-Object) -join '|') -cne (@($relativePaths | Sort-Object) -join '|')) { throw 'ABORT: complete hash inventory is missing or extra.' }
  $sealedMigrationHashes=@{
    'supabase/migrations/20261025000027_owner_onboarding_v1.sql'='d2e66b3560cda174e062b8f8b8810c57429c3b4680b59b2a6a8e20aea965da6c';
    'supabase/migrations/20261025000028_owner_eligibility_issuer_v1.sql'='cb9e0ceb134d430e2d7fb8ac3812d3f243eb2660e3e655a3a8608c50a54c4445';
    'supabase/migrations/20261025000029_owner_eligibility_recovery_v1.sql'='3973ba51139a4ccfef03aca80e9231b0465738937de0af97f60bd2e425bcfb9e';
    'supabase/migrations/20261026000030_owner_gateway_operator_contract_v1.sql'='e6b5ee258573eab85e8913601fd64eeff97c3a1f59d497369cdc847cab8cae54';
    'supabase/migrations/20261026000031_owner_gateway_operator_correction_v1.sql'='9e2a85990b85ec73746f3114d3b798a61135b42072c22558a4fa51c9ce4cba6e';
    'supabase/migrations/20261026000032_owner_gateway_boundary_parity_v1.sql'='448384e6981c66ac0090716eb1322e45f90a2464440cbe7170380c91cdbb66da'
  }
  foreach ($relative in $relativePaths) {
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $repoRoot $relative)).Hash.ToLowerInvariant()
    if ($actual -cne [string]$auth.approvedHashes.psobject.Properties[$relative].Value) { throw "ABORT: pinned hash mismatch for $relative." }
    if ($sealedMigrationHashes.ContainsKey($relative) -and $actual -cne $sealedMigrationHashes[$relative]) { throw "ABORT: sealed migration hash override for $relative." }
  }
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant() -cne [string]$auth.packageManifestSha256) { throw 'ABORT: package manifest hash mismatch.' }
  return [pscustomobject]@{ Authorization=$auth; PsqlPath=$psqlPath; CredentialPath=$credentialPath; ManifestPath=$manifestPath }
}
