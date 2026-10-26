param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'acceptance\target-guard.ps1')
$target = Get-AcceptanceTarget
Assert-AcceptanceDockerTarget $target
$container = $target.DbContainer

# The SQL harness uses BEGIN/ROLLBACK and therefore never leaves synthetic data.
Get-Content -Raw (Join-Path $PSScriptRoot 'refund-v2-local.sql') |
  docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "Refund V2 SQL harness failed ($LASTEXITCODE)." }
