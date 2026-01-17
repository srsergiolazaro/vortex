import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

let clients = new Set();
let currentPdfPath = '';

export function startServer(port = 4848) {
    try {
        const server = Bun.serve({
            port,
            fetch(req, server) {
                const url = new URL(req.url);

                // WebSocket endpoint
                if (url.pathname === '/') {
                    if (server.upgrade(req)) return;
                    return new Response('qtex server is running', { status: 200 });
                }

                // View PDF endpoint (HTML Wrapper)
                if (url.pathname === '/view') {
                    return new Response(`
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>qtex Preview</title>
                            <style>
                                body, html { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #202124; }
                                iframe { width: 100%; height: 100%; border: none; }
                            </style>
                        </head>
                        <body>
                            <iframe id="viewer" src="/pdf?t=${Date.now()}"></iframe>
                            <script>
                                const ws = new WebSocket('ws://' + window.location.host);
                                ws.onmessage = (event) => {
                                    const data = JSON.parse(event.data);
                                    if (data.type === 'reload') {
                                        console.log('Reloading PDF...');
                                        document.getElementById('viewer').src = '/pdf?t=' + Date.now();
                                    }
                                };
                                ws.onopen = () => console.log('Connected to qtex live-reload server');
                                ws.onclose = () => setTimeout(() => window.location.reload(), 2000);
                            </script>
                        </body>
                        </html>
                    `, { headers: { 'Content-Type': 'text/html' } });
                }

                // Raw PDF endpoint
                if (url.pathname === '/pdf') {
                    if (!currentPdfPath) {
                        return new Response('No PDF generated yet', { status: 404 });
                    }
                    return new Response(Bun.file(currentPdfPath), {
                        headers: {
                            'Content-Type': 'application/pdf',
                            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
                            'Pragma': 'no-cache',
                            'Expires': '0',
                        }
                    });
                }

                return new Response('Not found', { status: 404 });
            },
            websocket: {
                open(ws) {
                    clients.add(ws);
                },
                close(ws) {
                    clients.delete(ws);
                },
                message(ws, message) { }
            }
        });
        return server;
    } catch (e) {
        if (e.code === 'EADDRINUSE') {
            return startServer(port + 1);
        }
        throw e;
    }
}

export function notifyExtension(pdfPath) {
    currentPdfPath = pdfPath;
    const message = JSON.stringify({ type: 'reload' });
    for (const client of clients) {
        client.send(message);
    }
}
