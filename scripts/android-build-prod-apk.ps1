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

function Get-JavaMajorVersion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$JavaExePath
  )

  if (-not (Test-Path $JavaExePath)) {
    return $null
  }

  $versionOutput = & $env:ComSpec /c "`"$JavaExePath`" -version 2>&1"
  if ($LASTEXITCODE -ne 0 -or -not $versionOutput) {
    return $null
  }

  $firstLine = [string]$versionOutput[0]
  if ($firstLine -match '"(\d+)(?:\.\d+)*"') {
    return [int]$matches[1]
  }

  return $null
}

function Resolve-GradleJavaHome {
  $existingJavaExe = if ($env:JAVA_HOME) {
    Join-Path $env:JAVA_HOME 'bin\java.exe'
  } else {
    $null
  }
  $existingMajor = if ($existingJavaExe) {
    Get-JavaMajorVersion -JavaExePath $existingJavaExe
  } else {
    $null
  }

  if ($existingMajor -ge 17 -and $existingMajor -le 21) {
    return
  }

  $candidateHomes = @()
  $candidateHomes += 'C:\Program Files\Java\jdk-21'
  $candidateHomes += 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.1-hotspot'
  $candidateHomes += 'C:\Program Files\Microsoft\jdk-21'
  $candidateHomes += 'C:\Program Files\Android\Android Studio\jbr'

  $wildcardRoots = @(
    'C:\Program Files\Java',
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Microsoft',
    "$env:LOCALAPPDATA\Programs\Eclipse Adoptium"
  )
  foreach ($root in $wildcardRoots) {
    if (-not (Test-Path $root)) {
      continue
    }

    $candidateHomes += @(
      Get-ChildItem -Path $root -Directory -Filter 'jdk-21*' -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
    )
    $candidateHomes += @(
      Get-ChildItem -Path $root -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty FullName
    )
  }

  $selectedHome = $null
  $selectedMajor = $null
  foreach ($candidate in ($candidateHomes | Where-Object { $_ } | Select-Object -Unique)) {
    $javaExe = Join-Path $candidate 'bin\java.exe'
    $major = Get-JavaMajorVersion -JavaExePath $javaExe
    if (-not $major) {
      continue
    }
    if ($major -ge 17 -and $major -le 21) {
      $selectedHome = $candidate
      $selectedMajor = $major
      break
    }
  }

  if (-not $selectedHome) {
    throw "Android build requires JDK 17-21, but current JAVA_HOME points to Java $existingMajor. Install JDK 21 and set JAVA_HOME."
  }

  $env:JAVA_HOME = $selectedHome
  $env:Path = "$selectedHome\bin;$($env:Path)"
  Write-Host "[android:apk:prod] Using Java $selectedMajor from '$selectedHome'."
}

Assert-NodeVersion
Resolve-GradleJavaHome

if ($env:WFH_PULSE_DB_TARGET -ne 'supabase') {
  throw "Expected WFH_PULSE_DB_TARGET=supabase for production APK, got '$($env:WFH_PULSE_DB_TARGET)'."
}

Write-Host "[android:apk:prod] Building web assets with production env..."
& $runner @runnerArgs run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:apk:prod] Syncing Capacitor Android project..."
& $runner @runnerArgs exec cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$androidPath = Join-Path $projectRoot 'android'
$gradleWrapper = Join-Path $androidPath 'gradlew.bat'

Write-Host "[android:apk:prod] Building release APK..."
& $gradleWrapper -p $androidPath assembleRelease
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$releaseApkPath = Join-Path $androidPath 'app\build\outputs\apk\release\app-release.apk'
$unsignedReleaseApkPath = Join-Path $androidPath 'app\build\outputs\apk\release\app-release-unsigned.apk'

if (Test-Path $releaseApkPath) {
  Write-Host "[android:apk:prod] APK ready: $releaseApkPath"
} elseif (Test-Path $unsignedReleaseApkPath) {
  Write-Host "[android:apk:prod] APK ready (unsigned): $unsignedReleaseApkPath"
} else {
  throw "Release APK build finished but no APK was found in android\app\build\outputs\apk\release."
}
