import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startStaticServer, launchBrowser, rootDir } from './test_helper.mjs';

test('PSP Worker A BlockDevice Sector Reader & ISO9660 Identifier', async () => {
    const gowPackDir = path.join(rootDir, 'dist', 'games', 'gow_coo');
    if (!fs.existsSync(path.join(gowPackDir, 'manifest.bin'))) {
        execFileSync(process.execPath, [path.join(rootDir, 'scripts', 'gen_mock_psp.mjs')], { stdio: 'inherit' });
    }

    const { server, url } = await startStaticServer({ packDir: gowPackDir });
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);

        const result = await page.evaluate(async () => {
            const channel = new MessageChannel();
            const workerA = new Worker('worker_a.js', { type: 'module' });
            const workerB = new Worker('worker_b.js', { type: 'module' });

            workerA.postMessage({ type: 'PORT', port: channel.port1 }, [channel.port1]);
            workerB.postMessage({ type: 'PORT', port: channel.port2 }, [channel.port2]);

            let nextMsgId = 1;
            function sendA(msg) {
                return new Promise((resolve, reject) => {
                    const id = nextMsgId++;
                    const onMsg = (e) => {
                        if (e.data && e.data.id === id) {
                            workerA.removeEventListener('message', onMsg);
                            resolve(e.data);
                        }
                    };
                    workerA.addEventListener('message', onMsg);
                    workerA.postMessage({ ...msg, id });
                    setTimeout(() => reject(new Error(`Timeout waiting for ${msg.type}`)), 5000);
                });
            }

            await new Promise((resolve, reject) => {
                workerB.addEventListener('message', (e) => {
                    if (e.data?.type === 'STATUS' && e.data.phase === 'running') resolve();
                });
                setTimeout(() => reject(new Error('Timeout waiting for Worker B')), 5000);
            });

            const openRes = await sendA({ type: 'DISC_OPEN', path: 'game.iso' });
            const secRes = await sendA({ type: 'DISC_READ_SECTORS', minSector: 16, count: 1 });
            const idRes = await sendA({ type: 'DISC_IDENTIFY' });
            const closeRes = await sendA({ type: 'DISC_CLOSE' });

            workerA.terminate();
            workerB.terminate();

            return {
                openOk: openRes.ok,
                sectors: Number(openRes.sectors),
                secBytes: secRes.bytes.byteLength,
                identified: idRes,
                closeOk: closeRes.ok
            };
        });

        assert.equal(result.openOk, true);
        assert.equal(result.sectors, 512);
        assert.equal(result.secBytes, 2048);
        assert.equal(result.identified.ok, true);
        assert.equal(result.identified.platform, 'psp');
        assert.equal(result.identified.discId, 'UCUS-98653');
        assert.equal(result.closeOk, true);
    } finally {
        await browser.close();
        server.close();
    }
});
