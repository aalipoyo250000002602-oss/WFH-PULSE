param(
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

function Get-PnpmCommand {
  $pnpmCmd = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
  if ($pnpmCmd) {
    return ,$pnpmCmd.Source
  }

  $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
  if ($pnpm) {
    return ,$pnpm.Source
  }

  $corepack = Get-Command corepack -ErrorAction SilentlyContinue
  if ($corepack) {
    return @($corepack.Source, 'pnpm')
  }

  throw "Unable to find pnpm. Install pnpm or enable corepack."
}

$pnpmCommand = @(Get-PnpmCommand)
$runner = $pnpmCommand[0]
$runnerArgs = @()
if ($pnpmCommand.Count -gt 1) {
  $runnerArgs = $pnpmCommand[1..($pnpmCommand.Count - 1)]
}

$runnerScript = "$runner $($runnerArgs -join ' ')".Trim()
$quotedRunnerArgs = ($runnerArgs | ForEach-Object { "'$_'" }) -join ' '
$apiCommand = "Set-Location '$projectRoot'; & '$runner' $quotedRunnerArgs run exec:prod -- api:dev"
$apiArgs = @(
  '-NoExit',
  '-ExecutionPolicy', 'Bypass',
  '-Command', $apiCommand
)

if ($DryRun) {
  Write-Host '[prod:all] Dry run mode. Commands that would run:'
  Write-Host "[prod:all] New terminal: powershell $($apiArgs -join ' ')"
  Write-Host "[prod:all] Current terminal: $runnerScript run dev:prod"
  exit 0
}

Write-Host '[prod:all] Starting Supabase-backed API server in a new PowerShell window...'
Start-Process -FilePath 'powershell.exe' -ArgumentList $apiArgs | Out-Null

Write-Host '[prod:all] Starting production-configured web dev server in current terminal...'
& $runner @runnerArgs run dev:prod
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }