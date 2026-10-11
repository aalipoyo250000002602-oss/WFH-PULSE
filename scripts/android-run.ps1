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
  Write-Host "[android:run] Using Java $selectedMajor from '$selectedHome'."
}

Assert-NodeVersion
Resolve-GradleJavaHome

Write-Host "[android:run] Building web assets..."
& $runner @runnerArgs run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:run] Syncing Capacitor Android project..."
& $runner @runnerArgs exec cap sync android
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$adbCommand = Get-Command adb -ErrorAction SilentlyContinue
if ($adbCommand) {
  $adbPath = $adbCommand.Source
} else {
  $sdkPath = $env:ANDROID_HOME
  if (-not $sdkPath) {
    $sdkPath = $env:ANDROID_SDK_ROOT
  }
  if (-not $sdkPath) {
    $sdkLine = Get-Content (Join-Path $projectRoot 'android\local.properties') |
      Where-Object { $_ -match '^sdk\.dir=' } |
      Select-Object -First 1
    if ($sdkLine) {
      $sdkPath = ($sdkLine -replace '^sdk\.dir=', '').Replace('\:', ':').Replace('\\', '\')
    }
  }

  $adbPath = if ($sdkPath) {
    Join-Path $sdkPath 'platform-tools\adb.exe'
  } else {
    $null
  }
}

if (-not $adbPath -or -not (Test-Path $adbPath)) {
  throw "Android Debug Bridge (adb) was not found. Add platform-tools to PATH or configure android/local.properties."
}

$connectedTargets = @(
  & $adbPath devices |
    ForEach-Object {
      if ($_ -match '^(\S+)\s+device$') {
        $matches[1]
      }
    }
)
if ($LASTEXITCODE -ne 0) {
  throw "Unable to list Android devices with adb."
}

if (-not $Target -and $connectedTargets.Count -gt 0) {
  $Target = $connectedTargets[0]
  Write-Host "[android:run] Auto-detected target '$Target'."
}
if (-not $Target) {
  throw "No Android device or emulator is connected."
}
if ($Target -notin $connectedTargets) {
  throw "Android target '$Target' is not connected or is unauthorized."
}

$androidPath = Join-Path $projectRoot 'android'
$gradleWrapper = Join-Path $androidPath 'gradlew.bat'
Write-Host "[android:run] Building debug APK..."
& $gradleWrapper -p $androidPath assembleDebug
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$apkPath = Join-Path $androidPath 'app\build\outputs\apk\debug\app-debug.apk'
Write-Host "[android:run] Installing APK on target '$Target'..."
& $adbPath -s $Target install -r $apkPath
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:run] Launching WFH Pulse..."
& $adbPath -s $Target shell monkey -p com.wfh.pulse -c android.intent.category.LAUNCHER 1
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "[android:run] Done."
