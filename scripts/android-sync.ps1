param()

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

function Assert-NodeVersion {
	$nodeVersionRaw = & node -v
	if ($LASTEXITCODE -ne 0) {
		throw "Node.js is required but was not found in PATH."
	}

	$major = 0
	if ($nodeVersionRaw -match '^v(\d+)') {
		$major = [int]$matches[1]
	}

	if ($major -lt 22) {
		throw "Capacitor Android commands require Node.js >= 22.0.0. Current: $nodeVersionRaw"
	}
}

Assert-NodeVersion

Write-Host "[android:sync] Building web assets..."
& $runner @runnerArgs run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:sync] Syncing Capacitor Android project..."
& $runner @runnerArgs exec cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:sync] Done."

