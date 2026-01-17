import { execSync, spawn } from 'node:child_process';
import { colors, ui } from './ui.js';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const REPO = 'srsergiolazaro/qtex';
const STATE_DIR = join(homedir(), '.qtex');
const INSTALL_DIR = join(STATE_DIR, 'bin');
const STATE_FILE = join(STATE_DIR, 'state.json');
const BINARY_NAME = process.platform === 'win32' ? 'qtex.exe' : 'qtex';

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
export async function autoUpdate(currentVersion) {
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
            console.log(`${colors.dim}\n🚀 New version detected (${data.tag_name}). Updating silently in background...${colors.reset}`);

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

        ui.info(`New version found: ${colors.bold}v${latestVersion}${colors.reset}. Updating cartbridge...`);

        // location of the current running script (qtex.js)
        const currentScriptPath = process.argv[1];

        // Download new bundle
        const bundleUrl = `https://github.com/${REPO}/releases/latest/download/qtex.js`;
        const bundleRes = await fetch(bundleUrl);
        if (!bundleRes.ok) throw new Error('Failed to download update bundle');

        const newCode = await bundleRes.text();
        await writeFile(currentScriptPath, newCode);

        ui.success(`qtex updated to v${latestVersion}! (Size: ${(newCode.length / 1024).toFixed(2)} KB)`);
    } catch (error) {
        ui.error(`Update failed: ${error.message}`);
    }
}
