import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startStaticServer, startPpssppServer, launchBrowser, rootDir } from './test_helper.mjs';

test('AC-4.1: Vendored ringbuf.js, AudioWorklet Processor, and AudioBridge Bounded Stereo Ring Drain', async () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
    assert.ok(pkg.dependencies?.['ringbuf.js'], 'package.json must declare ringbuf.js dependency');
    assert.ok(fs.existsSync(path.join(rootDir, 'web', 'vendor', 'ringbuf.js')), 'web/vendor/ringbuf.js must exist');
    assert.ok(fs.existsSync(path.join(rootDir, 'web', 'audio_worklet.js')), 'web/audio_worklet.js must exist');
    assert.ok(fs.existsSync(path.join(rootDir, 'web', 'audio_bridge.mjs')), 'web/audio_bridge.mjs must exist');

    const prd = fs.readFileSync(path.join(rootDir, 'docs', 'PRD.md'), 'utf8');
    assert.match(prd, /visibilitychange/i, 'docs/PRD.md AC-4.2 must document visibilitychange suspend/resume semantics');

    const { server, url } = await startStaticServer();
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);

        const res = await page.evaluate(async () => {
            // Simulate user gesture via button click so AudioContext unlocks cleanly
            const btn = document.createElement('button');
            document.body.appendChild(btn);
            let bridge = null;
            btn.addEventListener('click', async () => {
                const { createAudioBridge } = await import('/audio_bridge.mjs');
                bridge = await createAudioBridge({ sampleRate: 44100 });
            });
            btn.click();

            const deadline = performance.now() + 4000;
            while (!bridge && performance.now() < deadline) {
                await new Promise((r) => setTimeout(r, 20));
            }
            if (!bridge) throw new Error('AudioBridge failed to initialize on click');

            // Mock a WASM module implementing _ppsspp_stream_drain_audio
            const sab = new SharedArrayBuffer(65536);
            const heapF32 = new Float32Array(sab);
            const mockMod = {
                HEAPU8: new Uint8Array(sab),
                _malloc: () => 1024,
                _free: () => {},
                _ppsspp_stream_drain_audio(ptr, maxFrames) {
                    const base = ptr >> 2;
                    for (let i = 0; i < maxFrames * 2; i++) {
                        heapF32[base + i] = 0.25;
                    }
                    return maxFrames;
                },
            };

            const pushed1 = bridge.pump(mockMod);
            const stats1 = bridge.getStats();
            await bridge.suspend();
            const stateSuspended = bridge.getStats().state;
            await bridge.resume();
            await bridge.close();
            const stateClosed = bridge.getStats().state;

            return {
                pushed1,
                stats1,
                stateSuspended,
                stateClosed,
            };
        });

        assert.ok(res.pushed1 > 0, `Expected non-zero pumped frames, got ${res.pushed1}`);
        assert.ok(res.stats1.capacityFrames > 0 && res.stats1.capacityFrames <= 4800,
            `Expected ~80ms bounded ring buffer <= 4800 frames, got ${res.stats1.capacityFrames}`);
        assert.ok(res.stats1.enqueuedFrames >= res.pushed1, 'enqueuedFrames must reflect pumped stereo PCM');
        assert.equal(res.stateSuspended, 'suspended', 'suspend() must suspend AudioContext');
        assert.equal(res.stateClosed, 'closed', 'close() must close AudioContext');
    } finally {
        await browser.close();
        server.close();
    }
});

test('AC-4.2: Visibility Suspend/Resume and Deterministic Game A -> XMB Menu -> Game B Teardown', async () => {
    const catalogPath = path.join(rootDir, 'dist', 'games.json');
    if (!fs.existsSync(catalogPath)) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    const { proc, url } = await startPpssppServer();
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);
        await page.waitForSelector('.game-card', { state: 'visible' });

        // Boot Game A
        const cards = await page.$$('.game-card');
        await cards[0].click();

        await page.waitForFunction(() => {
            const host = window.__ppssppCoreHost;
            const audio = window.__ppssppAudioBridge;
            return host && host.getFrameCount() >= 2 && audio && audio.getStats().enqueuedFrames > 0;
        }, null, { timeout: 10000 });

        // Simulate tab hide -> audio suspends cleanly without killing the game
        await page.evaluate(async () => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
            document.dispatchEvent(new Event('visibilitychange'));
            await new Promise((r) => setTimeout(r, 80));
        });
        const hiddenState = await page.evaluate(() => window.__ppssppAudioBridge.getStats().state);
        assert.equal(hiddenState, 'suspended', 'visibilitychange=hidden must suspend AudioContext');
        assert.equal(await page.evaluate(() => Boolean(window.__ppssppCoreHost)), true, 'Game must stay alive while hidden');

        // Simulate tab restore -> audio resumes
        await page.evaluate(async () => {
            Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
            document.dispatchEvent(new Event('visibilitychange'));
            await new Promise((r) => setTimeout(r, 80));
        });

        // Trigger XMB Menu exit and confirm AudioBridge + CoreHost + Workers tear down cleanly
        await page.click('#btn-return-menu');
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });
        const afterExit = await page.evaluate(() => ({
            host: window.__ppssppCoreHost,
            audio: window.__ppssppAudioBridge,
            input: window.__ppssppInputBridge,
        }));
        assert.equal(afterExit.host, null);
        assert.equal(afterExit.audio, null);
        assert.equal(afterExit.input, null);

        // Immediately boot Game B and confirm clean re-initialization
        await cards[1].click();
        await page.waitForFunction(() => {
            const host = window.__ppssppCoreHost;
            const audio = window.__ppssppAudioBridge;
            const badge = document.getElementById('badge-iso')?.textContent || '';
            return badge.includes('ULUS-10336') && host && host.getFrameCount() >= 2 && audio && audio.getStats().enqueuedFrames > 0;
        }, null, { timeout: 10000 });

        // Verify low output sample rate (16 kHz, step > 2.0) resamples cleanly without negative buffer underflow
        const lowRateFrames = await page.evaluate(() => {
            const mod = window.__ppssppCoreHost.getModule();
            const ptr = mod._malloc(128 * 2 * 4);
            let total = 0;
            try {
                for (let i = 0; i < 10; i++) {
                    total += mod._ppsspp_stream_drain_audio(ptr, 128, 16000);
                }
            } finally {
                mod._free(ptr);
            }
            return total;
        });
        assert.equal(lowRateFrames, 1280, 'Low-rate 16 kHz audio resampling must drain 10x128 frames cleanly');

        await page.click('#btn-return-menu');
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });
    } finally {
        await browser.close();
        proc.kill('SIGTERM');
    }
});
