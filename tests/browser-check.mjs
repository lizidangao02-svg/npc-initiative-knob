import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { KEY } from '../core.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
let upstreamContract;
if (process.env.ST_SOURCE_DIR) {
    const sourceRoot = process.env.ST_SOURCE_DIR;
    const read = name => readFile(resolve(sourceRoot, name), 'utf8');
    assert.equal(JSON.parse(await read('package.json')).version, '1.13.5');
    const script = await read('script.js');
    const events = await read('events.js');
    const utils = await read('utils.js');
    const extract = (text, pattern) => {
        const match = text.match(pattern);
        assert.ok(match, 'Required upstream definition missing');
        return match[0];
    };
    upstreamContract = [
        await read('eventemitter.js'),
        extract(events, /^export const event_types = \{[\s\S]*?^\};/m),
        extract(script, /^export const extension_prompt_roles = \{[\s\S]*?^\};/m),
        'export let extension_prompts = {};',
        extract(script, /^export function setExtensionPrompt\([^\n]+\) \{[\s\S]*?^\}/m),
        extract(utils, /^export function versionCompare\([^\n]+\) \{[\s\S]*?^\}/m),
        'export function resetPrompts() { extension_prompts = {}; }',
    ].join('\n');
}
const files = new Map([
    ['/tests/fixture.html', 'tests/fixture.html'], ['/style.css', 'style.css'], ['/manifest.json', 'manifest.json'],
]);
for (const folder of ['npc-initiative-knob', 'renamed-knob']) {
    for (const name of ['index.js', 'core.js']) files.set(`/scripts/extensions/third-party/${folder}/${name}`, name);
}
const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
    if (path === '/tests/upstream-contract.js' && upstreamContract) {
        res.setHeader('Content-Type', 'text/javascript');
        res.end(upstreamContract);
        return;
    }
    if (!files.has(path)) { res.writeHead(404).end(); return; }
    try {
        res.setHeader('Content-Type', path.endsWith('.js') ? 'text/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.json') ? 'application/json' : 'text/html');
        res.end(await readFile(new URL(files.get(path), root)));
    } catch { res.writeHead(500).end(); }
});
await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
});
let browser;
try {
    browser = await chromium.launch({ headless: true, ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}) });
    const cases = [
        { ready: 'after', cleanup: 'hook' },
        { ready: 'before', alias: '1', folder: 'renamed-knob', cleanup: 'manager' },
    ];
    if (upstreamContract) cases.push(
        { ready: 'after', upstream: '1', cleanup: 'manager' },
        { ready: 'before', upstream: '1', folder: 'renamed-knob', cleanup: 'manager' },
    );
    for (const options of cases) {
        const context = await browser.newContext({ viewport: { width: 900, height: 800 } });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        const params = new URLSearchParams(options);
        await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixture.html?${params}`);
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
        await page.evaluate(() => { fixture.resetPrompts(); return fixture.emit('CHAT_CHANGED'); });
        assert.match((await prompt()).value, /Initiative 5\/5/);
        await page.locator('summary').first().click();
        await page.locator('[data-supplement]').uncheck();
        assert.ok((await prompt()).value.includes('what they plausibly know'));
        await page.locator('[data-supplement]').check();
        await page.locator('[data-level]').fill('3');
        await page.evaluate(() => fixture.emit('APP_READY'));
        assert.equal(await page.locator(`#${KEY}`).count(), 1);
        await page.setViewportSize({ width: 375, height: 812 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        if (options.cleanup === 'manager') {
            await page.evaluate(folder => { fixture.ctx.extensionSettings.disabledExtensions = [`third-party/${folder}`]; }, options.folder || 'npc-initiative-knob');
            assert.equal((await prompt()).active, false);
            await page.evaluate(() => fixture.emit('SETTINGS_UPDATED'));
        } else {
            await page.evaluate(() => extension.onDisable());
        }
        assert.equal((await prompt()).value, '');
        assert.equal(await page.locator(`#${KEY}`).count(), 0);
        await page.evaluate(() => fixture.emit('GENERATION_AFTER_COMMANDS', 'normal'));
        assert.equal((await prompt()).value, '');
        assert.deepEqual(errors, []);
        console.log(`Browser checks passed: ${upstreamContract && options.upstream ? 'ST 1.13.5 source interfaces' : 'context fixture'}, ready=${options.ready}, cleanup=${options.cleanup}.`);
        await context.close();
    }
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
