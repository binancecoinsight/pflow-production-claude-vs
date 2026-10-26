Set-StrictMode -Version Latest

function Get-AcceptanceTarget {
  $target = $env:PF_ACCEPTANCE_TARGET_ID
  $expected = $env:PF_ACCEPTANCE_EXPECTED_TARGET_ID
  $dbContainer = $env:PF_ACCEPTANCE_DB_CONTAINER
  $edgeContainer = $env:PF_ACCEPTANCE_EDGE_CONTAINER
  $apiContainer = $env:PF_ACCEPTANCE_API_CONTAINER
  $dbPort = $env:PF_ACCEPTANCE_DB_PORT
  $expectedDbPort = $env:PF_ACCEPTANCE_EXPECTED_DB_PORT
  $apiUrl = $env:PF_ACCEPTANCE_API_URL
  $expectedApiUrl = $env:PF_ACCEPTANCE_EXPECTED_API_URL
  if ([string]::IsNullOrWhiteSpace($target) -or $target -cne $expected) { throw 'ABORT: exact authorized target identity is missing or mismatched.' }
  if ($dbContainer -cne "supabase_db_$target" -or $edgeContainer -cne "supabase_edge_runtime_$target" -or $apiContainer -cne "supabase_kong_$target") { throw 'ABORT: container identities do not derive from the authorized target.' }
  if ($dbPort -notmatch '^\d{2,5}$' -or [int]$dbPort -gt 65535) { throw 'ABORT: exact database port is required.' }
  try { $uri = [Uri]$apiUrl; $expectedUri = [Uri]$expectedApiUrl } catch { throw 'ABORT: exact API URL is required.' }
  if ($uri.Scheme -cne 'http' -or $uri.Host -cne '127.0.0.1' -or $uri.IsDefaultPort -or -not [string]::IsNullOrEmpty($uri.UserInfo) -or $uri.AbsolutePath -cne '/' -or $uri.Query -or $uri.Fragment) { throw 'ABORT: API must be an uncredentialed exact loopback HTTP origin.' }
  if ($dbPort -cne $expectedDbPort -or $uri.GetLeftPart([UriPartial]::Authority) -cne $expectedUri.GetLeftPart([UriPartial]::Authority) -or $expectedUri.AbsolutePath -cne '/' -or $expectedUri.Query -or $expectedUri.Fragment) { throw 'ABORT: acceptance endpoints differ from the explicitly authorized endpoints.' }
  [pscustomobject]@{ Id=$target; DbContainer=$dbContainer; EdgeContainer=$edgeContainer; ApiContainer=$apiContainer; DbPort=$dbPort; ApiUrl=$uri.GetLeftPart([UriPartial]::Authority); ApiPort=[string]$uri.Port }
}

function Assert-AcceptanceDockerTarget([object]$Target) {
  foreach ($container in @($Target.DbContainer,$Target.EdgeContainer,$Target.ApiContainer)) {
    $labels = docker inspect $container --format '{{json .Config.Labels}}' | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or $labels.'com.supabase.cli.project' -cne $Target.Id) { throw "ABORT: $container project label mismatch." }
  }
  $dbPorts = docker inspect $Target.DbContainer --format '{{json .NetworkSettings.Ports}}' | ConvertFrom-Json
  $dbBindings = @($dbPorts.'5432/tcp')
  if ($dbBindings.Count -ne 1 -or $dbBindings[0].HostIp -cne '127.0.0.1' -or $dbBindings[0].HostPort -cne $Target.DbPort) { throw 'ABORT: PostgreSQL is not bound to the exact authorized loopback endpoint.' }
  $edgePorts = docker inspect $Target.ApiContainer --format '{{json .NetworkSettings.Ports}}' | ConvertFrom-Json
  $matching = @($edgePorts.PSObject.Properties.Value | Where-Object { @($_).Count -eq 1 -and @($_)[0].HostIp -ceq '127.0.0.1' -and @($_)[0].HostPort -ceq $Target.ApiPort })
  if ($matching.Count -ne 1) { throw 'ABORT: Edge/API is not bound to the exact authorized loopback endpoint.' }
}
