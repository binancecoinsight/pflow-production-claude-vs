Set-StrictMode -Version Latest
function Test-I3aSensitiveKey([string]$Key) {
  $normalized = $Key.ToLowerInvariant() -replace '[^a-z0-9]',''
  return $normalized -match '(authorization|cookie|credential|password|passwd|pwd|secret|token|jwt|pgpass|connectionstring)'
}
function Protect-I3aEvidenceString([string]$Value) {
  $trimmed=$Value.Trim()
  if (($trimmed.StartsWith('{') -and $trimmed.EndsWith('}')) -or ($trimmed.StartsWith('[') -and $trimmed.EndsWith(']'))) {
    try { return (Protect-I3aEvidenceValue ($trimmed | ConvertFrom-Json)) | ConvertTo-Json -Depth 40 -Compress } catch { }
  }
  $text = $Value -replace '(?i)\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b','[REDACTED_JWT]'
  $text = $text -replace '(?i)postgres(?:ql)?://[^\s"'']+','[REDACTED_CONNECTION]'
  $text = $text -replace '(?i)\b(password|passwd|pwd|secret|token|cookie|authorization|credential|pgpass)\b\s*[:=]\s*(?:"[^"]*"|''[^'']*''|[^\s,;]+)','$1=[REDACTED]'
  return $text
}
function Protect-I3aEvidenceValue([AllowNull()][object]$Value,[string]$Key='') {
  if (Test-I3aSensitiveKey $Key) { return '[REDACTED]' }
  if ($null -eq $Value) { return $null }
  if ($Value -is [string]) { return Protect-I3aEvidenceString $Value }
  if ($Value -is [System.Collections.IDictionary]) {
    $safe=[ordered]@{}; foreach($entry in $Value.GetEnumerator()){ $safe[[string]$entry.Key]=Protect-I3aEvidenceValue $entry.Value ([string]$entry.Key) }; return $safe
  }
  if ($Value -is [System.Collections.IEnumerable]) {
    $safe=@(); foreach($item in $Value){ $safe+=,(Protect-I3aEvidenceValue $item) }; return $safe
  }
  if ($Value -is [psobject] -and @($Value.PSObject.Properties).Count -gt 0 -and $Value -isnot [ValueType]) {
    $safe=[ordered]@{}; foreach($property in $Value.PSObject.Properties){ $safe[$property.Name]=Protect-I3aEvidenceValue $property.Value $property.Name }; return $safe
  }
  return $Value
}
function ConvertTo-I3aSanitizedText([AllowNull()][object]$Value) {
  $safe=Protect-I3aEvidenceValue $Value
  if ($safe -is [string]) { return $safe }
  return $safe | ConvertTo-Json -Depth 40 -Compress
}
function Write-I3aEvidence {
  param([string]$EvidenceRoot,[string]$RunId,[string]$Command,[string]$Classification,[object]$Payload)
  $expected='C:\Users\Flourish\AppData\Local\Temp\pharmacyflow-i3a-acceptance-20261026-evidence'
  if ($EvidenceRoot -cne $expected -or $RunId -cne 'I3A-20261026-001' -or $Command -notin @('postgres-fixture','postgres-assertions','postgres-concurrency','fixture-cleanup')) { throw 'ABORT: evidence destination mismatch.' }
  [IO.Directory]::CreateDirectory($EvidenceRoot) | Out-Null
  $record=[ordered]@{ schema='pharmacyflow-i3a-evidence-v3'; capturedAt=[DateTimeOffset]::UtcNow.ToString('o'); runId=$RunId; command=$Command; classification=$Classification; payload=(Protect-I3aEvidenceValue $Payload) }
  $line=$record | ConvertTo-Json -Compress
  Add-Content -LiteralPath (Join-Path $EvidenceRoot "$RunId-$Command.ndjson") -Value $line -Encoding utf8
}
