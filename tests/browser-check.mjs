// Optional real-browser contract test. This fixture is not a real ST installation.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { KEY } from '../core.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
const files = new Set(['/tests/fixture.html', '/index.js', '/core.js', '/style.css']);
const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (!files.has(path)) { res.writeHead(404).end(); return; }
    try {
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : 'text/html');
        res.end(await readFile(new URL(path.slice(1), root)));
    } catch { res.writeHead(500).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixture.html`);
    await page.waitForFunction(() => window.ready);
    const prompt = () => page.evaluate(key => {
        const p = fixture.ctx.extensionPrompts[key];
        return { value: p?.value, position: p?.position, depth: p?.depth, scan: p?.scan, role: p?.role, active: p?.filter ? p.filter() : false };
    }, KEY);
    assert.match((await prompt()).value, /Initiative 3\/5/);
    assert.equal(await page.locator(`#${KEY}`).count(), 1);
    assert.equal((await prompt()).depth, 1);
    assert.equal((await prompt()).position, 1);
    assert.equal((await prompt()).scan, false);
    assert.equal((await prompt()).role, 0);
    await page.locator('[data-level]').fill('5');
    assert.match((await prompt()).value, /Initiative 5\/5/);
    await page.reload();
    await page.waitForFunction(() => window.ready);
    assert.equal(await page.locator('[data-level]').inputValue(), '5');
    await page.locator('[data-enabled]').uncheck();
    assert.equal((await prompt()).value, '');
    assert.equal(await page.locator('[data-level]').isDisabled(), true);
    await page.locator('[data-enabled]').check();
    for (const type of ['quiet', 'impersonate']) {
        await page.evaluate(type => fixture.emit('GENERATION_AFTER_COMMANDS', type), type);
        assert.equal((await prompt()).value, '');
        await page.evaluate(() => fixture.emit('GENERATION_ENDED'));
        assert.match((await prompt()).value, /Initiative 5\/5/);
    }
    for (const type of ['normal', 'swipe', 'continue', 'regenerate']) {
        await page.evaluate(type => fixture.emit('GENERATION_AFTER_COMMANDS', type), type);
        assert.equal((await prompt()).active, true);
    }
    await page.evaluate(() => {
        fixture.ctx.extensionPrompts.copy = { value: '[NPC Initiative Knob] copied' };
        return fixture.emit('GENERATION_AFTER_COMMANDS', 'normal');
    });
    assert.equal((await prompt()).value, '');
    await page.evaluate(() => { delete fixture.ctx.extensionPrompts.copy; return fixture.emit('CHAT_CHANGED'); });
    assert.match((await prompt()).value, /Initiative 5\/5/);
    assert.equal(await page.evaluate(() => fixture.ctx.extensionPrompts.existing.value), 'Existing engine: preserve this.');
    await page.locator('summary').first().click();
    await page.locator('[data-supplement]').uncheck();
    assert.ok((await prompt()).value.includes('what they plausibly know'));
    await page.locator('[data-supplement]').check();
    await page.locator('[data-level]').fill('3');
    await page.evaluate(() => fixture.emit('APP_READY'));
    assert.equal(await page.locator(`#${KEY}`).count(), 1);
    await page.setViewportSize({ width: 375, height: 812 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.screenshot({ path: fileURLToPath(new URL('../npc-initiative-preview.png', import.meta.url)), fullPage: true });
    await page.evaluate(() => extension.onDisable());
    assert.equal((await prompt()).value, '');
    assert.equal(await page.locator(`#${KEY}`).count(), 0);
    await page.evaluate(() => fixture.emit('GENERATION_AFTER_COMMANDS', 'normal'));
    assert.equal((await prompt()).value, '');
    assert.deepEqual(errors, []);
    console.log('Browser contract checks passed: controls, persistence, request isolation, deduplication, cleanup, 375px layout.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
