import { KEY, LEVELS, normalizeSettings, buildPrompt, estimateTokens, hasDuplicate, isStoryGeneration, extensionNameFromUrl } from './core.js';

// SillyTavern prompt enums: IN_CHAT=1, SYSTEM=0.
const POSITION_IN_CHAT = 1;
const ROLE_SYSTEM = 0;
const extensionName = extensionNameFromUrl(import.meta.url);
const disabledByManager = ctx => !!extensionName && (ctx?.extensionSettings?.disabledExtensions || []).includes(extensionName);
let disposed = false;
let initialized = false;
let suppressed = false;
let panel;
let container;
let trigger;
let drawerObserver;
const uiCleanup = [];
let lastStatus = '';
const subscriptions = [];
const context = () => globalThis.SillyTavern?.getContext?.();

function settings() {
    const ctx = context();
    const next = normalizeSettings(ctx.extensionSettings[KEY]);
    ctx.extensionSettings[KEY] = next;
    return next;
}
function canInject() {
    const ctx = context();
    return !disposed && !suppressed && !!ctx && !disabledByManager(ctx) && settings().enabled && !hasDuplicate(ctx.extensionPrompts);
}
function updatePrompt() {
    const ctx = context();
    if (!ctx?.setExtensionPrompt || !ctx.extensionSettings) return;
    if (disabledByManager(ctx)) {
        onDisable();
        return;
    }
    // One stable key replaces the previous value; never append to a preset or chat log.
    ctx.setExtensionPrompt(KEY, canInject() ? buildPrompt(settings()) : '', POSITION_IN_CHAT, 1, false, ROLE_SYSTEM, canInject);
    render();
}
function persist() {
    context().saveSettingsDebounced();
    updatePrompt();
}
function render() {
    if (!panel) return;
    const s = settings();
    const duplicate = hasDuplicate(context().extensionPrompts);
    panel.querySelector('[data-enabled]').checked = s.enabled;
    const range = panel.querySelector('[data-level]');
    range.value = String(s.level);
    range.disabled = !s.enabled;
    range.setAttribute('aria-valuetext', `${s.level} 级，${LEVELS[s.level].name}`);
    panel.querySelector('[data-supplement]').checked = s.supplement;
    panel.querySelector('[data-label]').textContent = LEVELS[s.level].name;
    panel.querySelector('[data-level-number]').textContent = String(s.level);
    panel.style.setProperty('--npc-progress', `${(s.level - 1) * 25}%`);
    panel.dataset.state = !s.enabled ? 'disabled' : duplicate ? 'paused' : 'enabled';
    if (trigger) trigger.title = `NPC 主动性：${s.enabled ? `${s.level} · ${LEVELS[s.level].name}` : '已关闭'}`;
    const prompt = buildPrompt(s);
    panel.querySelector('[data-preview]').textContent = prompt || '已关闭，不注入提示词。';
    const tokens = estimateTokens(s.enabled && !duplicate ? prompt : '');
    panel.querySelector('[data-tokens]').textContent = `约 ${tokens.approximate} tokens / 次`;
    panel.querySelector('[data-token-range]').textContent = `每次剧情生成增加的输入 tokens，粗估 ${tokens.low}–${tokens.high}。`;
    const status = !s.enabled ? '已关闭' : duplicate ? '检测到另一份同标记提示词，已暂停本扩展注入' : '已启用 · 下次剧情生成生效';
    if (status !== lastStatus) {
        panel.querySelector('[data-status]').textContent = status;
        lastStatus = status;
    }
}
function listen(target, type, handler) {
    target.addEventListener(type, handler);
    uiCleanup.push(() => target.removeEventListener(type, handler));
}
function syncDrawerState() {
    if (!trigger || !panel) return;
    const open = panel.classList.contains('openDrawer');
    trigger.setAttribute('aria-expanded', String(open));
    trigger.classList.toggle('openIcon', open);
    trigger.classList.toggle('closedIcon', !open);
}
function setDrawerOpen(open, restoreFocus = false) {
    if (!trigger || !panel) return;
    if (open) {
        document.querySelectorAll('.openDrawer:not(.pinnedOpen)').forEach(drawer => {
            if (drawer !== panel) {
                drawer.classList.remove('openDrawer');
                drawer.classList.add('closedDrawer');
            }
        });
        document.querySelectorAll('.openIcon:not(.drawerPinnedOpen)').forEach(icon => {
            if (icon !== trigger) {
                icon.classList.remove('openIcon');
                icon.classList.add('closedIcon');
            }
        });
    }
    panel.classList.toggle('openDrawer', open);
    panel.classList.toggle('closedDrawer', !open);
    syncDrawerState();
    if (restoreFocus) trigger.focus();
}
function mount() {
    if (disposed || document.getElementById(KEY)) return;
    const toolbar = document.querySelector('#top-settings-holder');
    const fallback = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    if (!toolbar && !fallback) {
        console.warn('[NPC Initiative Knob] UI host missing; extension was not activated.');
        return false;
    }
    panel = document.createElement('section');
    panel.id = KEY;
    panel.setAttribute('aria-label', 'NPC 主动性旋钮');
    panel.innerHTML = `
        <header class="npc-knob-header">
            <h2>NPC 主动性</h2>
            <label class="npc-knob-enable"><span>启用</span><input type="checkbox" role="switch" data-enabled aria-label="启用 NPC 主动性"></label>
        </header>
        <div class="npc-knob-control">
            <div class="npc-knob-level">
                <span data-label></span>
                <output class="npc-knob-value" for="${KEY}_level"><strong data-level-number></strong><span> / 5</span></output>
            </div>
            <div class="npc-knob-slider">
                <span class="npc-knob-rail" aria-hidden="true"><span></span></span>
                <input id="${KEY}_level" type="range" min="1" max="5" step="1" data-level aria-label="NPC 主动性等级">
            </div>
            <div class="npc-knob-scale" aria-hidden="true"><span>静待回应</span><span>高度主动</span></div>
            <p class="npc-knob-status" data-status role="status" aria-live="polite"></p>
        </div>
        <details class="npc-knob-settings">
            <summary><span>设置与用量</span><span class="npc-knob-cost" data-tokens></span><svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary>
            <div class="npc-knob-settings-body">
                <label class="npc-knob-option"><input type="checkbox" data-supplement><span>配合已有叙事预设</span></label>
                <p class="npc-knob-note">只补充主动性与节奏；若已有类似控制扩展，请只启用其中一个。设置对当前账号的所有聊天生效。</p>
                <p class="npc-knob-note" data-token-range></p>
                <p class="npc-knob-note">调滑块不调用模型、不产生生成费用。发送、重生成、换回复、续写会再次带入；后台静默任务和代写用户消息不注入。估算不含聊天、预设、模型回复及格式开销，也不代表缓存后的计费量。</p>
                <details class="npc-knob-preview"><summary>查看提示词<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary><pre data-preview></pre></details>
            </div>
        </details>`;
    container = document.createElement(toolbar ? 'div' : 'details');
    container.id = `${KEY}_drawer`;
    if (toolbar) {
        container.className = 'drawer npc-knob-drawer';
        trigger = document.createElement('button');
        trigger.type = 'button';
        trigger.id = `${KEY}_toggle`;
        trigger.className = 'drawer-icon npc-knob-trigger closedIcon';
        trigger.setAttribute('aria-label', 'NPC 主动性');
        trigger.setAttribute('aria-controls', KEY);
        trigger.setAttribute('aria-expanded', 'false');
        trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></svg>';
        panel.classList.add('drawer-content', 'npc-knob-dropdown', 'closedDrawer');
        container.append(trigger, panel);
        toolbar.append(container);
        listen(trigger, 'click', () => setDrawerOpen(!panel.classList.contains('openDrawer')));
        const closeOutside = event => {
            if (!container.contains(event.target)) setDrawerOpen(false);
        };
        listen(document, 'pointerdown', closeOutside);
        listen(document, 'click', closeOutside);
        listen(document, 'keydown', event => {
            if (event.key === 'Escape' && panel.classList.contains('openDrawer')) {
                setDrawerOpen(false, true);
                event.preventDefault();
            }
        });
        drawerObserver = new MutationObserver(syncDrawerState);
        drawerObserver.observe(panel, { attributes: true, attributeFilter: ['class'] });
    } else {
        container.className = 'npc-knob-fallback';
        const summary = document.createElement('summary');
        summary.textContent = 'NPC 主动性';
        container.append(summary, panel);
        fallback.append(container);
    }
    panel.querySelector('[data-enabled]').addEventListener('change', event => {
        settings().enabled = event.target.checked;
        persist();
    });
    panel.querySelector('[data-level]').addEventListener('input', event => {
        settings().level = Number(event.target.value);
        persist();
    });
    panel.querySelector('[data-supplement]').addEventListener('change', event => {
        settings().supplement = event.target.checked;
        persist();
    });
    return true;
}
function subscribe(type, handler) {
    const ctx = context();
    if (type) {
        subscriptions.push([type, handler]);
        ctx.eventSource.on(type, handler);
    }
}
function initialize() {
    if (initialized || disposed) return;
    if (!mount()) return;
    initialized = true;
    settings();
    context().saveSettingsDebounced();
    const types = context().eventTypes || context().event_types;
    subscribe(types.CHAT_CHANGED, () => { suppressed = false; updatePrompt(); });
    subscribe(types.GENERATION_AFTER_COMMANDS, type => {
        suppressed = !isStoryGeneration(type);
        updatePrompt();
    });
    subscribe(types.GENERATION_ENDED, () => { suppressed = false; updatePrompt(); });
    subscribe(types.GENERATION_STOPPED, () => { suppressed = false; updatePrompt(); });
    subscribe(types.SETTINGS_UPDATED, updatePrompt);
    updatePrompt();
}
export function onDisable() {
    disposed = true;
    const ctx = context();
    for (const [type, handler] of subscriptions) ctx?.eventSource?.removeListener?.(type, handler);
    subscriptions.length = 0;
    ctx?.setExtensionPrompt?.(KEY, '', POSITION_IN_CHAT, 1, false, ROLE_SYSTEM);
    drawerObserver?.disconnect();
    drawerObserver = undefined;
    for (const cleanup of uiCleanup.splice(0)) cleanup();
    container?.remove();
    container = undefined;
    trigger = undefined;
    panel = undefined;
}
const ctx = context();
const types = ctx?.eventTypes || ctx?.event_types;
if (ctx?.setExtensionPrompt && ctx?.extensionSettings && ctx?.saveSettingsDebounced && ctx?.eventSource && types?.APP_READY && types?.GENERATION_AFTER_COMMANDS) {
    subscribe(types.APP_READY, initialize);
} else {
    console.error('[NPC Initiative Knob] Required SillyTavern APIs unavailable. No prompt was injected.');
}
