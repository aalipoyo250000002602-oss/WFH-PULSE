param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$ports = @(5173, 8787)
$pidSet = New-Object 'System.Collections.Generic.HashSet[int]'

foreach ($port in $ports) {
  $connections = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
  foreach ($connection in $connections) {
    if ($connection.OwningProcess -gt 0) {
      [void]$pidSet.Add([int]$connection.OwningProcess)
    }
  }
}

# Also catch PowerShell shells that launched the API command from local-all helper.
$runnerProcesses = @(Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'pnpm\s+run\s+api:dev' })

foreach ($process in $runnerProcesses) {
  if ($process.ProcessId -gt 0) {
    [void]$pidSet.Add([int]$process.ProcessId)
  }
}

if ($pidSet.Count -eq 0) {
  Write-Host '[local:stop] No local API/web dev processes found on ports 5173 or 8787.'
  exit 0
}

Write-Host "[local:stop] Found $($pidSet.Count) process(es) to stop."

foreach ($processId in $pidSet) {
  $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if (-not $proc) {
    continue
  }

  if ($DryRun) {
    Write-Host "[local:stop] Would stop PID $processId ($($proc.ProcessName))."
    continue
  }

  Write-Host "[local:stop] Stopping PID $processId ($($proc.ProcessName))..."
  Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
}

if ($DryRun) {
  Write-Host '[local:stop] Dry run complete. No processes were terminated.'
} else {
  Write-Host '[local:stop] Done.'
}


