import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const webDir = path.resolve(__dirname);
export const rootDir = path.resolve(__dirname, '..');

const CHROME_PATH = process.env.PLAYWRIGHT_CHROME_PATH ||
    path.join(process.env.HOME, '.cache/ms-playwright/chromium-1255/chrome-linux64/chrome');

const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.wasm': 'application/wasm',
    '.data': 'application/octet-stream'
};

export async function startStaticServer({ packDir = null, onRangeBytes = null } = {}) {
    const server = http.createServer((req, res) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('Access-Control-Allow-Origin', '*');

        let reqPath = req.url.split('?')[0];
        let filePath;
        if (packDir && (reqPath === '/manifest.bin' || reqPath.startsWith('/packs/'))) {
            filePath = path.join(packDir, path.basename(reqPath));
        } else if (reqPath.startsWith('/cores/')) {
            const normalized = path.posix.normalize(reqPath);
            filePath = normalized.startsWith('/cores/') ? path.join(rootDir, normalized) : '';
        } else {
            if (reqPath === '/') reqPath = '/index.html';
            filePath = path.join(webDir, reqPath);
        }

        if (!fs.existsSync(filePath)) {
            res.statusCode = 404;
            res.end('Not Found');
            return;
        }

        res.setHeader('Content-Type', MIME_TYPES[path.extname(filePath)] || 'application/octet-stream');

        const rangeHeader = req.headers.range;
        if (rangeHeader) {
            const stat = fs.statSync(filePath);
            const matches = rangeHeader.match(/bytes=(\d+)-(\d+)/);
            if (matches) {
                const start = parseInt(matches[1], 10);
                const end = parseInt(matches[2], 10);
                if (typeof onRangeBytes === 'function') {
                    onRangeBytes(reqPath, end - start + 1);
                }
                res.statusCode = 206;
                res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
                res.setHeader('Content-Length', end - start + 1);
                fs.createReadStream(filePath, { start, end }).pipe(res);
                return;
            }
        }
        fs.createReadStream(filePath).pipe(res);
    });

    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    return { server, url: `http://127.0.0.1:${port}/` };
}

export function launchBrowser() {
    return chromium.launch({
        executablePath: fs.existsSync(CHROME_PATH) ? CHROME_PATH : undefined,
        headless: true,
        args: [
            '--enable-features=SharedArrayBuffer',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });
}

export async function startPpssppServer() {
    const srv = http.createServer();
    await new Promise(r => srv.listen(0, '127.0.0.1', r));
    const port = srv.address().port;
    await new Promise(r => srv.close(r));

    const addr = `127.0.0.1:${port}`;
    const proc = spawn(path.join(rootDir, 'bin', 'ppsspp-server'), [
        '-data-dir', path.join(rootDir, 'dist'),
        '-web-dir', webDir,
        '-cores-dir', path.join(rootDir, 'cores'),
        '-addr', addr
    ], { stdio: 'pipe' });

    await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Timeout starting server')), 8000);
        proc.on('exit', (code) => {
            clearTimeout(timeout);
            reject(new Error(`ppsspp-server exited prematurely with code ${code}`));
        });
        const onData = (d) => {
            if (d.toString().includes('listening')) {
                clearTimeout(timeout);
                resolve();
            }
        };
        proc.stdout.on('data', onData);
        proc.stderr.on('data', onData);
    });

    return { proc, url: `http://${addr}/` };
}
