Set-StrictMode -Version Latest
function ConvertFrom-I3aProcessOutput {
  param([int]$ExitCode,[AllowEmptyString()][string]$Stdout,[AllowEmptyString()][string]$Stderr,[Parameter(Mandatory)][string]$ExpectedKind)
  if($ExitCode -ne 0){ throw "process failed with exit code $ExitCode; diagnostics=$(ConvertTo-I3aSanitizedText $Stderr)" }
  $lines=@($Stdout -split "`r?`n" | Where-Object { $_.Length -gt 0 })
  if($lines.Count -ne 1 -or -not $lines[0].StartsWith('PF_I3A_RESULT=')){throw 'exactly one framed PostgreSQL result envelope is required'}
  $prefix='PF_I3A_RESULT='
  try{$envelope=$lines[0].Substring($prefix.Length)|ConvertFrom-Json}catch{throw 'PostgreSQL result envelope JSON is malformed'}
  $names=@($envelope.psobject.Properties.Name|Sort-Object)
  if(($names -join '|') -cne 'kind|payload|schema' -or $envelope.schema -cne 'pharmacyflow-i3a-process-v1' -or $envelope.kind -cne $ExpectedKind){throw 'PostgreSQL result envelope contract mismatch'}
  return [pscustomobject]@{Envelope=$envelope;Diagnostics=(Protect-I3aEvidenceString $Stderr)}
}
