param()

$ErrorActionPreference = 'Stop'
$container = 'supabase_db_pflow-production_claude_vs'
$labels = docker inspect $container --format '{{json .Config.Labels}}' | ConvertFrom-Json
if ($labels.'com.supabase.cli.project' -ne 'pflow-production_claude_vs') {
  throw 'Refusing to run: target is not the isolated PharmacyFlow local database.'
}
$ports = docker inspect $container --format '{{json .NetworkSettings.Ports}}' | ConvertFrom-Json
if (-not ($ports.'5432/tcp' | Where-Object { $_.HostIp -in @('127.0.0.1', '0.0.0.0') -and $_.HostPort -eq '55322' })) {
  throw 'Refusing to run: PharmacyFlow PostgreSQL is not bound to the expected local port 55322.'
}

# The SQL harness uses BEGIN/ROLLBACK and therefore never leaves synthetic data.
Get-Content -Raw (Join-Path $PSScriptRoot 'refund-v2-local.sql') |
  docker exec -i $container psql -U postgres -d postgres -v ON_ERROR_STOP=1
if ($LASTEXITCODE -ne 0) { throw "Refund V2 SQL harness failed ($LASTEXITCODE)." }
