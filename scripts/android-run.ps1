param(
  [string]$Target = $env:ANDROID_TARGET
)

$ErrorActionPreference = 'Stop'

if (-not $Target -and $args.Count -gt 0) {
  $Target = $args[0]
}

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

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
corepack pnpm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:run] Syncing Capacitor Android project..."
corepack pnpm exec cap sync android
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

$runCmd = @('pnpm', 'exec', 'cap', 'run', 'android')
if ($Target) {
  $runCmd += @('--target', $Target)
  Write-Host "[android:run] Deploying to target '$Target'..."
} else {
  Write-Host "[android:run] Deploying to default Android device/emulator..."
}

corepack @runCmd
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:run] Done."


