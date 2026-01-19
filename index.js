#!/usr/bin/env node

import { watch } from 'node:fs';
import { resolve, basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { colors, ui } from './src/ui.js';
import { compile } from './src/compiler.js';
import { startServer } from './src/server.js';
import { autoUpdate, selfUpdate } from './src/updater.js';
import { exec } from 'node:child_process';
import packageJson from './package.json' with { type: 'json' };

// --- Entry Point ---
const args = process.argv.slice(2);

const optionsSchema = {
    watch: { type: 'boolean', short: 'w' },
    output: { type: 'string', short: 'o' },
    server: { type: 'string', short: 's' },
    help: { type: 'boolean', short: 'h' },
    update: { type: 'boolean', short: 'u' },
    version: { type: 'boolean', short: 'v' },
    verify: { type: 'boolean' }
};

async function main() {
    try {
        const { values, positionals } = parseArgs({ args, options: optionsSchema, allowPositionals: true });

        if (values.update) {
            await selfUpdate(packageJson.version);
            process.exit(0);
        }

        if (values.help) {
            console.log(`
${colors.magenta}${colors.bold}🌀 qtex CLI${colors.reset}
Ultra-fast LaTeX compilation powered by Tachyon-Tex

${colors.bold}USAGE:${colors.reset}
  qtex [directory] [options]

${colors.bold}OPTIONS:${colors.reset}
  -w, --watch           Watch for changes and recompile
  -o, --output <file>   Define output filename (default: output.pdf)
  -s, --server <url>    Specify Tachyon-Tex server URL
  -u, --update          Update to the latest version
  -v, --version         Show version information
  --verify              Only verify LaTeX without compiling
  -h, --help            Show this help message
            `);
            process.exit(0);
        }

        if (values.version) {
            console.log(`qtex v${packageJson.version}`);
            process.exit(0);
        }

        const directory = positionals[0] || '.';
        console.log(`${colors.magenta}${colors.bold}\n🌀 qtex CLI v${packageJson.version} (Vanilla)${colors.reset}\n`);

        if (values.server) {
            ui.info(`Using compilation server: ${colors.bold}${values.server}${colors.reset}`);
        }

        // Check for updates in the background
        autoUpdate(packageJson.version);

        if (values.watch) {
            const server = await startServer(4343);
            const viewUrl = `http://localhost:${server.port}/view`;
            ui.info(`Watching for changes in: ${colors.bold}${directory}${colors.reset}`);
            ui.info(`View PDF at: ${colors.blue}${colors.underline}${viewUrl}${colors.reset}`);

            // Initial compile
            await compile(directory, values);

            // Auto-open browser
            const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
            exec(`${openCmd} "${viewUrl}"`);

            let isCompiling = false;
            watch(directory, { recursive: true }, async (event, filename) => {
                if (filename && !filename.startsWith('.') && !isCompiling) {
                    const ext = extname(filename).toLowerCase();
                    const outputFileName = values.output || 'output.pdf';

                    // Watch for LaTeX files and images, but ignore the output PDF to avoid loops
                    const watchExts = ['.tex', '.bib', '.sty', '.cls', '.png', '.jpg', '.jpeg', '.pdf'];
                    const isOutputFile = basename(filename) === basename(outputFileName);

                    if (watchExts.includes(ext) && !isOutputFile) {
                        isCompiling = true;
                        try {
                            await compile(directory, values);
                        } catch (e) {
                            ui.error(`Watch compile error: ${e.message}`);
                        } finally {
                            isCompiling = false;
                        }
                    }
                }
            });
        } else {
            await compile(directory, values);

            // Auto-open generated PDF in the system browser
            const outputFileName = values.output || 'output.pdf';
            const outputPath = resolve(process.cwd(), directory, outputFileName);
            const openCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open';
            exec(`${openCmd} "${outputPath}"`);
        }

    } catch (e) {
        ui.error(e.message);
        process.exit(1);
    }
}

main();
