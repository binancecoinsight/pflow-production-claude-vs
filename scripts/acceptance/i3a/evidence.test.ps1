Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot 'evidence.ps1')
$input=[ordered]@{
 password='synthetic-password'
 nested=[pscustomobject]@{AuthorizationHeader='Bearer synthetic';items=@([pscustomobject]@{api_token='array-secret';useful='kept'})}
 quotedJson='{"clientSecret":"quoted-secret","diagnostic":"kept-json"}'
 message='password="hunter two" token=synthetic-token postgres://user:pass@127.0.0.1/db eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature useful=kept'
}
$safeObject=Protect-I3aEvidenceValue $input
$safe=$safeObject|ConvertTo-Json -Depth 20 -Compress
foreach($secret in @('synthetic-password','Bearer synthetic','array-secret','quoted-secret','hunter two','synthetic-token','user:pass','eyJhbGci')){if($safe.Contains($secret)){throw "synthetic secret was not redacted: $secret"}}
foreach($diagnostic in @('useful','kept','kept-json','[REDACTED]')){if(-not $safe.Contains($diagnostic)){throw "useful diagnostic/redaction marker missing: $diagnostic"}}
Write-Output 'ACC-01 PowerShell recursive evidence sanitizer synthetic object test: passed'
