param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$apiCommand = "Set-Location '$projectRoot'; corepack pnpm run api:dev"
$apiArgs = @(
  '-NoExit',
  '-ExecutionPolicy', 'Bypass',
  '-Command', $apiCommand
)

if ($DryRun) {
  Write-Host '[local:all] Dry run mode. Commands that would run:'
  Write-Host "[local:all] New terminal: powershell $($apiArgs -join ' ')"
  Write-Host '[local:all] Current terminal: corepack pnpm run dev:local'
  exit 0
}

Write-Host '[local:all] Starting API server in a new PowerShell window...'
Start-Process -FilePath 'powershell.exe' -ArgumentList $apiArgs | Out-Null

Write-Host '[local:all] Starting web dev server (local env) in current terminal...'
corepack pnpm run dev:local
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

