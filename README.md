# WFH PULSE : EMPOWERING REMOTE TEAMS

Interactive project guide for local web development and Android simulator runs.

[![Vite](https://img.shields.io/badge/Vite-6.3.5-646CFF?logo=vite&logoColor=fff)](#)
[![React](https://img.shields.io/badge/React-18.3.1-149ECA?logo=react&logoColor=fff)](#)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.4.2-119EFF?logo=capacitor&logoColor=fff)](#)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=fff)](#)

### Demo link: [https://aalipoyo250000002602-oss.github.io/WFH-PULSE/](https://aalipoyo250000002602-oss.github.io/WFH-PULSE/)

### Original design source: https://www.figma.com/design/Ca9EkXu4rFZpaxcyVcoGJp/WFH-PULSE----HR-Admin-

## Quick Start

Choose your path:

- [ ] **Web app (browser/dev mode)**
- [ ] **Android emulator app (Capacitor)**

### Option A: Run as Web App

```powershell
Push-Location "C:{your directory}\WFH-PULSE"
corepack pnpm run setup
corepack pnpm run dev:host
```

Open:

- Local browser: `http://localhost:{id}`
- Android Emulator browser: `http://10.0.2.2:{id}`

### Option B: Run as Android App (Emulator)

```powershell
Push-Location "C:{your directory}\WFH-PULSE"
corepack pnpm run android:run:auto
```

## Script Shortcuts

| Script | What it does |
|---|---|
| `corepack pnpm run setup` | Installs dependencies |
| `corepack pnpm run dev` | Starts Vite dev server |
| `corepack pnpm run dev:host` | Dev server exposed on `0.0.0.0:5173` |
| `corepack pnpm run build` | Production build |
| `corepack pnpm run preview` | Preview production build on `4173` |
| `corepack pnpm run android:sync` | Build + sync web assets to Android |
| `corepack pnpm run android:run:auto` | Build + sync + deploy to first connected Android device/emulator |
| `corepack pnpm run android:run:emu` | Build + sync + deploy to `emulator-5554` |
| `corepack pnpm run android:open` | Open `android/` project in Android Studio |

## Project Map

```text
src/                 React app source
src/app/components/  UI and page modules
src/assets/          Web assets used by UI/PDF/login/reporting
android/             Capacitor Android native project
scripts/             PowerShell helpers for Android run/sync/open
```

## Demo GIF

Add a short flow demo (30-60s) for quick reviews.

Suggested flow:

- [ ] Open login screen
- [ ] Show dashboard widgets loading
- [ ] Navigate to attendance/calendar
- [ ] Trigger one action (toast, modal, export)
- [ ] Return to dashboard

## Contributing Workflow

Use this checklist before opening a PR:

- [ ] Pull latest branch and install deps (`corepack pnpm run setup`)
- [ ] Run local web app (`corepack pnpm run dev:host`)
- [ ] Verify Android run if mobile-impacting (`corepack pnpm run android:run:auto`)
- [ ] Run production build (`corepack pnpm run build`)
- [ ] Update screenshots/GIF if UI changed
- [ ] Update README/scripts docs if commands changed

## Release Checklist

Use this for internal handoff or demo drops:

- [ ] `corepack pnpm run build` succeeds
- [ ] Emulator install succeeds (`corepack pnpm run android:run:auto`)
- [ ] App icon appears correctly in launcher
- [ ] Login/report logos still correct (no accidental replacement)
- [ ] Key pages smoke-tested: dashboard, attendance, calendar, analytics, settings
- [ ] Known issues listed in release notes
- [ ] Attach latest screenshots and demo GIF

## Android Notes

<details>
<summary>Need Java version for Android build?</summary>

Capacitor Android build requires Java 11+.

If your shell still points to Java 8, set Android Studio JBR first:

```powershell
$env:JAVA_HOME='C:\Program Files\Android\Android Studio\jbr'
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

</details>

<details>
<summary>How do I verify emulator is connected?</summary>

```powershell
adb devices
```

Look for lines like `emulator-5554   device`.

</details>

## Troubleshooting

<details>
<summary>Dependency install issues</summary>

Use pnpm via Corepack:

```powershell
corepack pnpm run setup
```

</details>

<details>
<summary>App icon updates not showing in emulator launcher</summary>

1. Uninstall the app from emulator.
2. Re-deploy:

```powershell
corepack pnpm run android:run:auto
```

</details>

## Credits

- Product/design concept: WFH PULSE Figma project
- This repository: implementation bundle for local dev and simulator testing
