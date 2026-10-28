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
    for (const name of ['index.js', 'core.js', 'floating.js']) files.set(`/scripts/extensions/third-party/${folder}/${name}`, name);
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
        const alignToolbar = () => page.addStyleTag({ content: '#top-settings-holder{position:fixed!important;top:0!important;left:16px!important;right:16px!important;width:calc(100% - 32px)!important;max-width:868px!important;margin:auto!important}' });
        const params = new URLSearchParams(options);
        await page.goto(`http://127.0.0.1:${server.address().port}/tests/fixture.html?${params}`);
        await page.waitForFunction(() => window.ready);
        await alignToolbar();
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
        const floating = page.locator(`#${KEY}_floating`);
        const settled = () => page.waitForFunction(key => document.getElementById(key).getAnimations().every(animation => animation.playState !== 'running'), KEY);
        const closed = () => panel.waitFor({ state: 'hidden' });
        const open = async () => {
            if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
            await settled();
        };
        assert.equal(await panel.isVisible(), false);
        assert.equal(await page.locator(`#form_sheld #${KEY}`).count(), 0);
        assert.equal(await page.locator(`#top-settings-holder #${KEY}_toggle`).count(), 0);
        assert.equal(await floating.count(), 1);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
        await toggle.press('Enter');
        await settled();
        assert.equal(await panel.isVisible(), true);
        assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
        await toggle.press('Space');
        await closed();
        assert.equal((await prompt()).active, true);
        await open();
        await page.locator('[data-level]').focus();
        await page.keyboard.press('Escape');
        await closed();
        assert.equal(await toggle.evaluate(el => el === document.activeElement), true);
        await open();
        await page.locator('#send_form textarea').click();
        await closed();
        if (options.toolbar !== '0') {
            await page.locator('#native-toggle-0').click();
            assert.equal(await page.locator('#native-panel-0').isVisible(), true);
            await open();
            assert.equal(await page.locator('#native-panel-0').isVisible(), false);
            await page.locator('#native-toggle-0').click();
            await closed();
            await page.waitForFunction(key => document.getElementById(`${key}_toggle`).getAttribute('aria-expanded') === 'false', KEY);
            await page.evaluate(() => { document.getElementById('native-panel-1').className = 'drawer-content openDrawer pinnedOpen'; });
            await open();
            assert.equal(await page.locator('#native-panel-1').isVisible(), true);
            await page.evaluate(() => { document.getElementById('native-panel-1').className = 'drawer-content closedDrawer'; });
        }
        await toggle.press('Home');
        await floating.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
        const start = await toggle.boundingBox();
        await page.mouse.move(start.x + 26, start.y + 26);
        await page.mouse.down();
        await page.mouse.move(80, 260, { steps: 8 });
        await page.mouse.up();
        await closed();
        await floating.evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
        assert.equal(await toggle.getAttribute('aria-expanded'), 'false', 'Dragging must not open the panel');
        assert.equal(await floating.getAttribute('data-side'), 'left');
        assert.ok(Math.abs((await toggle.boundingBox()).x - 12) < 1);
        const savedPosition = await page.evaluate(key => fixture.ctx.extensionSettings[key].floatingPosition, KEY);
        await toggle.press('ArrowUp');
        assert.ok(await page.evaluate(key => fixture.ctx.extensionSettings[key].floatingPosition.y, KEY) < savedPosition.y);
        await toggle.press('ArrowRight');
        assert.equal(await floating.getAttribute('data-side'), 'right');
        await toggle.press('ArrowLeft');
        const persistedPosition = await page.evaluate(key => fixture.ctx.extensionSettings[key].floatingPosition, KEY);
        // Repeated activation during an unfinished transition must settle in the latest state.
        await toggle.evaluate(el => { el.click(); el.click(); el.click(); });
        await settled();
        assert.equal(await panel.isVisible(), true);
        assert.equal(await panel.evaluate(el => el.inert), false);
        await open();
        await page.locator('[data-level]').fill('5');
        assert.match((await prompt()).value, /Initiative 5\/5/);
        await page.reload();
        await page.waitForFunction(() => window.ready);
        await alignToolbar();
        assert.equal(await panel.isVisible(), false);
        assert.deepEqual(await page.evaluate(key => fixture.ctx.extensionSettings[key].floatingPosition, KEY), persistedPosition);
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
        await page.waitForFunction(key => {
            const r = document.getElementById(key).getBoundingClientRect();
            return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
        }, KEY);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        const bounds = await panel.boundingBox();
        assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 375);
        assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= 812);
        for (const viewport of [{ width: 320, height: 568 }, { width: 812, height: 375 }, { width: 1440, height: 900 }]) {
            await page.setViewportSize(viewport);
            await page.waitForFunction(key => {
                const r = document.getElementById(key).getBoundingClientRect();
                return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
            }, KEY);
            const orb = await toggle.boundingBox();
            assert.ok(orb.x >= 0 && orb.y >= 0 && orb.x + orb.width <= viewport.width && orb.y + orb.height <= viewport.height);
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await toggle.click();
        await closed();
        await toggle.click();
        const motion = await panel.evaluate(el => el.getAnimations().map(animation => ({ duration: animation.effect.getTiming().duration, frames: animation.effect.getKeyframes() })));
        assert.ok(motion.every(animation => animation.duration <= 90 && animation.frames.every(frame => frame.transform === 'none')));
        await settled();
        await page.emulateMedia({ reducedMotion: 'no-preference' });
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
        assert.equal(await floating.count(), 0);
        assert.equal(await toggle.count(), 0);
        await page.evaluate(() => fixture.emit('GENERATION_AFTER_COMMANDS', 'normal'));
        assert.equal((await prompt()).value, '');
        assert.deepEqual(errors, []);
        console.log(`Browser checks passed: ${upstreamContract && options.upstream ? 'ST 1.13.5 source interfaces' : 'context fixture'}, ready=${options.ready}, cleanup=${options.cleanup}.`);
        await context.close();
    }
    const touchContext = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const touchPage = await touchContext.newPage();
    const touchErrors = [];
    touchPage.on('pageerror', error => touchErrors.push(String(error)));
    await touchPage.goto(`http://127.0.0.1:${server.address().port}/tests/fixture.html`);
    await touchPage.waitForFunction(() => window.ready);
    const touchToggle = touchPage.locator(`#${KEY}_toggle`);
    const touchPanel = touchPage.locator(`#${KEY}`);
    const session = await touchContext.newCDPSession(touchPage);
    const touchDrag = async (target, cancel = false) => {
        const box = await touchToggle.boundingBox();
        const start = { x: box.x + 26, y: box.y + 26 };
        await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
        for (let step = 1; step <= 8; step++) {
            await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: start.x + (target.x - start.x) * step / 8, y: start.y + (target.y - start.y) * step / 8 }] });
        }
        await session.send('Input.dispatchTouchEvent', { type: cancel ? 'touchCancel' : 'touchEnd', touchPoints: [] });
        await touchPage.locator(`#${KEY}_floating`).evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    };
    await touchDrag({ x: 40, y: 180 });
    assert.equal(await touchToggle.getAttribute('aria-expanded'), 'false');
    assert.equal(await touchPage.locator(`#${KEY}_floating`).getAttribute('data-side'), 'left');
    const touchSaved = await touchPage.evaluate(key => fixture.ctx.extensionSettings[key].floatingPosition, KEY);
    await touchDrag({ x: 320, y: 600 }, true);
    assert.deepEqual(await touchPage.evaluate(key => fixture.ctx.extensionSettings[key].floatingPosition, KEY), touchSaved);
    await touchToggle.tap();
    await touchPage.waitForFunction(key => document.getElementById(key).getAnimations().every(animation => animation.playState !== 'running'), KEY);
    assert.equal(await touchPanel.isVisible(), true);
    await touchPage.locator('[data-level]').fill('4');
    await touchPanel.locator('summary').first().tap();
    const expanded = await touchPanel.boundingBox();
    assert.ok(expanded.x >= 0 && expanded.y >= 0 && expanded.x + expanded.width <= 375 && expanded.y + expanded.height <= 812);
    // A shorter visible area also covers the constraints imposed by an on-screen keyboard.
    await touchPage.setViewportSize({ width: 375, height: 360 });
    await touchPage.waitForFunction(key => {
        const r = document.getElementById(key).getBoundingClientRect();
        return r.x >= 0 && r.y >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    }, KEY);
    await touchPage.evaluate(() => extension.onDisable());
    assert.equal(await touchToggle.count(), 0);
    assert.deepEqual(touchErrors, []);
    await touchContext.close();
    console.log('Browser checks passed: touch drag, cancellation, docking, mobile controls, and short viewport.');
} finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
}
