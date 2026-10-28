import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { KEY } from '../core.js';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = new URL('../', import.meta.url);
let upstreamContract;
let upstreamStyle;
let upstreamJQuery;
if (process.env.ST_SOURCE_DIR) {
    const sourceRoot = process.env.ST_SOURCE_DIR;
    const read = name => readFile(resolve(sourceRoot, name), 'utf8');
    assert.equal(JSON.parse(await read('package.json')).version, '1.13.5');
    const script = await read('script.js');
    const events = await read('events.js');
    const utils = await read('utils.js');
    const style = await read('style.css');
    upstreamStyle = style.slice(style.indexOf('#top-settings-holder {'), style.indexOf('body.movingUI .inline-drawer-maximize'));
    upstreamJQuery = await read('jquery-3.5.1.min.js');
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
        'const animation_duration = 0; const isExportPopupOpen = false;',
        extract(script, /^export async function doNavbarIconClick\([^\n]*\) \{[\s\S]*?^\}/m),
        'export function bindNativeDrawerEvents() {\n' + extract(script, /\$\('html'\)\.on\('touchstart mousedown', async function \(e\) \{[\s\S]*?^    \}\);/m) + '\n}',
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
    if (path === '/tests/upstream-style.css' && upstreamStyle) {
        res.setHeader('Content-Type', 'text/css'); res.end(upstreamStyle); return;
    }
    if (path === '/tests/upstream-jquery.js' && upstreamJQuery) {
        res.setHeader('Content-Type', 'text/javascript'); res.end(upstreamJQuery); return;
    }
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
        { ready: 'after', toolbar: '0', cleanup: 'hook' },
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
        const panel = page.locator(`#${KEY}`);
        const toggle = page.locator(`#${KEY}_toggle`);
        const open = async () => {
            if (!await panel.isVisible()) {
                if (options.toolbar === '0') await page.locator(`#${KEY}_drawer > summary`).click();
                else await toggle.click();
            }
        };
        assert.equal(await panel.isVisible(), false);
        assert.equal(await page.locator(`#form_sheld #${KEY}`).count(), 0);
        if (options.toolbar !== '0') {
            assert.equal(await page.locator(`#top-settings-holder #${KEY}_toggle`).count(), 1);
            assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
            await toggle.press('Enter');
            assert.equal(await panel.isVisible(), true);
            assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
            await toggle.press('Space');
            assert.equal(await panel.isVisible(), false);
            assert.equal((await prompt()).active, true);
            await open();
            await page.locator('[data-level]').focus();
            await page.keyboard.press('Escape');
            assert.equal(await panel.isVisible(), false);
            assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
            await open();
            await page.locator('#chat').click();
            assert.equal(await panel.isVisible(), false);
            await page.locator('#native-toggle-0').click();
            assert.equal(await page.locator('#native-panel-0').isVisible(), true);
            await open();
            assert.equal(await page.locator('#native-panel-0').isVisible(), false);
            await page.locator('#native-toggle-0').click();
            assert.equal(await panel.isVisible(), false);
            await page.waitForFunction(key => document.getElementById(`${key}_toggle`).getAttribute('aria-expanded') === 'false', KEY);
            await page.evaluate(() => { document.getElementById('native-panel-1').className = 'drawer-content openDrawer pinnedOpen'; });
            await open();
            assert.equal(await page.locator('#native-panel-1').isVisible(), true);
            await page.evaluate(() => { document.getElementById('native-panel-1').className = 'drawer-content closedDrawer'; });
        } else {
            assert.equal(await toggle.count(), 0);
        }
        await open();
        await page.locator('[data-level]').fill('5');
        assert.match((await prompt()).value, /Initiative 5\/5/);
        await page.reload();
        await page.waitForFunction(() => window.ready);
        assert.equal(await panel.isVisible(), false);
        await open();
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
        await panel.locator('summary').first().click();
        await page.locator('[data-supplement]').uncheck();
        assert.ok((await prompt()).value.includes('what they plausibly know'));
        await page.locator('[data-supplement]').check();
        await page.locator('[data-level]').fill('3');
        await page.evaluate(() => fixture.emit('APP_READY'));
        assert.equal(await page.locator(`#${KEY}`).count(), 1);
        await page.setViewportSize({ width: 375, height: 812 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const bounds = await panel.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375);
        if (options.toolbar !== '0') assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 812);
        if (process.env.PREVIEW_PATH && options.upstream && options.ready === 'after') {
            await page.screenshot({ path: process.env.PREVIEW_PATH, fullPage: true });
        }
        if (options.cleanup === 'manager') {
            await page.evaluate(folder => { fixture.ctx.extensionSettings.disabledExtensions = [`third-party/${folder}`]; }, options.folder || 'npc-initiative-knob');
            assert.equal((await prompt()).active, false);
            await page.evaluate(() => fixture.emit('SETTINGS_UPDATED'));
        } else {
            await page.evaluate(() => extension.onDisable());
        }
        assert.equal((await prompt()).value, '');
        assert.equal(await page.locator(`#${KEY}`).count(), 0);
        assert.equal(await page.locator(`#${KEY}_drawer`).count(), 0);
        assert.equal(await toggle.count(), 0);
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
