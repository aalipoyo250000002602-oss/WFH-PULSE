param(
  [string]$Target = $env:ANDROID_TARGET
)

$ErrorActionPreference = 'Stop'

if (-not $Target -and $args.Count -gt 0) {
  $Target = $args[0]
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

$studioJbr = 'C:\Program Files\Android\Android Studio\jbr'
$javaExe = if ($env:JAVA_HOME) { Join-Path $env:JAVA_HOME 'bin\java.exe' } else { $null }

if (-not $javaExe -or -not (Test-Path $javaExe)) {
  if (Test-Path (Join-Path $studioJbr 'bin\java.exe')) {
    $env:JAVA_HOME = $studioJbr
  }
}

if ($env:JAVA_HOME -and (Test-Path (Join-Path $env:JAVA_HOME 'bin\java.exe'))) {
  $env:Path = "$($env:JAVA_HOME)\bin;$($env:Path)"
}

Write-Host "[android:run] Building web assets..."
& $runner @runnerArgs run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:run] Syncing Capacitor Android project..."
& $runner @runnerArgs exec cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if (-not $Target) {
  $adb = Get-Command adb -ErrorAction SilentlyContinue
  if ($adb) {
    $deviceLines = & adb devices | Select-String "\sdevice$"
    $firstDevice = $null
    foreach ($line in $deviceLines) {
      $id = (($line.ToString() -split "\s+")[0]).Trim()
      if ($id -and $id -ne 'List') {
        $firstDevice = $id
        break
      }
    }

    if ($firstDevice) {
      $Target = $firstDevice
      Write-Host "[android:run] Auto-detected target '$Target'."
    }
  }
}

$runCmd = @('exec', 'cap', 'run', 'android')
if ($Target) {
  $runCmd += @('--target', $Target)
  Write-Host "[android:run] Deploying to target '$Target'..."
} else {
  Write-Host "[android:run] Deploying to default Android device/emulator..."
}

& $runner @runnerArgs @runCmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:run] Done."


