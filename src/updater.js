import { execSync, spawn } from 'node:child_process';
import { colors, ui } from './ui.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir, chmod } from 'node:fs/promises';

const REPO = 'srsergiolazaro/qtex';
const STATE_DIR = join(homedir(), '.qtex');
const INSTALL_DIR = join(STATE_DIR, 'bin');
const STATE_FILE = join(STATE_DIR, 'state.json');
const BINARY_NAME = process.platform === 'win32' ? 'qtex.exe' : 'qtex';

function getAssetName() {
    const os = process.platform;
    const arch = process.arch;

    if (os === 'darwin') {
        return arch === 'arm64' ? 'qtex-darwin-arm64' : 'qtex-darwin-x64';
    } else if (os === 'linux') {
        return 'qtex-linux-x64';
    } else if (os === 'win32') {
        return 'qtex-win-x64.exe';
    }
    return 'qtex.js';
}

async function getState() {
    try {
        const content = await readFile(STATE_FILE, 'utf-8');
        return JSON.parse(content);
    } catch {
        return { lastCheck: 0 };
    }
}

async function saveState(state) {
    try {
        await mkdir(STATE_DIR, { recursive: true });
        await writeFile(STATE_FILE, JSON.stringify(state));
    } catch { }
}

/**
 * Simple semver comparison (v1.2.3 format)
 * Returns true if latest > current
 */
function isNewer(latest, current) {
    const l = latest.split('.').map(Number);
    const c = current.split('.').map(Number);
    for (let i = 0; i < 3; i++) {
        if (l[i] > c[i]) return true;
        if (l[i] < c[i]) return false;
    }
    return false;
}

/**
 * Checks for updates in the background and launches a detached 
 * background process to update the binary if a new version is found.
 */
export async function autoUpdate(currentVersion, silent = false) {
    const state = await getState();
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    // Only check once a day to maintain performance
    if (now - state.lastCheck < ONE_DAY) return;

    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
        if (!res.ok) return;

        const data = await res.json();
        const latestVersion = data.tag_name.replace('v', '');

        await saveState({ ...state, lastCheck: now });

        if (isNewer(latestVersion, currentVersion)) {
            if (!silent) {
                console.log(`${colors.dim}\n🚀 New version detected (${data.tag_name}). Updating silently in background...${colors.reset}`);
            }

            // Platform-aware install command
            let installCmd, shell;
            if (process.platform === 'win32') {
                installCmd = 'irm https://raw.githubusercontent.com/' + REPO + '/main/install.ps1 | iex';
                shell = 'powershell';
            } else {
                installCmd = 'curl -fsSL https://raw.githubusercontent.com/' + REPO + '/main/install.sh | bash';
                shell = 'bash';
            }

            spawn(shell, ['-c', installCmd], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        }
    } catch (e) {
        // Silently fail if network or other errors occur during background check
    }
}

export async function selfUpdate(currentVersion) {
    ui.info('Checking for updates...');
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
        if (!res.ok) throw new Error('Could not contact GitHub API');

        const data = await res.json();
        const latestVersion = data.tag_name.replace('v', '');

        if (!isNewer(latestVersion, currentVersion)) {
            if (isNewer(currentVersion, latestVersion)) {
                ui.warn(`You are using a version (${colors.bold}v${currentVersion}${colors.reset}) that is ahead of the latest release (${colors.bold}v${latestVersion}${colors.reset}).`);
                return;
            }
            ui.success(`qtex is already up to date (${colors.bold}v${currentVersion}${colors.reset}).`);
            return;
        }

        ui.info(`New version found: ${colors.bold}v${latestVersion}${colors.reset}. Updating...`);

        // Detect if we are running as a compiled binary or a script
        const isBinary = !process.argv[1] || process.argv[1].startsWith('/$bunfs') || !process.argv[1].endsWith('.js');
        const targetPath = isBinary ? process.execPath : process.argv[1];

        const assetName = isBinary ? getAssetName() : 'qtex.js';
        const url = `https://github.com/${REPO}/releases/latest/download/${assetName}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to download update: ${response.statusText}`);

        const buffer = await response.arrayBuffer();

        // Write to a temporary file first to avoid corruption if the process is killed
        const tempPath = targetPath + '.tmp';
        await writeFile(tempPath, Buffer.from(buffer));

        // On Unix, ensure it's executable
        if (process.platform !== 'win32') {
            await chmod(tempPath, 0o755);
        }

        // Rename temp to target
        const { renameSync } = await import('node:fs');
        try {
            renameSync(tempPath, targetPath);
        } catch (e) {
            // If direct rename fails (busy file on Windows), we might need to use a different strategy
            // but for now, this is standard.
            await writeFile(targetPath, Buffer.from(buffer));
        }

        ui.success(`qtex updated to v${latestVersion}! (Size: ${(buffer.byteLength / 1024).toFixed(2)} KB)`);
        ui.info('Please restart qtex to use the new version.');
    } catch (error) {
        ui.error(`Update failed: ${error.message}`);
    }
}
