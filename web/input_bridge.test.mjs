import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startStaticServer, startPpssppServer, launchBrowser, rootDir } from './test_helper.mjs';

test('AC-3.1 & AC-3.2: InputBridge Non-Overlapping Key/Gamepad Mapping, Blur Clear, and Listener Cleanup', async () => {
    assert.ok(fs.existsSync(path.join(rootDir, 'web', 'input_bridge.mjs')), 'web/input_bridge.mjs must exist');

    const { server, url } = await startStaticServer();
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);

        const res = await page.evaluate(async () => {
            const { PSP_BUTTONS, createInputBridge } = await import('/input_bridge.mjs');

            const maskValues = Object.values(PSP_BUTTONS);
            let combined = 0;
            let allPowersOfTwo = maskValues.length >= 12;
            for (const v of maskValues) {
                if (typeof v !== 'number' || v <= 0 || (v & (v - 1)) !== 0 || (combined & v) !== 0) {
                    allPowersOfTwo = false;
                }
                combined |= v;
            }

            let gamepadAxes = [0, 0, 0, 0];
            let gamepadPressed = [];
            Object.defineProperty(navigator, 'getGamepads', {
                configurable: true,
                value: () => [{
                    connected: true,
                    axes: gamepadAxes,
                    buttons: Array.from({ length: 16 }, (_, idx) => ({
                        pressed: gamepadPressed.includes(idx),
                        value: gamepadPressed.includes(idx) ? 1 : 0,
                    })),
                }],
            });

            const events = [];
            const bridge = createInputBridge({
                target: window,
                onInput: (buttons, lx, ly) => events.push({ buttons, lx, ly }),
            });

            // 1. Key tracking by e.code (non-overlapping combinations)
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowUp' }));
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyE' }));
            bridge.poll();
            const s1 = bridge.getState();

            // 2. Gamepad deadzone (<0.15) centers cleanly at (128, 128)
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'ArrowUp' }));
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyZ' }));
            window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyE' }));
            gamepadAxes = [0.08, -0.1, 0, 0];
            bridge.poll();
            const sDeadzone = bridge.getState();

            // 3. Gamepad analog + face button outside deadzone
            gamepadAxes = [-1.0, 0.75, 0, 0];
            gamepadPressed = [0, 9]; // A -> Cross, Start -> Start
            bridge.poll();
            const sGamepad = bridge.getState();

            // 4. Re-hold keyboard, then trigger window.blur -> immediate reset to (0, 128, 128)
            gamepadAxes = [0, 0, 0, 0];
            gamepadPressed = [];
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyX' }));
            bridge.poll();
            const sBeforeBlur = bridge.getState();
            window.dispatchEvent(new Event('blur'));
            const sAfterBlur = bridge.getState();

            // 5. destroy() stops further key events from mutating state or invoking onInput
            const countBeforeDestroy = events.length;
            bridge.destroy();
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyZ' }));
            const eventsAfterDestroy = events.length - countBeforeDestroy;

            return {
                buttonCount: maskValues.length,
                allPowersOfTwo,
                s1,
                expectedS1Buttons: PSP_BUTTONS.UP | PSP_BUTTONS.CROSS | PSP_BUTTONS.R,
                sDeadzone,
                sGamepad,
                expectedGamepadButtons: PSP_BUTTONS.CROSS | PSP_BUTTONS.START,
                sBeforeBlur,
                sAfterBlur,
                eventsAfterDestroy,
            };
        });

        assert.equal(res.allPowersOfTwo, true, 'All PSP_BUTTONS masks must be unique powers of 2');
        assert.equal(res.s1.buttons, res.expectedS1Buttons, 'ArrowUp+KeyZ+KeyE must map to UP|CROSS|R');
        assert.deepEqual(res.sDeadzone, { buttons: 0, lx: 128, ly: 128 }, 'Small stick deflection inside deadzone must center at (128,128)');
        assert.equal(res.sGamepad.buttons, res.expectedGamepadButtons, 'Gamepad buttons 0+9 must map to CROSS|START');
        assert.ok(res.sGamepad.lx >= 0 && res.sGamepad.lx < 32, `Left full analog expected near 0, got ${res.sGamepad.lx}`);
        assert.ok(res.sGamepad.ly > 190 && res.sGamepad.ly <= 255, `Down-ish analog expected >190, got ${res.sGamepad.ly}`);
        assert.notEqual(res.sBeforeBlur.buttons, 0);
        assert.deepEqual(res.sAfterBlur, { buttons: 0, lx: 128, ly: 128 }, 'window.blur must clear held buttons & center analog');
        assert.equal(res.eventsAfterDestroy, 0, 'destroy() must unregister all keyboard/blur listeners');
    } finally {
        await browser.close();
        server.close();
    }
});

test('AC-3.1 & AC-3.2: PPSSPPSDL Exports _ppsspp_stream_set_input & Index Lifecycle Clears/Cleans Listeners', async () => {
    const patchPath = path.join(rootDir, 'cores', 'ppsspp', 'patches', '0002-input-and-audio-hooks.patch');
    assert.ok(fs.existsSync(patchPath), '0002-input-and-audio-hooks.patch must exist');

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

        await page.click('.game-card');
        await page.waitForFunction(() => {
            const host = window.__ppssppCoreHost;
            return host && host.getFrameCount() >= 1 && window.__ppssppInputBridge;
        }, null, { timeout: 10000 });

        const check1 = await page.evaluate(async () => {
            const mod = window.__ppssppCoreHost.getModule();
            const hasCAbi = typeof mod?._ppsspp_stream_set_input === 'function';
            window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter' }));
            await new Promise((r) => setTimeout(r, 50));
            const held = window.__ppssppInputBridge.getState();
            window.dispatchEvent(new Event('blur'));
            const cleared = window.__ppssppInputBridge.getState();
            return { hasCAbi, held, cleared };
        });

        assert.equal(check1.hasCAbi, true, 'PPSSPPSDL must export _ppsspp_stream_set_input');
        assert.notEqual(check1.held.buttons, 0, 'Enter keydown must register Start button while running');
        assert.deepEqual(check1.cleared, { buttons: 0, lx: 128, ly: 128 }, 'Blur must clear live input state');

        await page.click('#btn-return-menu');
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });

        const bridgeAfterExit = await page.evaluate(() => window.__ppssppInputBridge);
        assert.equal(bridgeAfterExit, null, 'exitToMenu must destroy and null out window.__ppssppInputBridge');
    } finally {
        await browser.close();
        proc.kill('SIGTERM');
    }
});
