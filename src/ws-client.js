import { resolve, extname, join, basename } from 'node:path';
import { colors, ui, Spinner } from './ui.js';
import { notifyClients } from './server.js';
import { readFile, writeFile } from 'node:fs/promises';

const WS_URL = 'wss://latex.taptapp.xyz/ws'; // Production URL

export class TachyonWS {
    constructor(directory, options) {
        this.directory = directory;
        this.options = options;
        this.socket = null;
        this.isConnected = false;
        this.spinner = new Spinner('');
        this.isCompiling = false;
    }

    async connect() {
        return new Promise((res, rej) => {
            ui.info(`${colors.cyan}Connecting to Tachyon-Tex Live Engine...${colors.reset}`);
            this.socket = new WebSocket(this.options.serverUrl || WS_URL);

            this.socket.onopen = () => {
                this.isConnected = true;
                ui.info(`${colors.green}✅ Connected to Live Engine${colors.reset}`);
                res();
            };

            this.socket.onmessage = async (event) => {
                const data = JSON.parse(event.data);

                if (data.type === 'compile_success') {
                    if (this.spinner.timer) {
                        this.spinner.succeed(`${colors.green}PDF updated in ${colors.bold}${data.compile_time_ms}ms${colors.reset}`);
                    }

                    const outputFileName = this.options.output || 'output.pdf';
                    const outputPath = resolve(process.cwd(), outputFileName);

                    // Decode base64 PDF
                    const buffer = Buffer.from(data.pdf, 'base64');
                    await writeFile(outputPath, buffer);

                    // Notify local preview clients
                    notifyClients(outputPath);
                    this.isCompiling = false;
                } else if (data.type === 'compile_error') {
                    if (this.spinner.timer) {
                        this.spinner.fail('Compilation failed');
                    }
                    console.log(`\n${colors.yellow}--- LaTeX Error ---${colors.reset}`);
                    console.log(`${colors.red}${data.error}${colors.reset}`);
                    console.log(`${colors.yellow}-------------------\n${colors.reset}`);
                    this.isCompiling = false;
                }
            };

            this.socket.onerror = (err) => {
                ui.error(`WebSocket Error: ${err.message}`);
                rej(err);
            };

            this.socket.onclose = () => {
                this.isConnected = false;
                ui.warn('WebSocket connection closed. Retrying in 2s...');
                setTimeout(() => this.connect(), 2000);
            };
        });
    }

    async sendProject() {
        if (!this.isConnected || this.isCompiling) return;

        this.isCompiling = true;
        this.spinner = new Spinner(`${colors.blue}Syncing project...`).start();

        try {
            const project = await this.buildProjectPayload();
            this.socket.send(JSON.stringify(project));
        } catch (e) {
            this.spinner.fail(`Failed to sync: ${e.message}`);
            this.isCompiling = false;
        }
    }

    async buildProjectPayload() {
        const absoluteDir = resolve(this.directory);
        const files = await this.getProjectFiles(absoluteDir);
        const payload = {
            main: "main.tex", // Heuristic could be improved
            files: {}
        };

        for (const fileObj of files) {
            const ext = extname(fileObj.path).toLowerCase();
            const textExts = ['.tex', '.sty', '.cls', '.bib', '.txt'];
            const base = basename(fileObj.path);

            if (textExts.includes(ext)) {
                payload.files[fileObj.relative] = await readFile(fileObj.path, 'utf8');
                if (base === 'main.tex') payload.main = fileObj.relative;
            } else {
                // Binary (images)
                const buffer = await readFile(fileObj.path);
                payload.files[fileObj.relative] = buffer.toString('base64');
            }
        }

        return payload;
    }

    async getProjectFiles(dir, baseDir = dir) {
        const { readdir } = await import('node:fs/promises');
        const entries = await readdir(dir, { withFileTypes: true });
        const files = [];

        for (const entry of entries) {
            const res = join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
                    files.push(...(await this.getProjectFiles(res, baseDir)));
                }
            } else {
                const ext = extname(entry.name).toLowerCase();
                const allowed = ['.tex', '.bib', '.sty', '.cls', '.pdf', '.png', '.jpg', '.jpeg'];
                if (allowed.includes(ext)) {
                    files.push({
                        path: res,
                        relative: join(dir.replace(baseDir, ''), entry.name).replace(/^[\\\/]/, '').replace(/\\/g, '/')
                    });
                }
            }
        }
        return files;
    }
}
