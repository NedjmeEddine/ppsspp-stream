import test from 'node:test';
import assert from 'node:assert/strict';
import { startStaticServer, launchBrowser } from './test_helper.mjs';

test('PSP Launcher UI Loads Cleanly Without Catalog', async () => {
    const { server, url } = await startStaticServer();
    const browser = await launchBrowser();

    try {
        const page = await browser.newPage();
        await page.goto(url);

        assert.ok(await page.$('#home'), '#home must exist');
        assert.ok(await page.$('#game-grid'), '#game-grid must exist');
        const viewport = await page.$('#viewport-wrapper');
        assert.equal(await viewport.isVisible(), false);
    } finally {
        await browser.close();
        server.close();
    }
});
