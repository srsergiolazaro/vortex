import { readFile, writeFile, readdir, stat } from 'node:fs/promises';
import { resolve, join, extname, basename } from 'node:path';
import { colors, ui, Spinner } from './ui.js';
import { notifyClients } from './server.js';

const API_BASE = 'https://latex.taptapp.xyz';

async function getFiles(dir, baseDir = dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
        const res = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
                files.push(...(await getFiles(res, baseDir)));
            }
        } else {
            const rel = join(dir.replace(baseDir, ''), entry.name).replace(/^[\\\/]/, '').replace(/\\/g, '/');
            files.push({
                path: res,
                relative: rel
            });
        }
    }
    return files;
}

export async function compile(dir, options) {
    const outputFileName = options.output || 'output.pdf';
    const serverUrl = options.server || API_BASE;
    const spinner = new Spinner(`${colors.blue}Preparing compilation...`).start();

    try {
        const absoluteDir = resolve(dir);
        const allFiles = await getFiles(absoluteDir);

        // Sort files to prioritize .tex files (upladed first)
        allFiles.sort((a, b) => {
            const extA = extname(a.path).toLowerCase();
            const extB = extname(b.path).toLowerCase();
            if (extA === '.tex' && extB !== '.tex') return -1;
            if (extA !== '.tex' && extB === '.tex') return 1;
            return a.relative.localeCompare(b.relative);
        });

        const form = new FormData();
        const validateForm = new FormData();
        let hasLatex = false;
        let sentFilesCount = 0;

        for (const fileObj of allFiles) {
            const ext = extname(fileObj.path).toLowerCase();
            const allowedExts = ['.tex', '.bib', '.sty', '.cls', '.pdf', '.png', '.jpg', '.jpeg', '.csv'];

            if (allowedExts.includes(ext)) {
                // Skip the output file to avoid re-uploading it in subsequent runs
                if (basename(fileObj.path) === outputFileName) continue;

                const content = await readFile(fileObj.path);
                const blob = new Blob([content]);
                form.append('files', blob, fileObj.relative);
                sentFilesCount++;

                if (ext === '.tex') {
                    validateForm.append('files', blob, fileObj.relative);
                    hasLatex = true;
                }
            }
        }

        if (!hasLatex) {
            spinner.fail(`${colors.yellow}No LaTeX files found in directory.`);
            return;
        }

        // Phase 1: Validation
        spinner.update(`${colors.cyan}Validating LaTeX...`);
        try {
            const validateRes = await fetch(`${serverUrl}/validate`, {
                method: 'POST',
                body: validateForm
            });
            const validation = await validateRes.json();

            if (validation.valid === false) {
                spinner.stop();
                ui.error('Validation failed!');
                validation.errors.forEach(err => {
                    console.log(`  ${colors.red}• [Line ${err.line || '?'}] ${err.message}${colors.reset}`);
                });
                return;
            }

            if (validation.warnings?.length > 0) {
                spinner.stop();
                ui.warn('Validation warnings:');
                validation.warnings.forEach(warn => console.log(`  ${colors.yellow}⚡ ${warn}${colors.reset}`));
                spinner.start();
            }
        } catch (e) {
            // Validation service unavailable, proceed anyway
        }

        // Phase 2: Compilation
        spinner.update(`${colors.cyan}Compiling via Tachyon-Tex API...`);

        const response = await fetch(`${serverUrl}/compile`, {
            method: 'POST',
            body: form
        });

        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const compileTime = response.headers.get('x-compile-time-ms') || 'unknown';
            const filesReceived = response.headers.get('x-files-received') || sentFilesCount;

            const outputPath = resolve(process.cwd(), dir, outputFileName);
            await writeFile(outputPath, Buffer.from(buffer));

            if (options.watch) {
                notifyClients(outputPath);
            }

            spinner.succeed(`${colors.green}PDF generated in ${colors.bold}${compileTime}ms${colors.reset}`);
            console.log(`${colors.dim}  ⚡ Files: ${filesReceived} processed${colors.reset}`);
            console.log(`${colors.dim}  📍 Path: ${outputPath}${colors.reset}`);
        } else {
            const errorMsg = await response.text();
            spinner.fail(`Compilation failed (Status ${response.status})`);
            console.log(`\n${colors.yellow}--- Error Log ---${colors.reset}`);
            console.log(`${colors.red}${errorMsg || 'Error details unavailable.'}${colors.reset}`);
            console.log(`${colors.yellow}-----------------\n${colors.reset}`);
        }
    } catch (error) {
        spinner.fail('An unexpected error occurred.');
        console.error(`${colors.red}${error.message}${colors.reset}`);
    }
}
