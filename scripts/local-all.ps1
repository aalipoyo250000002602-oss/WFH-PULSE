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
$apiCommand = "Set-Location '$projectRoot'; & '$runner' $quotedRunnerArgs run api:dev"
$apiArgs = @(
  '-NoExit',
  '-ExecutionPolicy', 'Bypass',
  '-Command', $apiCommand
)

if ($DryRun) {
  Write-Host '[local:all] Dry run mode. Commands that would run:'
  Write-Host "[local:all] New terminal: powershell $($apiArgs -join ' ')"
  Write-Host "[local:all] Current terminal: $runnerScript run dev:local"
  exit 0
}

Write-Host '[local:all] Starting API server in a new PowerShell window...'
Start-Process -FilePath 'powershell.exe' -ArgumentList $apiArgs | Out-Null

Write-Host '[local:all] Starting web dev server (local env) in current terminal...'
& $runner @runnerArgs run dev:local
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

