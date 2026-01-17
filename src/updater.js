import { execSync } from 'node:child_process';
import { colors, ui } from './ui.js';
import { join } from 'node:path';
import { homedir } from 'node:os';

const REPO = 'srsergiolazaro/qtex';
const INSTALL_DIR = join(homedir(), '.qtex', 'bin');
const BINARY_NAME = process.platform === 'win32' ? 'qtex.exe' : 'qtex';

export async function checkForUpdates(currentVersion) {
    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
        if (!res.ok) return;

        const data = await res.json();
        const latestTag = data.tag_name; // e.g., v1.0.6
        const latestVersion = latestTag.replace('v', '');

        if (latestVersion !== currentVersion) {
            console.log(`\n${colors.yellow}✨ A new version of qtex is available: ${colors.bold}${latestTag}${colors.reset}`);
            console.log(`${colors.dim}Run ${colors.blue}qtex --update${colors.reset}${colors.dim} to update automatically.\n${colors.reset}`);
        }
    } catch (e) {
        // Silently ignore update check failures
    }
}

export async function selfUpdate() {
    ui.info('Checking for the latest version...');

    try {
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
        const data = await res.json();
        const latestTag = data.tag_name;

        // Detect asset name based on OS/Arch
        const os = process.platform === 'darwin' ? 'darwin' : process.platform === 'win32' ? 'windows' : 'linux';
        // Simple arch detection for Bun targets
        const arch = process.arch === 'arm64' ? 'arm64' : 'x64';

        let assetName = `qtex-${os}-${arch}`;
        if (os === 'windows') assetName += '.exe';

        const asset = data.assets.find(a => a.name === assetName);
        if (!asset) {
            ui.error(`Could not find a binary for your platform (${assetName}).`);
            return;
        }

        ui.info(`Downloading ${colors.bold}${latestTag}${colors.reset}...`);

        const binPath = join(INSTALL_DIR, BINARY_NAME);
        const installScriptCmd = `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | bash`;

        // The easiest way to update safely is to re-run the install script
        // because it handles PATH and binary replacement correctly.
        execSync(installScriptCmd, { stdio: 'inherit' });

        ui.success('qtex has been updated to the latest version!');
    } catch (error) {
        ui.error(`Update failed: ${error.message}`);
    }
}
