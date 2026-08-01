$ErrorActionPreference = 'Stop'

$rawArgs = @($args)
$startIndex = 0

if ($rawArgs.Count -gt 0 -and $rawArgs[0] -eq '--') {
  $startIndex = 1
}

if ($rawArgs.Count -le $startIndex) {
  throw "Usage: run-env-prod.ps1 [--] <pnpm-script-name> [script-args...]"
}

$ScriptName = $rawArgs[$startIndex]
$ScriptArgs = if ($rawArgs.Count -gt ($startIndex + 1)) {
  $rawArgs[($startIndex + 1)..($rawArgs.Count - 1)]
} else {
  @()
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

$envFile = Join-Path $projectRoot '.env.prod'
$loadedCount = Import-DotEnvFile -FilePath $envFile

Write-Host "[env:prod] Loaded $loadedCount variables from .env.prod"
Write-Host "[env:prod] Running: corepack pnpm run $ScriptName $($ScriptArgs -join ' ')"

& corepack pnpm run $ScriptName @ScriptArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
