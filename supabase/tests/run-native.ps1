# Isolated native PostgreSQL fallback. Does not connect to configured Supabase project.
$ErrorActionPreference = 'Stop'
$pgBin = Split-Path (Get-Command psql -ErrorAction Stop).Source
$testRoot = Join-Path $env:TEMP ('shrinekeep-social-test-' + [guid]::NewGuid().ToString('N'))
$repoRoot = Split-Path (Split-Path $PSScriptRoot)
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$testPort = $listener.LocalEndpoint.Port
$listener.Stop()
$started = $false
try {
  & (Join-Path $pgBin 'initdb.exe') -D $testRoot -U postgres -A trust --encoding=UTF8 --locale=C | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'initdb failed' }
  # Redirect outside PowerShell's pipeline: postgres inherits pg_ctl's stdout
  # handle on Windows and otherwise keeps the pipeline open after pg_ctl exits.
  $startArgs = @('-D', ('"' + $testRoot + '"'), '-l', ('"' + (Join-Path $testRoot 'server.log') + '"'), '-o', ('"-p ' + $testPort + ' -h 127.0.0.1"'), 'start')
  $startResult = Start-Process -FilePath (Join-Path $pgBin 'pg_ctl.exe') -ArgumentList $startArgs -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $testRoot 'start.out') -RedirectStandardError (Join-Path $testRoot 'start.err')
  $startResult.WaitForExit()
  $started = Test-Path (Join-Path $testRoot 'postmaster.pid')
  & (Join-Path $pgBin 'pg_isready.exe') -h 127.0.0.1 -p $testPort -U postgres | Out-Null
  if (-not $started -or $LASTEXITCODE -ne 0) { throw 'PostgreSQL start failed' }
  $sqlFiles = @(
    'supabase/tests/bootstrap/native-platform.sql',
    'supabase/schema.sql',
    'supabase/migrations/20260907034821_social_sharing_foundation.sql',
    'supabase/migrations/20260907035318_social_relationship_transactions.sql',
    'supabase/migrations/20260907040208_canonical_public_reads.sql',
    'supabase/migrations/20260907121052_box_sharing_transactions.sql',
    'supabase/migrations/20260907124728_sharing_box_invariants.sql',
    'supabase/migrations/20260907125620_wishlist_item_invariants.sql',
    'supabase/migrations/20260907131022_sharing_dependent_revisions.sql',
    'supabase/migrations/20260907132124_social_request_receipts.sql',
    'supabase/migrations/20260907144600_social_list_reads.sql',
    'supabase/migrations/20260907160500_media_lifecycle.sql',
    'supabase/migrations/20260907172603_sharing_box_delete.sql',
    'supabase/migrations/20260907174306_sharing_owner_media_and_ownership.sql',
    'supabase/tests/social-foundation.sql',
    'supabase/tests/social-transactions.sql',
    'supabase/tests/public-reads.sql',
    'supabase/tests/box-sharing.sql',
    'supabase/tests/box-invariants.sql',
    'supabase/tests/item-invariants.sql',
    'supabase/tests/dependent-revisions.sql',
    'supabase/tests/social-receipts.sql',
    'supabase/tests/social-lists.sql',
    'supabase/tests/media-lifecycle.sql',
    'supabase/tests/box-delete.sql',
    'supabase/tests/owner-media.sql',
    'supabase/tests/box-paste-inheritance.sql'
  )
  foreach ($relativePath in $sqlFiles) {
    & (Join-Path $pgBin 'psql.exe') -X -h 127.0.0.1 -p $testPort -U postgres -v ON_ERROR_STOP=1 -f (Join-Path $repoRoot $relativePath) | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "SQL failed: $relativePath" }
    Write-Output "PASS $relativePath"
  }
  & node (Join-Path $repoRoot 'supabase/tests/concurrency.mjs') (Join-Path $pgBin 'psql.exe') $testPort
  if ($LASTEXITCODE -ne 0) { throw 'Concurrent-session tests failed' }
} finally {
  if ($started) {
    & (Join-Path $pgBin 'pg_ctl.exe') -D $testRoot -m fast stop | Out-Null
  }
  Write-Output "Local database/logs retained at $testRoot"
}
