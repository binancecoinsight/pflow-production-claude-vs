param(
  [string]$Manifest = 'docs/development/phase-b-acceptance/M1_M4_REVIEW_MANIFEST.sha256'
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$expected = @(
  'docs/mvp/PHARMACYFLOW_BLOCKER_REGISTER.md',
  'docs/mvp/PHARMACYFLOW_CAPABILITY_MATRIX.md',
  'docs/mvp/PHARMACYFLOW_COMMERCIAL_ARCHITECTURE.md',
  'docs/mvp/PHARMACYFLOW_DISPOSABLE_TEST_AUTHORIZATION.md',
  'docs/mvp/PHARMACYFLOW_MILESTONE_REPORT.md',
  'docs/mvp/PHARMACYFLOW_MVP_ROADMAP.md',
  'docs/mvp/PHARMACYFLOW_OWNER_APPROVALS.md',
  'docs/mvp/PHARMACYFLOW_TEST_EVIDENCE.md',
  'scripts/specification/commercial-model.ts',
  'scripts/specification/commercial-model.test.ts',
  'scripts/specification/verify-acceptance-runner-claims.ps1',
  'scripts/specification/verify-m1-m4-docs.ps1',
  'scripts/acceptance/edge-fixture-cleanup.mjs',
  'scripts/acceptance/edge-fixture-cleanup.test.mjs',
  'scripts/run-edge001-disposable.mjs',
  'scripts/run-edge002-disposable.mjs',
  'scripts/run-edge003-disposable.mjs',
  'scripts/acceptance/status-v2-postgrest.mjs',
  'scripts/acceptance/status-v2-postgrest.test.mjs',
  'src/lib/subscription/capabilityBoundary.ts',
  'src/lib/subscription/capabilityBoundary.test.ts',
  'src/components/customers/CustomersView.tsx',
  'src/components/suppliers/SuppliersView.tsx',
  'src/components/suppliers/SupplierModal.tsx',
  'src/components/devices/DeviceManagementView.tsx',
  'src/components/cash/CashReconciliationView.tsx',
  'docs/development/PHARMACYFLOW_PROGRESS.md',
  'docs/development/PHARMACYFLOW_ROADMAP.md',
  'docs/development/PHARMACYFLOW_DEPLOYMENT_RECOVERY_PLAN.md',
  'docs/development/PHARMACYFLOW_PHASE_B_VERIFICATION_PACKAGE.md',
  'docs/development/phase-b-acceptance/AUTHORIZATION_REQUEST.md',
  'docs/development/PHARMACYFLOW_OWNER_DECISION_PACKET_2026-10-25.md'
)

$requiredText = @{
  'docs/mvp/PHARMACYFLOW_OWNER_APPROVALS.md' = 'Authorization provenance'
  'docs/mvp/PHARMACYFLOW_BLOCKER_REGISTER.md' = 'BLK-017'
  'docs/mvp/PHARMACYFLOW_COMMERCIAL_ARCHITECTURE.md' = 'Referral uniqueness and deterministic qualification'
  'docs/mvp/PHARMACYFLOW_DISPOSABLE_TEST_AUTHORIZATION.md' = 'Evidence-class correction for Gate A/B'
  'docs/mvp/PHARMACYFLOW_MILESTONE_REPORT.md' = '-07/-08 finding reconciliation'
  'docs/mvp/PHARMACYFLOW_MVP_ROADMAP.md' = 'Mapping to the existing development roadmap'
  'docs/mvp/PHARMACYFLOW_CAPABILITY_MATRIX.md' = 'Signed offline entitlement grant'
  'docs/mvp/PHARMACYFLOW_TEST_EVIDENCE.md' = 'freshly executed evidence'
  'scripts/acceptance/edge-fixture-cleanup.mjs' = 'preserveFailureThroughCleanup'
  'scripts/acceptance/status-v2-postgrest.mjs' = 'REAL-POSTGREST AUTH/RLS/GRANT'
  'src/lib/subscription/capabilityBoundary.ts' = 'update(identity: string, allowed: boolean): boolean'
  'docs/development/PHARMACYFLOW_DEPLOYMENT_RECOVERY_PLAN.md' = 'hard prerequisite to any Dev rollout'
  'docs/development/phase-b-acceptance/AUTHORIZATION_REQUEST.md' = '13f2344fe831aba67fbf2c94a8fe9884dd202651faeae7ce424ba019f8fe5cf9'
  'docs/development/PHARMACYFLOW_OWNER_DECISION_PACKET_2026-10-25.md' = 'PF-SUP-2026-10-25-12'
}

$actualHashes = @{}
foreach ($relative in $expected) {
  $path = Join-Path $root $relative
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing review file: $relative" }
  $bytes = [System.IO.File]::ReadAllBytes($path)
  if ($bytes.Length -eq 0) { throw "Empty review file: $relative" }
  if ($requiredText.ContainsKey($relative)) {
    $text = [System.Text.Encoding]::UTF8.GetString($bytes)
    if (-not $text.Contains($requiredText[$relative])) { throw "Required content missing from $relative" }
  }
  $actualHashes[$relative] = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
}

$manifestPath = Join-Path $root $Manifest
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Review manifest missing: $Manifest" }
$manifestRows = @{}
foreach ($line in [System.IO.File]::ReadAllLines($manifestPath)) {
  if ($line -notmatch '^([0-9a-f]{64})  (.+)$') { throw "Malformed manifest row: $line" }
  if ($manifestRows.ContainsKey($Matches[2])) { throw "Duplicate manifest path: $($Matches[2])" }
  $manifestRows[$Matches[2]] = $Matches[1]
}
if ($manifestRows.Count -ne $expected.Count) { throw "Manifest expected $($expected.Count) rows, found $($manifestRows.Count)" }
foreach ($relative in $expected) {
  if (-not $manifestRows.ContainsKey($relative)) { throw "Manifest path missing: $relative" }
  if ($manifestRows[$relative] -cne $actualHashes[$relative]) { throw "Hash mismatch: $relative" }
}

Write-Output "M1/M4 read-only content verification: $($expected.Count)/$($expected.Count) files passed"
foreach ($relative in $expected) { Write-Output "$($actualHashes[$relative])  $relative" }
