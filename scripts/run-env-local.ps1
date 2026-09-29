$ErrorActionPreference = 'Stop'

$rawArgs = @($args)
$startIndex = 0

if ($rawArgs.Count -gt 0 -and $rawArgs[0] -eq '--') {
  $startIndex = 1
}

if ($rawArgs.Count -le $startIndex) {
  throw "Usage: run-env-local.ps1 [--] <pnpm-script-name> [script-args...]"
}

$ScriptName = $rawArgs[$startIndex]
$ScriptArgs = @()
if ($rawArgs.Count -gt ($startIndex + 1)) {
  $ScriptArgs = @($rawArgs[($startIndex + 1)..($rawArgs.Count - 1)])
}

function Import-DotEnvFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  if (-not (Test-Path $FilePath)) {
    throw "Env file not found: $FilePath"
  }

  $loaded = 0

  foreach ($line in Get-Content -Path $FilePath) {
    $trimmed = $line.Trim()

    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    if ($trimmed -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$') {
      $name = $matches[1]
      $value = $matches[2].Trim()

      if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
        $value = $value.Substring(1, $value.Length - 2)
      }

      Set-Item -Path "Env:$name" -Value $value
      $loaded++
    }
  }

  return $loaded
}

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

$envFile = Join-Path $projectRoot '.env.local'
$loadedCount = Import-DotEnvFile -FilePath $envFile

$pnpmCommand = @(Get-PnpmCommand)
$runner = $pnpmCommand[0]
$runnerArgs = @()
if ($pnpmCommand.Count -gt 1) {
  $runnerArgs = $pnpmCommand[1..($pnpmCommand.Count - 1)]
}

Write-Host "[env:local] Loaded $loadedCount variables from .env.local"
Write-Host "[env:local] Running: $runner $($runnerArgs -join ' ') run $ScriptName $($ScriptArgs -join ' ')"

& $runner @runnerArgs run $ScriptName @ScriptArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
