Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'runner-contract.ps1')
. (Join-Path $PSScriptRoot 'scenarios.ps1')

function Assert-Exact([bool]$Condition,[string]$Message) {
  if(-not $Condition){throw "assertion failed: $Message"}
}

$nonce='70000000-0000-4000-8000-000000000001'
$authorization='OWNER-SYNTHETIC-ONLY'
$reservationFirst=Get-I3aScenario 'RESERVATION_REVOCATION_RESERVATION_FIRST' $nonce $authorization
$revocationFirst=Get-I3aScenario 'RESERVATION_REVOCATION_REVOCATION_FIRST' $nonce $authorization
$pendingFirst=Get-I3aScenario 'OPERATION_COLLISION_PENDING_FIRST' $nonce $authorization
$completedFirst=Get-I3aScenario 'OPERATION_COLLISION_COMPLETED_FIRST' $nonce $authorization

foreach($scenario in @($pendingFirst,$completedFirst)){
  Assert-Exact ($scenario.A.Contains('rpc_gateway_begin_owner_identity_v4') -or $scenario.B.Contains('rpc_gateway_begin_owner_identity_v4')) 'identity collision uses current v4 begin RPC'
  Assert-Exact (-not $scenario.A.Contains('rpc_gateway_begin_owner_identity_v3') -and -not $scenario.B.Contains('rpc_gateway_begin_owner_identity_v3')) 'identity collision does not use closed v3 route'
}
Assert-Exact ($completedFirst.B.Contains('0f46f0ba6b7213ccafdfd4a8245a5b323735e7970e69f67cdbf0a3ab00633d29')) 'completed-first uses an explicitly scoped applicant'

Assert-Exact ($reservationFirst.ExecutionClassification -ceq 'RPC_PRODUCTION_LOCK') 'reservation-first classification'
Assert-Exact ($reservationFirst.SetupSqlPath -ceq 'sql\41_reservation_first_fixture.sql') 'reservation-first committed fixture source'
Assert-Exact ((($reservationFirst.ExpectedOutcomes|Sort-Object)-join '|') -ceq 'ADMISSION_REVOKED|RESERVATION_APPLIED') 'reservation-first outcomes'
Assert-Exact ($reservationFirst.ExpectedOutcomeEffectCounts.RESERVATION_APPLIED -eq 2) 'reservation authoritative effects'
Assert-Exact ($reservationFirst.ExpectedOutcomeEffectCounts.ADMISSION_REVOKED -eq 3) 'revocation authoritative effects after reservation'
Assert-Exact ($reservationFirst.ExpectedFinalEffectCount -eq 5) 'reservation-first final effects'
Assert-Exact ($reservationFirst.A.Contains('rpc_gateway_reserve_owner_eligibility_v2')) 'reservation-first A uses reserve RPC'
Assert-Exact ($reservationFirst.B.Contains('rpc_platform_owner_admission_decide_v2')) 'reservation-first B uses admission RPC'
Assert-Exact ($reservationFirst.LockComponentsSql.Contains("hashtextextended('eb9ee3407ab728705bee110c0abb73bac0e66280aa04d14798e6c9f692cfde32',1)")) 'reservation-first production email lock'

Assert-Exact ($revocationFirst.ExecutionClassification -ceq 'RPC_PRODUCTION_LOCK') 'revocation-first classification'
Assert-Exact ($revocationFirst.SetupSqlPath -ceq 'sql\42_revocation_first_fixture.sql') 'revocation-first committed fixture source'
Assert-Exact ((($revocationFirst.ExpectedOutcomes|Sort-Object)-join '|') -ceq 'ADMISSION_REVOKED|RESERVATION_REJECTED_INACTIVE') 'revocation-first outcomes'
Assert-Exact ($revocationFirst.ExpectedOutcomeEffectCounts.ADMISSION_REVOKED -eq 3) 'revocation authoritative effects'
Assert-Exact ($revocationFirst.ExpectedOutcomeEffectCounts.RESERVATION_REJECTED_INACTIVE -eq 0) 'rejected reservation has zero effects'
Assert-Exact ($revocationFirst.ExpectedFinalEffectCount -eq 3) 'revocation-first final effects'
Assert-Exact ($revocationFirst.A.Contains('rpc_platform_owner_admission_decide_v2')) 'revocation-first A uses admission RPC'
Assert-Exact ($revocationFirst.B.Contains('rpc_gateway_reserve_owner_eligibility_v2')) 'revocation-first B uses reserve RPC'
Assert-Exact ($revocationFirst.B.Contains("WHEN SQLSTATE 'PI010'")) 'revocation-first requires inactive admission rejection'
Assert-Exact ($revocationFirst.LockComponentsSql.Contains("hashtextextended('89ea448ef3060fc9493bb02c83753ee67028ffbcc393c3217ecbce1cbe289bf1',1)")) 'revocation-first production email lock'

foreach($scenario in @($reservationFirst,$revocationFirst)){
  Assert-Exact (-not $scenario.A.Contains('pg_advisory_xact_lock')) 'session A adds no harness lock'
  Assert-Exact (-not $scenario.B.Contains('pg_advisory_xact_lock')) 'session B adds no harness lock'
  Assert-Exact ($scenario.FinalInvariantSql.StartsWith('SELECT ')) 'final state invariant is authoritative SQL'
  Assert-Exact ($scenario.RollbackProofSql.StartsWith('SELECT ')) 'rollback proof is explicit'
}

'ACC-01 reservation/revocation scenario source tests: passed'
