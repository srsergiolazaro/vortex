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

        if (latestVersion !== currentVersion) {
            console.log(`${colors.dim}\n🚀 New version detected (${data.tag_name}). Updating silently in background...${colors.reset}`);

            // Re-run installer silently in a detached background process
            const installScript = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash`;

            spawn('bash', ['-c', `${installScript} > /dev/null 2>&1`], {
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

        if (latestVersion === currentVersion) {
            ui.success(`qtex is already up to date (${colors.bold}v${currentVersion}${colors.reset}).`);
            return;
        }

        ui.info(`New version found: ${colors.bold}v${latestVersion}${colors.reset}. Updating...`);
        const installScriptCmd = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash`;
        execSync(installScriptCmd, { stdio: 'inherit' });
        ui.success('qtex has been updated successfully!');
    } catch (error) {
        ui.error(`Update failed: ${error.message}`);
    }
}
