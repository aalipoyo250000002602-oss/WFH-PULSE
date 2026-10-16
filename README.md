# WFH PULSE : EMPOWERING REMOTE TEAMS

Interactive project guide for local web development and Android simulator runs.

[![Vite](https://img.shields.io/badge/Vite-6.3.5-646CFF?logo=vite&logoColor=fff)](#)
[![React](https://img.shields.io/badge/React-18.3.1-149ECA?logo=react&logoColor=fff)](#)
[![Capacitor](https://img.shields.io/badge/Capacitor-8.4.2-119EFF?logo=capacitor&logoColor=fff)](#)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D4?logo=windows&logoColor=fff)](#)

### Demo link: [https://aalipoyo250000002602-oss.github.io/WFH-PULSE/](https://aalipoyo250000002602-oss.github.io/WFH-PULSE/)

### Original design source: https://www.figma.com/design/Ca9EkXu4rFZpaxcyVcoGJp/WFH-PULSE----HR-Admin-

## Quick Start

Use Node.js 22 or newer (required by Capacitor 8). The `packageManager` field
pins pnpm to 10.32.1 so Corepack and CI use the same version instead of
automatically selecting the latest pnpm release.

Choose your path:

- [ ] **Web app (browser/dev mode)**
- [ ] **Android emulator app (Capacitor)**
- [ ] **iOS app (Capacitor + Xcode on macOS)**

### Option A: Run as Web App

Use the local API and database:

```powershell
Push-Location "C:{your directory}\WFH-PULSE"
corepack pnpm run setup
corepack pnpm run dev:local
```

Open:

- Local browser: `http://localhost:{id}`
- Android Emulator browser: `http://10.0.2.2:{id}`

Use the production Supabase configuration:

```powershell
pnpm.cmd run dev:prod
```

The web app reads `.env.prod`, signs in through Supabase Auth, and uses
`/rest/v1/` as its data API base. Install `database/07_supabase_rest_api.sql`
to enable authenticated attendance, request workflows, settings, employee
management, analytics, and payroll through the RPC in schema `api`.
See `api/README.md` for deployment, verification, and external-service limits.
Local development remains available through `pnpm.cmd run local:all`.

### Deploy the Web App to GitHub Pages

1. In repository **Settings > Pages > Build and deployment**, set **Source**
   to **GitHub Actions**, not **Deploy from a branch**. Branch deployment serves
   the source `index.html` and overwrites the compiled app, causing a blank page
   with a `/src/main.tsx` 404.
2. In **Settings > Secrets and variables > Actions**, set the repository secret
   `VITE_SUPABASE_PUBLISHABLE_KEY` to the production project's **publishable**
   key. Never use a Supabase secret or service-role key in the frontend.
3. Push to `main`, or manually run **Deploy to GitHub Pages** from **Actions**.

The [Pages workflow](.github/workflows/deploy-pages.yml) builds the app with
`/WFH-PULSE/` asset paths and explicitly uses the production API
`https://tuypfaqcqsxzuswiglyw.supabase.co/rest/v1/`. It does not depend on the
ignored `.env.prod` file or the old `VITE_API_BASE_URL` repository secret.
Only the compiled `dist` artifact is deployed. The workflow verifies the
asset paths, production API URL, and publishable key before uploading it.
Local development and native build configuration are unchanged.

### Option B: Run as Android App (Emulator)

Start the local API (connected to local PostgreSQL) and web server in one terminal:

```powershell
corepack pnpm run local:all
```

Then, in a second terminal, build and deploy the locally configured app to the Android emulator:

```powershell
corepack pnpm run android:run:local:emu
```

The emulator reaches the API on your computer through `10.0.2.2:8787`; the API connects to PostgreSQL using `database/.env.local.postgres`. The app does not connect directly to PostgreSQL.

### Option C: Prepare and Build as iOS App

Prepare iOS assets and native project files:

```powershell
corepack pnpm run ios:sync
```

Use local env assets for iOS instead:

```powershell
corepack pnpm run ios:sync:local
```

Open the native iOS project in Xcode:

```powershell
corepack pnpm run ios:open
```

Then on a Mac in Xcode:

- Open `ios/App/App.xcodeproj` (this project uses Swift Package Manager, not CocoaPods)
- Select an iPhone simulator for debug testing, or a real device for release signing
- Use **Product > Archive** to create a distributable iOS build (IPA/TestFlight/App Store)

The [iOS simulator workflow](.github/workflows/ios.yml) runs on pushes and pull
requests to `main`, and can also be started manually. It uses Node 22 and the
pinned pnpm version, builds the web assets with relative paths and the production
API URL, runs `cap sync ios`, then builds the `App` scheme for a generic iOS
Simulator without signing. macOS native dependencies are included in
`pnpm-workspace.yaml`.

By default this is a compile check, not an IPA release or native test run: the project
has no iOS test target yet. Push builds use the `VITE_SUPABASE_PUBLISHABLE_KEY` repository
secret; fork pull requests can compile without that secret but cannot authenticate
at runtime.

### Download an Unsigned IPA (No Apple Signing Secrets)

You do not need a Mac or a paid Apple Developer membership to build and download
this artifact: GitHub's macOS runner builds it. Keep the existing
`VITE_SUPABASE_PUBLISHABLE_KEY` repository secret for the production API; no Apple
certificate, certificate password, or provisioning profile is needed.

1. Open **Actions > iOS build > Run workflow** and select **main**.
2. Enable **Build an unsigned IPA for external signing**, leaving the signed
   Ad Hoc option unchecked.
3. Download **WFH-Pulse-Unsigned-\<run number\>** from the successful run's
   **Artifacts** section. Unzip the artifact download to obtain `WFH-Pulse-Unsigned.ipa`.

The workflow archives an unsigned Release app for physical iOS devices, verifies
the platform and ARM64 executable, and packages it as `Payload/App.app` inside
the IPA. It does not use `xcodebuild -exportArchive`, which requires signing for
device distribution. Artifacts expire after 7 days.

**This IPA is not directly installable.** Sign it afterward with a compatible
Windows sideloading tool and your Apple ID. Free-account signing is subject to
Apple's device/app restrictions and generally requires re-signing every 7 days.
This skips signing during the CI build; it does not bypass iOS signature checks.
The signed Ad Hoc option below remains available for registered-device distribution.

### Download a Signed Ad Hoc IPA

Signed IPA export requires an Apple Developer Program membership, an **Apple Distribution**
certificate exported as a password-protected `.p12` **including its private key**,
and an **Ad Hoc provisioning profile** for `com.wfh.pulse`. The profile must include
that certificate and the UDIDs of the iPhones you want to install on.

Under **Settings > Secrets and variables > Actions**, add these repository secrets:

| Secret | Value |
| --- | --- |
| `IOS_DISTRIBUTION_CERTIFICATE_BASE64` | Base64-encoded distribution `.p12` file |
| `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD` | Password protecting the `.p12` |
| `IOS_ADHOC_PROFILE_BASE64` | Base64-encoded Ad Hoc `.mobileprovision` file |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Production Supabase publishable key, also used by Pages |

On Windows, copy each file's Base64 value directly to the clipboard, then paste it
into its GitHub secret (do not commit the files or encoded values):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\distribution.p12')) | Set-Clipboard
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\adhoc.mobileprovision')) | Set-Clipboard
```

Run the two commands separately, saving the corresponding secret after each one.

1. Open **Actions > iOS build > Run workflow**.
2. Select **main** and enable **Export a signed Ad Hoc IPA**.
3. After the run succeeds, download **WFH-Pulse-AdHoc-\<run number\>** from its
   **Artifacts** section and unzip it to obtain the `.ipa`. Artifacts expire after 7 days.

The workflow derives the team and profile identifiers from the supplied profile,
creates a temporary signing keychain, archives the physical-device `App` scheme in
Release mode, and generates the export plist using Xcode's `release-testing`
(Ad Hoc) method. Export failures or a missing IPA fail the job. Signing credentials
are cleaned up even if the build fails; only the IPA is uploaded.

Ad Hoc IPAs install only on devices registered in the profile. They are not
simulator builds, App Store/TestFlight submissions, or universally installable apps.
Normal push/PR builds do not import Apple signing secrets or export an IPA.

## Script Shortcuts

| Script                                    | What it does                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `corepack pnpm run setup`                 | Installs dependencies                                                              |
| `corepack pnpm run dev`                   | Starts Vite dev server                                                             |
| `corepack pnpm run dev:host`              | Dev server exposed on `0.0.0.0:5173`                                               |
| `corepack pnpm run dev:local`             | Web dev server using `.env.local`                                                  |
| `corepack pnpm run dev:prod`              | Web dev server using `.env.prod`                                                   |
| `corepack pnpm run dev:prod:5174`         | Production-configured web dev server on `5174`                                     |
| `corepack pnpm run local:all`             | Starts local PostgreSQL-backed API + web dev server                                |
| `corepack pnpm run prod:all`              | Supabase-backed API + production-configured web dev server                         |
| `corepack pnpm run build`                 | Production build                                                                   |
| `corepack pnpm run preview`               | Preview production build on `4173`                                                 |
| `corepack pnpm run android:sync`          | Build with `.env.prod` + sync web assets to Android                                |
| `corepack pnpm run android:run:auto`      | Build with `.env.prod` + sync + deploy to first connected Android device/emulator  |
| `corepack pnpm run android:sync:local`    | Build with `.env.local` + sync web assets to Android                               |
| `corepack pnpm run android:run:local`     | Build with `.env.local` + sync + deploy to first connected Android device/emulator |
| `corepack pnpm run android:run:emu`       | Build + sync + deploy to `emulator-5554`                                           |
| `corepack pnpm run android:run:local:emu` | Build locally configured assets + deploy to `emulator-5554`                        |
| `corepack pnpm run ios:sync`              | Build with `.env.prod` + add/sync iOS Capacitor project                             |
| `corepack pnpm run ios:sync:local`        | Build with `.env.local` + add/sync iOS Capacitor project                            |
| `corepack pnpm run ios:open`              | Open `ios/` project in Xcode (macOS)                                                |
| `corepack pnpm run api:dev:local`         | Starts the API with local PostgreSQL explicitly selected                           |
| `corepack pnpm run android:open`          | Open `android/` project in Android Studio                                          |

## Optional AI Event Context (Smart Leave Planner)

To enable live event/festival context in **Pulse AI Smart Leave Planner**, add this to your API environment file (for example `api/.env.local`):

```bash
GEMINI_API_KEY=your_gemini_api_key_here
```

When this key is present and has available credits, the planner enriches each recommended leave schedule with:

- Two concise AI planning insights
- Possible local/community events and festivals outside registered company holidays

If the key is missing or credits are unavailable, the planner automatically falls back to built-in schedule guidance.

## Project Map

```text
src/                 React app source
src/app/components/  UI and page modules
src/assets/          Web assets used by UI/PDF/login/reporting
android/             Capacitor Android native project
ios/                 Capacitor iOS native project (generated after ios:sync)
scripts/             PowerShell helpers for Android and iOS sync/open workflows
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

## iOS Notes

<details>
<summary>Can I build an iOS IPA on Windows?</summary>

No. Apple signing and IPA archive export require Xcode on macOS.

You can still run `corepack pnpm run ios:sync` on Windows to keep web assets and Capacitor iOS files in sync, then open/build on a Mac.

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
