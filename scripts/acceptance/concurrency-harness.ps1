Set-StrictMode -Version Latest

function Get-ExactConcurrencyOutcome([string]$Output) {
  $matches = @($Output -split "`r?`n" | ForEach-Object {
    if ($_ -match '^(?:NOTICE:\s+)?PF_RESULT\|(.+)$') { $Matches[1].Trim() }
  } | Where-Object { $_ })
  if ($matches.Count -ne 1) { throw "Concurrency session must emit exactly one PF_RESULT marker; received [$Output]." }
  return $matches[0]
}

function Invoke-DeterministicConcurrencyPair {
  param(
    [string]$Name,
    [string]$Container,
    [string]$Database,
    [string]$SqlA,
    [string]$SqlB,
    [string]$ExpectedA,
    [string]$ExpectedB,
    [switch]$AllowSwappedOutcomes,
    [scriptblock]$InvokeSql,
    [int]$ReadyTimeoutSeconds = 10,
    [int]$ContentionTimeoutSeconds = 10,
    [int]$CompletionTimeoutSeconds = 30
  )
  $runId = [Guid]::NewGuid().ToString('D')
  $barrierTable = "pf_acceptance_concurrency_barrier_$($runId.Replace('-',''))"
  $appA = "pf_acceptance:$runId:A"
  $appB = "pf_acceptance:$runId:B"
  & $InvokeSql "CREATE UNLOGGED TABLE public.$barrierTable(run_id uuid NOT NULL CHECK (run_id='$runId'), session_name text NOT NULL CHECK (session_name IN ('A','B')), backend_pid integer NOT NULL, released boolean NOT NULL DEFAULT false, ready_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(run_id,session_name)); COMMENT ON TABLE public.$barrierTable IS 'PharmacyFlow isolated acceptance concurrency barrier v2 run=$runId';" | Out-Null
  function With-Barrier([string]$SessionName,[string]$Body) {
    $applicationName = if ($SessionName -ceq 'A') { $appA } else { $appB }
    return @"
SET application_name='$applicationName';
BEGIN;
INSERT INTO public.$barrierTable(run_id,session_name,backend_pid) VALUES ('$runId','$SessionName',pg_backend_pid());
COMMIT;
DO `$barrier`$ DECLARE deadline timestamptz := clock_timestamp() + interval '$ReadyTimeoutSeconds seconds'; BEGIN LOOP EXIT WHEN EXISTS (SELECT 1 FROM public.$barrierTable WHERE run_id='$runId' AND session_name='$SessionName' AND released); IF clock_timestamp() >= deadline THEN RAISE EXCEPTION 'PF_BARRIER_TIMEOUT'; END IF; PERFORM pg_sleep(0.05); END LOOP; END `$barrier`$;
$Body
"@
  }
  function Start-Session([string]$SessionName,[string]$Body) {
    $inputSql = With-Barrier $SessionName $Body
    Start-Job -Name "$Name-$SessionName" -ArgumentList $Container,$Database,$inputSql,$SessionName -ScriptBlock {
      param($jobContainer,$jobDatabase,$jobSql,$jobName)
      $watch=[Diagnostics.Stopwatch]::StartNew()
      $output=$jobSql | & docker exec -i $jobContainer psql -U postgres -d $jobDatabase -X -A -t -v ON_ERROR_STOP=1 2>&1
      [pscustomobject]@{Name=$jobName;ExitCode=$LASTEXITCODE;DurationMs=$watch.ElapsedMilliseconds;Output=($output|Out-String).Trim()}
    }
  }
  $a=$null; $b=$null
  try {
    $a=Start-Session 'A' $SqlA
    $b=Start-Session 'B' $SqlB
    $deadline=[DateTime]::UtcNow.AddSeconds($ReadyTimeoutSeconds)
    $identity=$null
    do {
      if ($a.State -eq 'Completed' -or $b.State -eq 'Completed') { throw "$Name session completed before the overlap barrier released." }
      $identity=& $InvokeSql "SELECT count(*) || '|' || count(DISTINCT backend_pid) || '|' || COALESCE(string_agg(backend_pid::text,',' ORDER BY backend_pid),'') FROM public.$barrierTable WHERE run_id='$runId';"
      if ($identity -match '^2\|2\|\d+,\d+$') { break }
      Start-Sleep -Milliseconds 100
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($identity -notmatch '^2\|2\|\d+,\d+$') { throw "$Name did not establish two distinct ready backends before timeout; evidence=[$identity]." }
    & $InvokeSql "UPDATE public.$barrierTable SET released=true WHERE run_id='$runId';" | Out-Null
    $contentionDeadline=[DateTime]::UtcNow.AddSeconds($ContentionTimeoutSeconds)
    $contention=$null
    do {
      if ($a.State -eq 'Completed' -or $b.State -eq 'Completed') { throw "$Name session completed before relevant lock-contention evidence was observed." }
      $contention=& $InvokeSql "SELECT count(*) FILTER (WHERE state='active') || '|' || count(*) FILTER (WHERE wait_event_type='Lock') || '|' || COALESCE(string_agg(pid::text,',' ORDER BY pid),'') FROM pg_catalog.pg_stat_activity WHERE application_name IN ('$appA','$appB') AND query LIKE '%rpc_%';"
      if ($contention -match '^2\|[1-2]\|\d+,\d+$') { break }
      Start-Sleep -Milliseconds 50
    } while ([DateTime]::UtcNow -lt $contentionDeadline)
    if ($contention -notmatch '^2\|[1-2]\|\d+,\d+$') { throw "$Name did not prove overlapping relevant PostgreSQL lock contention; evidence=[$contention]." }
    $completed=@(Wait-Job $a,$b -Timeout $CompletionTimeoutSeconds)
    if ($completed.Count -ne 2) { throw "$Name sessions did not finish within $CompletionTimeoutSeconds seconds." }
    $ra=Receive-Job $a; $rb=Receive-Job $b
    if ($ra.ExitCode -ne 0 -or $rb.ExitCode -ne 0) { throw "$Name session failure: A=$($ra.Output) B=$($rb.Output)" }
    $actualA=Get-ExactConcurrencyOutcome $ra.Output
    $actualB=Get-ExactConcurrencyOutcome $rb.Output
    $orderedMatch = $actualA -ceq $ExpectedA -and $actualB -ceq $ExpectedB
    $swappedMatch = $AllowSwappedOutcomes -and $actualA -ceq $ExpectedB -and $actualB -ceq $ExpectedA
    if (-not $orderedMatch -and -not $swappedMatch) { throw "$Name exact outcome-set mismatch: A=[$actualA] B=[$actualB]." }
    Write-Host "$Name contention=verified readiness=$identity lock_evidence=$contention A=$actualA B=$actualB"
  }
  finally {
    if ($a -and $a.State -ne 'Completed') { Stop-Job $a -ErrorAction SilentlyContinue }
    if ($b -and $b.State -ne 'Completed') { Stop-Job $b -ErrorAction SilentlyContinue }
    if ($a) { Remove-Job $a -Force -ErrorAction SilentlyContinue }
    if ($b) { Remove-Job $b -Force -ErrorAction SilentlyContinue }
    & $InvokeSql "SELECT pg_cancel_backend(pid) FROM pg_catalog.pg_stat_activity WHERE application_name IN ('$appA','$appB');" | Out-Null
    $stopDeadline=[DateTime]::UtcNow.AddSeconds(5)
    do {
      $remaining=& $InvokeSql "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name IN ('$appA','$appB');"
      if ($remaining -ceq '0') { break }
      Start-Sleep -Milliseconds 50
    } while ([DateTime]::UtcNow -lt $stopDeadline)
    if ($remaining -cne '0') {
      & $InvokeSql "SELECT pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE application_name IN ('$appA','$appB');" | Out-Null
      $terminateDeadline=[DateTime]::UtcNow.AddSeconds(5)
      do {
        $remaining=& $InvokeSql "SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE application_name IN ('$appA','$appB');"
        if ($remaining -ceq '0') { break }
        Start-Sleep -Milliseconds 50
      } while ([DateTime]::UtcNow -lt $terminateDeadline)
    }
    if ($remaining -cne '0') { throw "$Name database sessions remain active; barrier cleanup is refused." }
    $identityComment=& $InvokeSql "SELECT COALESCE(obj_description('public.$barrierTable'::regclass),'');"
    if ($identityComment -cne "PharmacyFlow isolated acceptance concurrency barrier v2 run=$runId") { throw "$Name auxiliary barrier identity mismatch; cleanup is refused." }
    & $InvokeSql "DROP TABLE public.$barrierTable;" | Out-Null
  }
}
