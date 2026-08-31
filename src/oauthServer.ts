/**
 * ═══════════════════════════════════════════════════════════════
 * OAuth Local Server
 * ═══════════════════════════════════════════════════════════════
 * 
 * Spins up a temporary local HTTP server on loopback ports 8888-8892
 * to capture the Google OAuth authorization code.
 */

import * as http from 'http';
import * as url from 'url';
import { OAUTH } from './constants';

export class OAuthServer {
    private server: http.Server | null = null;
    private currentPort: number | null = null;

    /**
     * Starts listening on the first available port.
     */
    async start(): Promise<number> {
        this.server = http.createServer();
        this.currentPort = await this.listenOnAvailablePort(OAUTH.PORTS, 0);
        console.log(`[Antigravity Core OAuth] Server started on port ${this.currentPort}`);
        return this.currentPort;
    }

    /**
     * Listens for the OAuth callback request and extracts the authorization code.
     */
    async waitForAuthCode(timeoutMs: number = 3 * 60 * 1000): Promise<string> {
        if (!this.server) {
            throw new Error('OAuth Server has not been started.');
        }

        return new Promise((resolve, reject) => {
            let timeoutHandle: NodeJS.Timeout;

            const cleanup = () => {
                if (timeoutHandle) clearTimeout(timeoutHandle);
                if (this.server) {
                    this.server.close();
                    this.server = null;
                }
            };

            timeoutHandle = setTimeout(() => {
                cleanup();
                reject(new Error('OAuth authentication timed out. Please try again.'));
            }, timeoutMs);

            this.server!.on('request', (req, res) => {
                const reqUrl = url.parse(req.url || '', true);

                if (reqUrl.pathname === OAUTH.REDIRECT_PATH) {
                    const code = reqUrl.query.code as string;
                    const error = reqUrl.query.error as string;

                    if (error) {
                        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(this.getHtmlResponse('Authentication Failed', `Error: ${error}`, false));
                        cleanup();
                        reject(new Error(`OAuth Error: ${error}`));
                        return;
                    }

                    if (code) {
                        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                        res.end(this.getHtmlResponse('Google Account Connected', 'Your account has been connected to Antigravity Core.', true));
                        cleanup();
                        resolve(code);
                        return;
                    }
                } else {
                    res.writeHead(404);
                    res.end();
                }
            });
        });
    }

    private listenOnAvailablePort(ports: readonly number[], index: number): Promise<number> {
        return new Promise((resolve, reject) => {
            if (index >= ports.length) {
                return reject(new Error('No available loopback ports for Google OAuth callback.'));
            }

            const port = ports[index];

            this.server!.once('error', (err: any) => {
                if (err.code === 'EADDRINUSE') {
                    console.log(`[Antigravity Core OAuth] Port ${port} in use, trying next...`);
                    resolve(this.listenOnAvailablePort(ports, index + 1));
                } else {
                    reject(err);
                }
            });

            this.server!.listen(port, '127.0.0.1', () => {
                this.server!.removeAllListeners('error');
                resolve(port);
            });
        });
    }

    private getHtmlResponse(title: string, message: string, isSuccess: boolean): string {
        const color = isSuccess ? '#22c55e' : '#ef4444';
        const icon = isSuccess ? '✓' : '✗';

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Antigravity Core - Google Authentication</title>
                <style>
                    body {
                        background-color: #0D1117;
                        color: #E6EDF3;
                        font-family: system-ui, -apple-system, sans-serif;
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        height: 100vh;
                        margin: 0;
                        padding: 20px;
                        box-sizing: border-box;
                    }
                    .card {
                        background-color: #161B22;
                        padding: 36px 40px;
                        border-radius: 16px;
                        border: 1px solid #30363D;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
                        text-align: center;
                        max-width: 420px;
                        width: 100%;
                    }
                    .icon {
                        width: 50px;
                        height: 50px;
                        border-radius: 50%;
                        background: ${isSuccess ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)'};
                        color: ${color};
                        border: 1px solid ${color};
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        font-size: 26px;
                        margin: 0 auto 16px;
                    }
                    h1 { color: #FFFFFF; font-size: 20px; margin: 0 0 8px 0; }
                    p { color: #8B949E; font-size: 13px; line-height: 1.5; margin: 0 0 24px 0; }
                    .btn {
                        background-color: #0078D4;
                        color: white;
                        border: none;
                        padding: 9px 24px;
                        border-radius: 6px;
                        font-size: 13px;
                        font-weight: 500;
                        cursor: pointer;
                    }
                </style>
            </head>
            <body>
                <div class="card">
                    <div class="icon">${icon}</div>
                    <h1>${title}</h1>
                    <p>${message}<br/><span style="font-size: 11px; color: #6E7681;">You can close this tab and return to Antigravity Core.</span></p>
                    <button class="btn" onclick="window.close()">Close Window</button>
                </div>
                <script>
                    if (${isSuccess}) {
                        setTimeout(() => { try { window.close(); } catch(e) {} }, 2000);
                    }
                </script>
            </body>
            </html>
        `;
    }
}
