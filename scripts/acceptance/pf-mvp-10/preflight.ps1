Set-StrictMode -Version Latest
function Assert-PfMvp10Preflight {
param([Parameter(Mandatory)][string]$AuthorizationFile,[Parameter(Mandatory)][string]$Manifest,[Parameter(Mandatory)][ValidateSet('runtime-preflight','apply-migrations','acceptance-assertions','concurrency','fixture-cleanup')][string]$Command)
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..\..')).Path
$a=Get-Content -Raw -LiteralPath (Resolve-Path -LiteralPath $AuthorizationFile -ErrorAction Stop)|ConvertFrom-Json -Depth 40
if($a.status -cne 'AUTHORIZED' -or $a.scope -cne 'PF_MVP_10_DISPOSABLE_ACCEPTANCE' -or [string]::IsNullOrWhiteSpace($a.authorizationId)){throw 'PREFLIGHT_REJECTED: explicit owner execution authorization absent'}
if([DateTimeOffset]::Parse($a.expiresAt).ToUniversalTime() -le [DateTimeOffset]::UtcNow){throw 'PREFLIGHT_REJECTED: authorization expired'}
if($Command -notin @($a.allowedCommands)){throw 'PREFLIGHT_REJECTED: command not authorized'}
$required=@('acl-overloads','operator-provenance','tenant-branch','entitlement-decisions','canonical-retries','financial-inventory','expired-replay','evidence-rollback','bounded-concurrency')
if((@($a.allowedScenarios|Sort-Object -Unique)-join '|') -cne (($required|Sort-Object)-join '|')){throw 'PREFLIGHT_REJECTED: complete scenario authorization absent'}
if([string]::IsNullOrWhiteSpace($a.target.host)-or [int]$a.target.port -lt 1 -or [int]$a.target.port -gt 65535 -or [string]::IsNullOrWhiteSpace($a.target.database)-or [string]::IsNullOrWhiteSpace($a.target.user)-or $a.target.sslMode -notin @('disable','require','verify-full')-or [string]$a.target.systemIdentifier -cnotmatch '^\d{6,30}$'-or [int]$a.target.databaseOid -lt 1 -or [string]::IsNullOrWhiteSpace($a.target.marker)){throw 'PREFLIGHT_REJECTED: exact target identity incomplete'}
if($a.runtime.supabaseCompatible -ne $true -or [int]$a.runtime.postgresMajor -lt 15){throw 'PREFLIGHT_REJECTED: compatible Supabase runtime not approved'}
foreach($x in @('public','auth','extensions')){if($x -notin @($a.runtime.requiredSchemas)){throw 'PREFLIGHT_REJECTED: schema contract incomplete'}}
foreach($x in @('anon','authenticated','service_role')){if($x -notin @($a.runtime.requiredRoles)){throw 'PREFLIGHT_REJECTED: role contract incomplete'}}
if('pgcrypto' -notin @($a.runtime.requiredExtensions)-or 'auth.uid()' -notin @($a.runtime.requiredAuthFunctions)-or 'auth.jwt()' -notin @($a.runtime.requiredAuthFunctions)){throw 'PREFLIGHT_REJECTED: Auth/extension contract incomplete'}
if($a.permissions.environmentDestruction -ne $false){throw 'PREFLIGHT_REJECTED: environment destruction is outside this runner'}
if($Command -ceq 'apply-migrations' -and $a.permissions.migrationApply -ne $true){throw 'PREFLIGHT_REJECTED: migration permission absent'}
if($Command -ceq 'acceptance-assertions' -and $a.permissions.fixtureWrite -ne $true){throw 'PREFLIGHT_REJECTED: fixture-write permission absent'}
if($Command -ceq 'concurrency' -and ($a.permissions.concurrency -ne $true -or $a.permissions.fixtureWrite -ne $true)){throw 'PREFLIGHT_REJECTED: concurrency permission absent'}
if($Command -ceq 'fixture-cleanup' -and $a.permissions.fixtureCleanup -ne $true){throw 'PREFLIGHT_REJECTED: cleanup permission absent'}
$manifestPath=(Resolve-Path -LiteralPath $Manifest -ErrorAction Stop).Path
if([IO.Path]::GetFullPath((Join-Path $root ([string]$a.packageManifest))) -cne $manifestPath){throw 'PREFLIGHT_REJECTED: manifest path mismatch'}
if((Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant() -cne [string]$a.packageManifestSha256){throw 'PREFLIGHT_REJECTED: manifest identity mismatch'}
function Get-ExecutionDependencies {
 $dependencies=@(
  'scripts/acceptance/pf-mvp-10/BoundedProcess.cs','scripts/acceptance/pf-mvp-10/command-dispatch.ps1','scripts/acceptance/pf-mvp-10/concurrency.ps1','scripts/acceptance/pf-mvp-10/preflight.ps1','scripts/acceptance/pf-mvp-10/runner-lib.ps1','scripts/acceptance/pf-mvp-10/runner.ps1'
 )
 $dependencies+=@(Get-ChildItem -LiteralPath (Join-Path $root 'scripts/acceptance/pf-mvp-10/sql') -Filter '*.sql' -File|ForEach-Object {$_.FullName.Substring($root.Length+1).Replace('\','/')})
 return @($dependencies|Sort-Object -Unique)
}
function Assert-ExecutionInventory([string]$path){
 $migrations=@();$dependencies=@();$seen=@{}
 foreach($line in Get-Content -LiteralPath $path){
  if($line -notmatch '^([0-9a-f]{64}) \*(supabase/migrations/[^*]+\.sql|scripts/acceptance/pf-mvp-10/(?:[^*]+))$'){throw 'PREFLIGHT_REJECTED: malformed execution inventory'}
  $expected=$Matches[1];$relative=$Matches[2];if($seen.ContainsKey($relative)){throw 'PREFLIGHT_REJECTED: duplicate execution inventory entry'};$seen[$relative]=$true
  $item=Join-Path $root $relative;if(!(Test-Path -LiteralPath $item)-or (Get-FileHash -Algorithm SHA256 -LiteralPath $item).Hash.ToLowerInvariant() -cne $expected){throw 'PREFLIGHT_REJECTED: immutable execution inventory hash mismatch'}
  if($relative -like 'supabase/migrations/*.sql'){$migrations+=[IO.Path]::GetFullPath($item)}else{$dependencies+=$relative}
 }
 $expectedDependencies=Get-ExecutionDependencies
 if((@($dependencies|Sort-Object)-join '|') -cne (@($expectedDependencies)-join '|')){throw 'PREFLIGHT_REJECTED: execution dependency inventory incomplete'}
 return [pscustomobject]@{Migrations=@($migrations);Dependencies=@($dependencies)}
}
$inventory=Assert-ExecutionInventory $manifestPath;$migrations=@($inventory.Migrations)|Sort-Object
$active=@(Get-ChildItem -LiteralPath (Join-Path $root 'supabase\migrations') -Filter '*.sql' -File|ForEach-Object {$_.FullName})|Sort-Object
if($migrations.Count -eq 0 -or ($migrations -join '|') -cne ($active -join '|') -or [IO.Path]::GetFileName($migrations[-1]) -cne '20261030000039_entitlement_contract_closure_v1.sql'){throw 'PREFLIGHT_REJECTED: migration inventory does not match pinned chain through 000039'}
$psql=(Resolve-Path -LiteralPath $a.psql.path -ErrorAction Stop).Path;if((Get-FileHash -Algorithm SHA256 -LiteralPath $psql).Hash.ToLowerInvariant() -cne [string]$a.psql.sha256){throw 'PREFLIGHT_REJECTED: psql hash mismatch'}
$pwsh=(Resolve-Path -LiteralPath $a.powerShell.path -ErrorAction Stop).Path;$currentPwsh=(Get-Process -Id $PID).Path
if($PSVersionTable.PSEdition -cne 'Core' -or $currentPwsh -cne $pwsh -or (Get-FileHash -Algorithm SHA256 -LiteralPath $pwsh).Hash.ToLowerInvariant() -cne [string]$a.powerShell.sha256){throw 'PREFLIGHT_REJECTED: PowerShell runtime identity mismatch'}
$currentVersion=[version]$PSVersionTable.PSVersion.ToString();if($currentVersion -lt [version]$a.powerShell.minimumVersion -or $currentVersion -ge [version]$a.powerShell.maximumExclusiveVersion){throw 'PREFLIGHT_REJECTED: PowerShell runtime version unsupported'}
$credential=(Resolve-Path -LiteralPath $a.credentialFile -ErrorAction Stop).Path
if(Test-Path -LiteralPath (Join-Path $a.evidenceDirectory 'CANCEL')){throw 'PREFLIGHT_REJECTED: cancellation requested'}
return [pscustomobject]@{Authorization=$a;Root=$root;Psql=$psql;PowerShell=$pwsh;Credential=$credential;Manifest=$manifestPath;Migrations=$migrations}
}
