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
    panel.querySelector('[data-label]').textContent = `${s.level} · ${LEVELS[s.level].name}`;
    const prompt = buildPrompt(s);
    panel.querySelector('[data-preview]').textContent = prompt || '已关闭，不注入提示词。';
    const tokens = estimateTokens(s.enabled && !duplicate ? prompt : '');
    panel.querySelector('[data-tokens]').textContent = `每次剧情生成约 ${tokens.approximate} 输入 tokens（粗估 ${tokens.low}–${tokens.high}）`;
    const status = !s.enabled ? '已关闭' : duplicate ? '检测到另一份同标记提示词，已暂停本扩展注入' : '已启用 · 下次剧情生成生效';
    if (status !== lastStatus) {
        panel.querySelector('[data-status]').textContent = status;
        lastStatus = status;
    }
}
function mount() {
    if (disposed || document.getElementById(KEY)) return;
    const host = document.querySelector('#send_form');
    const fallback = document.querySelector('#extensions_settings2') || document.querySelector('#extensions_settings');
    if (!host && !fallback) {
        console.warn('[NPC Initiative Knob] UI host missing; extension was not activated.');
        return false;
    }
    panel = document.createElement('section');
    panel.id = KEY;
    panel.setAttribute('aria-label', 'NPC 主动性旋钮');
    panel.innerHTML = `
        <div class="npc-knob-row">
            <label class="npc-knob-switch"><input type="checkbox" data-enabled> NPC 主动性</label>
            <output data-label></output>
        </div>
        <label class="npc-knob-range">静待 <input type="range" min="1" max="5" step="1" data-level aria-label="NPC 主动性等级"> 主动</label>
        <details>
            <summary>设置与用量</summary>
            <p data-status role="status" aria-live="polite"></p>
            <label class="npc-knob-switch"><input type="checkbox" data-supplement> 配合已有叙事预设（推荐）</label>
            <p class="npc-knob-note">只补充主动性与节奏；若已有类似控制扩展，请只启用其中一个。设置对当前账号的所有聊天生效。</p>
            <p data-tokens></p>
            <p class="npc-knob-note">调滑块不调用模型、不产生生成费用。发送、重生成、换回复、续写会再次带入；后台静默任务和代写用户消息不注入。估算不含聊天、预设、模型回复及格式开销，也不代表缓存后的计费量。</p>
            <details><summary>查看提示词</summary><pre data-preview></pre></details>
        </details>`;
    if (host) host.before(panel);
    else fallback.append(panel);
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
    panel?.remove();
    panel = undefined;
}
const ctx = context();
const types = ctx?.eventTypes || ctx?.event_types;
if (ctx?.setExtensionPrompt && ctx?.extensionSettings && ctx?.saveSettingsDebounced && ctx?.eventSource && types?.APP_READY && types?.GENERATION_AFTER_COMMANDS) {
    subscribe(types.APP_READY, initialize);
} else {
    console.error('[NPC Initiative Knob] Required SillyTavern APIs unavailable. No prompt was injected.');
}
