param()

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
function Read-RepoFile([string]$Relative) {
  return [System.IO.File]::ReadAllText((Join-Path $root $Relative))
}
function Require-Text([string]$Text, [string]$Needle, [string]$Message) {
  if (-not $Text.Contains($Needle)) { throw $Message }
}

$gateA = Read-RepoFile 'scripts/phase-b-acceptance/gate-a-assertions.sql'
Require-Text $gateA "set_config('request.jwt.claim.role','authenticated',true)" 'Gate A no longer simulates authenticated claims as documented'
Require-Text $gateA 'ROLLBACK;' 'Gate A no longer rolls back as documented'

$gateBSequential = Read-RepoFile 'scripts/phase-b-acceptance/gate-b-sequential.sql'
$gateBConcurrency = Read-RepoFile 'scripts/phase-b-acceptance/gate-b-concurrency.ps1'
Require-Text $gateBSequential "set_config('request.jwt.claim.role','service_role',true)" 'Gate B sequential role changed'
Require-Text $gateBConcurrency "set_config('request.jwt.claim.role','service_role',true)" 'Gate B concurrency role changed'

$gateCleanup = Read-RepoFile 'scripts/phase-b-acceptance/gate-ab-cleanup.sql'
Require-Text $gateCleanup 'fixture pharmacy identity mismatch' 'Gate A/B cleanup pharmacy guard missing'
Require-Text $gateCleanup 'fixture user identity mismatch' 'Gate A/B cleanup user guard missing'
Require-Text $gateCleanup 'SET LOCAL session_replication_role = replica;' 'Gate A/B cleanup elevation changed'
Require-Text $gateCleanup 'SET LOCAL session_replication_role = origin;' 'Gate A/B cleanup restore missing'

$refundLocal = Read-RepoFile 'scripts/refund-v2-local.sql'
Require-Text $refundLocal 'ROLLBACK;' 'Refund V2 local worksheet no longer rolls back'
$refundConcurrency = Read-RepoFile 'scripts/run-refund-v2-concurrency.ps1'
Require-Text $refundConcurrency 'finally {' 'Refund V2 concurrency finally cleanup missing'
Require-Text $refundConcurrency "'Refund V2 concurrency harness'" 'Refund V2 cleanup pharmacy guard missing'
Require-Text $refundConcurrency "'refund-v2-concurrency@test.local'" 'Refund V2 cleanup user guard missing'

$edgeFiles = @(
  'scripts/run-edge001-disposable.mjs',
  'scripts/run-edge002-disposable.mjs',
  'scripts/run-edge003-disposable.mjs'
)
foreach ($relative in $edgeFiles) {
  $source = Read-RepoFile $relative
  Require-Text $source '/auth/v1/admin/users' "$relative no longer creates Auth users as documented"
  Require-Text $source 'preserveFailureThroughCleanup' "$relative does not guarantee cleanup after failure"
  Require-Text $source 'runGuardedEdgeCleanup' "$relative does not use the shared identity-guarded cleanup"
  Require-Text $source 'user_metadata: { pharmacy_name:' "$relative does not give trigger-created bootstrap roots a cleanup identity"
  if ($source -match 'process\.exit\s*\(') { throw "$relative can bypass asynchronous cleanup with process.exit" }
}
$edgeCleanup = Read-RepoFile 'scripts/acceptance/edge-fixture-cleanup.mjs'
Require-Text $edgeCleanup 'fixture email reverse-identity mismatch' 'Edge cleanup lacks email-to-known-ID guard'
Require-Text $edgeCleanup "'expected_user_ids'" 'Edge cleanup proof does not retain original known user roots'

$statusV2Postgrest = Read-RepoFile 'scripts/acceptance/status-v2-postgrest.mjs'
Require-Text $statusV2Postgrest '/rest/v1/rpc/rpc_get_client_op_status_v2' 'Status-v2 runner does not use the genuine PostgREST RPC path'
Require-Text $statusV2Postgrest 'PF_STATUS_V2_TOKEN_OWNER_A' 'Status-v2 runner lacks fixed-subject authenticated token input'
Require-Text $statusV2Postgrest 'PF_ACCEPTANCE_APPROVED_STATUS_V2_RUNNER_SHA256' 'Status-v2 runner source-hash guard missing'
Require-Text $statusV2Postgrest 'PF_ACCEPTANCE_APPROVED_STATUS_V2_MIGRATION_SHA256' 'Status-v2 migration-hash guard missing'
Require-Text $statusV2Postgrest "evidence_class: 'REAL-POSTGREST AUTH/RLS/GRANT'" 'Status-v2 evidence class changed'
Require-Text $statusV2Postgrest 'POSTGREST-A07-authorized-absence' 'Status-v2 authorized-absence assertion missing'
Require-Text $statusV2Postgrest 'DECODED_UNVERIFIED_PREFLIGHT' 'Status-v2 decoded claims are not explicitly distinguished from signature proof'
Require-Text $statusV2Postgrest 'validateAnonKey' 'Status-v2 anon credential policy missing'
Require-Text $statusV2Postgrest 'SUPPORTED_JWT_ALGORITHMS' 'Status-v2 supported key format policy missing'
Require-Text $statusV2Postgrest 'MAX_ACTOR_TOKEN_LIFETIME_SECONDS' 'Status-v2 short-lived actor policy missing'
Require-Text $statusV2Postgrest "redirect: 'error'" 'Status-v2 redirect refusal missing'
Require-Text $statusV2Postgrest 'AbortController' 'Status-v2 HTTP bound missing'
Require-Text $statusV2Postgrest 'processed_at mismatch' 'Status-v2 fixture timestamp binding missing'
Require-Text $statusV2Postgrest 'committed effect identity mismatch' 'Status-v2 nested effect identity binding missing'
if ($statusV2Postgrest.Contains('PF_ACCEPTANCE_SERVICE_ROLE_KEY')) { throw 'Status-v2 PostgREST assertions must not use a service-role credential' }
if ($statusV2Postgrest.Contains('/auth/v1/admin/users')) { throw 'Status-v2 PostgREST runner must not create fixture users' }

Write-Output 'Acceptance runner static claims: 45/45 passed'
Write-Output 'Gate A SQL=admin claim simulation; status-v2 runner=genuine PostgREST token path; Gate B=service-role harness; all remain externally unexecuted'
