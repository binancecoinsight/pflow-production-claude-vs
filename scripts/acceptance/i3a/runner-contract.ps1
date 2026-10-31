Set-StrictMode -Version Latest
function Get-I3aAdvisoryLockComponentsSql([Parameter(Mandatory)][string]$LockKeySql,[switch]$AsColumns) {
  $high="((($LockKeySql) >> 32) & 4294967295)::oid";$low="(($LockKeySql) & 4294967295)::oid"
  if($AsColumns){return "$high,$low"}
  return "$high||'|'||$low"
}
function Assert-I3aMutationAcknowledgement([Parameter(Mandatory)][string]$Value,[Parameter(Mandatory)][string]$ExpectedTag,[int]$ExpectedCount) {
  if($ExpectedTag -cnotmatch '^[A-Z][A-Z0-9_]{2,79}$' -or $ExpectedCount -lt 0){throw 'mutation acknowledgment expectation is invalid'}
  if($Value -cnotmatch '^([A-Z][A-Z0-9_]{2,79})\|([0-9]+)$' -or $Matches[1] -cne $ExpectedTag){throw 'mutation acknowledgment is malformed or has the wrong tag'}
  $actual=[int64]$Matches[2]
  if($actual -ne $ExpectedCount){throw "mutation affected $actual rows; expected $ExpectedCount"}
  return $actual
}
