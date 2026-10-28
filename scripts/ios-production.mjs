import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const projectRoot = fileURLToPath(new URL('../', import.meta.url));
const [action, requestedDevice = process.env.IOS_SIMULATOR || 'iPhone 18 Pro', ...extraArgs] = process.argv.slice(2);
const derivedData = path.join(tmpdir(), 'wfh-pulse-production-build');
const appPath = path.join(derivedData, 'Build/Products/Release-iphonesimulator/App.app');

// Keep subprocesses on the same Node installation used to invoke this script.
const environment = {
    ...process.env,
    PATH: `${path.dirname(process.execPath)}:${process.env.PATH || ''}`,
};

function run(command, args, capture = false) {
    const result = spawnSync(command, args, {
        cwd: projectRoot,
        env: environment,
        stdio: capture ? 'pipe' : 'inherit',
        encoding: 'utf8',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
        if (capture && result.stderr) process.stderr.write(result.stderr);
        throw new Error(`${command} failed (exit ${result.status ?? result.signal}).`);
    }
    return result.stdout?.trim();
}

async function main() {
    if (process.platform !== 'darwin') throw new Error('The iOS build requires macOS and Xcode.');
    if (!['build', 'run', 'launch'].includes(action) || extraArgs.length) {
        throw new Error('Usage: node scripts/ios-production.mjs <build|run|launch> [simulator name or UUID]');
    }

    // Resolve the simulator before building so an unavailable device fails early.
    let device;
    if (action !== 'build') {
        const available = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '--json'], true));
        const devices = Object.values(available.devices).flat();
        const matches = devices.filter((item) => item.udid === requestedDevice || item.name === requestedDevice);
        device = matches.find((item) => item.state === 'Booted') || matches[0];
        if (!device) {
            throw new Error(`Simulator "${requestedDevice}" is unavailable. Run xcrun simctl list devices available and pass a name or UUID.`);
        }
        console.log(`Using ${device.name} (${device.udid})`);
    }

    if (action !== 'launch') {
        const productionEnv = parseEnv(readFileSync(path.join(projectRoot, '.env.prod'), 'utf8'));
        Object.assign(environment, productionEnv, {
            WFH_PULSE_DB_TARGET: 'supabase',
            DB_TARGET: 'supabase',
        });
        console.log('Building production web assets using .env.prod...');
        run(process.execPath, ['node_modules/vite/bin/vite.js', 'build']);
        run(process.execPath, ['node_modules/@capacitor/cli/bin/capacitor', 'sync', 'ios']);
        run('xcodebuild', [
            'build',
            '-project', 'ios/App/App.xcodeproj',
            '-scheme', 'App',
            '-configuration', 'Release',
            '-destination', 'generic/platform=iOS Simulator',
            '-derivedDataPath', derivedData,
            'CODE_SIGNING_ALLOWED=NO',
        ]);
        console.log(`Release simulator app: ${appPath}`);
    }

    if (action !== 'build') {
        if (!existsSync(appPath)) {
            throw new Error('No Release simulator build found. Run npm run ios:build:prod first.');
        }
        if (device.state !== 'Booted') run('xcrun', ['simctl', 'boot', device.udid]);
        run('xcrun', ['simctl', 'bootstatus', device.udid, '-b']);
        run('xcrun', ['simctl', 'install', device.udid, appPath]);
        const { appId } = JSON.parse(readFileSync(path.join(projectRoot, 'capacitor.config.json'), 'utf8'));
        run('xcrun', ['simctl', 'launch', '--terminate-running-process', device.udid, appId]);

        // Xcode 27 uses Device Hub; older Xcode versions bundle Simulator.
        const developerDir = run('xcode-select', ['-p'], true);
        const deviceHub = path.resolve(developerDir, '../Applications/DeviceHub.app');
        const simulator = path.join(developerDir, 'Applications/Simulator.app');
        const viewer = [deviceHub, simulator].find((candidate) => existsSync(candidate));
        if (viewer) run('open', [viewer]);
        else console.warn('App launched. Open the device viewer from Xcode > Open Developer Tool.');
        console.log(`App running on ${device.name}.`);
    }
}

main().catch((error) => {
    console.error(`[ios:production] ${error.message}`);
    process.exitCode = 1;
});
