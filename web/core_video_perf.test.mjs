import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startPpssppServer, startStaticServer, launchBrowser, rootDir } from './test_helper.mjs';

test('AC-2.1 & AC-2.2: WebGL2 Rendering, First-Frame Banner Hiding, HUD Coexistence, and Frame Timing', async () => {
    const coreJs = path.join(rootDir, 'cores', 'ppsspp', 'PPSSPPSDL.js');
    assert.ok(fs.existsSync(coreJs), 'cores/ppsspp/PPSSPPSDL.js must exist');
    assert.ok(fs.existsSync(path.join(rootDir, 'web', 'core_host.mjs')), 'web/core_host.mjs must exist');

    const catalogPath = path.join(rootDir, 'dist', 'games.json');
    if (!fs.existsSync(catalogPath)) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    const { proc, url } = await startPpssppServer();
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
        await page.goto(url);
        await page.waitForSelector('.game-card', { state: 'visible' });

        await page.click('.game-card');
        await page.waitForSelector('#viewport-wrapper', { state: 'visible' });

        // Wait for PPSSPP CoreHost to present its first WebGL2 frame and hide #emu-banner
        await page.waitForFunction(() => {
            const banner = document.getElementById('emu-banner');
            const host = window.__ppssppCoreHost;
            return banner && getComputedStyle(banner).display === 'none' && host && host.getFrameCount() >= 1;
        }, null, { timeout: 10000 });

        // Assert HUD canvas also renders cleanly over the emulator canvas
        await page.waitForFunction(() => {
            const hud = document.getElementById('hud-canvas');
            if (!hud) return false;
            const ctx = hud.getContext('2d');
            const img = ctx.getImageData(15, 15, 40, 20).data;
            for (let i = 3; i < img.length; i += 4) {
                if (img[i] > 0) return true;
            }
            return false;
        }, null, { timeout: 5000 });

        // Capture a PNG screenshot of #emulator-canvas and assert non-blank rendered content
        const emuCanvasHandle = await page.$('#emulator-canvas');
        const shot1 = await emuCanvasHandle.screenshot();
        assert.ok(shot1.byteLength > 1500, `Expected non-blank WebGL2 canvas screenshot, got ${shot1.byteLength} bytes`);

        // Warm 3-second performance window: verify monotonic frame progression & low VFS stall
        const perf = await page.evaluate(async () => {
            const host = window.__ppssppCoreHost;
            const f0 = host.getFrameCount();
            const t0 = performance.now();
            await new Promise((r) => setTimeout(r, 3000));
            const t1 = performance.now();
            const f1 = host.getFrameCount();
            const snap = host.getLatestSnapshot?.() || null;
            return {
                elapsedMs: t1 - t0,
                framesDelta: f1 - f0,
                aspect: (() => {
                    const r = document.getElementById('emulator-canvas').getBoundingClientRect();
                    return r.height > 0 ? r.width / r.height : 0;
                })(),
                totalStallNs: snap ? Number(snap.totalStallNs || 0) : 0
            };
        });

        assert.ok(perf.framesDelta >= 15, `Expected steady frame progress over 3s, got ${perf.framesDelta} frames`);
        assert.ok(Math.abs(perf.aspect - 16 / 9) < 0.08, `Expected 16:9 canvas aspect ratio, got ${perf.aspect}`);
        const stallMs = perf.totalStallNs / 1e6;
        assert.ok(stallMs < perf.elapsedMs * 0.1, `VFS stall (${stallMs}ms) exceeded 10% of ${perf.elapsedMs}ms window`);

        // Resize responsiveness check
        await page.setViewportSize({ width: 800, height: 500 });
        await page.waitForTimeout(150);
        const resizedAspect = await page.evaluate(() => {
            const r = document.getElementById('emulator-canvas').getBoundingClientRect();
            return r.height > 0 ? r.width / r.height : 0;
        });
        assert.ok(Math.abs(resizedAspect - 16 / 9) < 0.08, `Expected 16:9 after resize, got ${resizedAspect}`);

        await page.click('#btn-return-menu');
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });
    } finally {
        await browser.close();
        proc.kill('SIGTERM');
    }
});

test('AC-2.3: WebGL2 Failure Surfaces Error Visibly Without Falling Back to 2D Context', async () => {
    const catalogPath = path.join(rootDir, 'dist', 'games.json');
    if (!fs.existsSync(catalogPath)) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    const { proc, url } = await startPpssppServer();
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.addInitScript(() => {
            window.__emuCanvas2dCalls = 0;
            const origGetContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type, ...args) {
                if (this.id === 'emulator-canvas' && type === '2d') {
                    window.__emuCanvas2dCalls++;
                }
                if (this.id === 'emulator-canvas' && (type === 'webgl2' || type === 'webgl' || type === 'experimental-webgl')) {
                    return null;
                }
                return origGetContext.call(this, type, ...args);
            };
        });

        await page.goto(url);
        await page.waitForSelector('.game-card', { state: 'visible' });
        await page.click('.game-card');
        await page.waitForSelector('#viewport-wrapper', { state: 'visible' });

        await page.waitForFunction(() => {
            const badge = document.getElementById('badge-iso');
            return badge && badge.className.includes('warn') && /webgl2|gl/i.test(badge.textContent || '');
        }, null, { timeout: 10000 });

        const twoDCalls = await page.evaluate(() => window.__emuCanvas2dCalls);
        assert.equal(twoDCalls, 0, 'Emulator canvas must NEVER fall back to a 2D context');
    } finally {
        await browser.close();
        proc.kill('SIGTERM');
    }
});
