param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$apiCommand = "Set-Location '$projectRoot'; corepack pnpm run exec:prod -- api:dev"
$apiArgs = @(
  '-NoExit',
  '-ExecutionPolicy', 'Bypass',
  '-Command', $apiCommand
)

if ($DryRun) {
  Write-Host '[prod:all] Dry run mode. Commands that would run:'
  Write-Host "[prod:all] New terminal: powershell $($apiArgs -join ' ')"
  Write-Host '[prod:all] Current terminal: corepack pnpm run dev:prod'
  exit 0
}

Write-Host '[prod:all] Starting Supabase-backed API server in a new PowerShell window...'
Start-Process -FilePath 'powershell.exe' -ArgumentList $apiArgs | Out-Null

Write-Host '[prod:all] Starting production-configured web dev server in current terminal...'
corepack pnpm run dev:prod
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }