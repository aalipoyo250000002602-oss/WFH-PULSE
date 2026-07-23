param()

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "[android:open] Opening Android project in Android Studio..."
corepack pnpm exec cap open android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

