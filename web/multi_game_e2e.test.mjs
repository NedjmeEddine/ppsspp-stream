import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { startPpssppServer, launchBrowser, rootDir } from './test_helper.mjs';

test('Multi-Game PSP UMD Catalog, Range Streaming & Identification E2E', async () => {
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
        const cards = await page.$$('.game-card');
        assert.equal(cards.length, 2, 'Catalog must render 2 mock PSP games');

        await cards[0].click();
        await page.waitForSelector('#viewport-wrapper', { state: 'visible' });
        await page.waitForFunction(() => {
            const b = document.getElementById('badge-iso')?.textContent || '';
            return b.includes('UCUS-98653');
        }, { timeout: 5000 });

        await (await page.$('#btn-return-menu')).click();
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });

        await cards[1].click();
        await page.waitForSelector('#viewport-wrapper', { state: 'visible' });
        await page.waitForFunction(() => {
            const b = document.getElementById('badge-iso')?.textContent || '';
            return b.includes('ULUS-10336');
        }, { timeout: 5000 });

        await (await page.$('#btn-return-menu')).click();
        await page.waitForSelector('#viewport-wrapper', { state: 'hidden' });
    } finally {
        await browser.close();
        proc.kill('SIGTERM');
    }
});
