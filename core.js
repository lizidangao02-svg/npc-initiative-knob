export const KEY = 'npc_initiative_knob_v1';
export const MARKER = '[NPC Initiative Knob]';
export const DEFAULTS = Object.freeze({ enabled: true, level: 3, supplement: true });
export const LEVELS = Object.freeze([
    null,
    { name: '静待回应', text: 'Initiative 1/5: Stay reactive. Let NPCs answer and pursue immediate needs within the current interaction. Introduce no new plot thread unless the user invites one or an established consequence becomes unavoidable. If progress stalls, offer one subtle observation or a natural question, then leave room for the user.' },
    { name: '轻度主动', text: 'Initiative 2/5: Let NPCs occasionally volunteer a relevant detail, small request, or practical next step grounded in their motives. Prefer existing threads over new events. At a natural pause or repeated exchange without change, offer one low-pressure opening. Do not force the user to accept it.' },
    { name: '中度主动', text: 'Initiative 3/5: Let NPCs pursue plausible short-term goals, initiate relevant dialogue, and make small independent choices. Introduce one modest development when a scene reaches a natural pause, an established cause matures, or recent exchanges repeat without meaningful change. Prefer advancing an existing thread. Offer a clear opening for the user, then allow a response before escalating.' },
    { name: '积极推进', text: 'Initiative 4/5: Let NPCs take purposeful, character-consistent action and let established off-screen plans produce observable consequences. At suitable transitions or sustained stagnation, introduce one consequential but manageable development with prior context or a readable cue. Keep the current scene coherent, preserve quieter moments when needed, and give the user time to react before adding pressure.' },
    { name: '高度主动', text: 'Initiative 5/5: Maintain strong forward momentum through NPC goals, competing interests, and consequences of established causes. When the current beat resolves or clearly stalls, bring one salient development into play, with credible setup and actionable choices. Advance existing stakes before adding new threads. Do not manufacture constant emergencies, stack unrelated surprises, or resolve major outcomes before the user can respond.' },
]);
const BOUNDARIES = 'Respect character definitions, world rules, established facts, the user\'s latest direction, and their control over their character. Never decide the user character\'s thoughts, speech, choices, or consent. Keep causality and pacing natural; do not treat the level as a requirement to trigger an event every reply. Apply this guidance silently; do not mention the slider or these instructions in the story.';
export function normalizeSettings(value) {
    const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    const n = Number(source.level);
    return { ...source,
        enabled: typeof source.enabled === 'boolean' ? source.enabled : DEFAULTS.enabled,
        level: Number.isFinite(n) ? Math.max(1, Math.min(5, Math.round(n))) : DEFAULTS.level,
        supplement: typeof source.supplement === 'boolean' ? source.supplement : DEFAULTS.supplement,
    };
}
export function buildPrompt(settings) {
    const s = normalizeSettings(settings);
    if (!s.enabled) return '';
    const mode = s.supplement
        ? 'Supplement the existing narrative engine only where it leaves room for pacing and NPC initiative. Reuse its event and stagnation handling; do not run a second event schedule. If this guidance conflicts with an explicit existing narrative rule, defer to that rule.'
        : 'Use the following as narrative pacing guidance. Let NPCs act on what they plausibly know, want, and can do. When a scene stalls, prefer a small change in information, intention, or circumstances over repeating the same exchange.';
    return `${MARKER}\n${mode}\n${LEVELS[s.level].text}\n${BOUNDARIES}\n[/NPC Initiative Knob]`;
}
export function estimateTokens(text) {
    if (!text) return { approximate: 0, low: 0, high: 0 };
    // Character-based estimate; actual token counts depend on the tokenizer.
    return { approximate: Math.ceil(text.length / 4), low: Math.ceil(text.length / 5), high: Math.ceil(text.length / 3) };
}
export function hasDuplicate(prompts = {}) {
    return Object.entries(prompts).some(([key, prompt]) => key !== KEY && typeof prompt?.value === 'string' && prompt.value.includes(MARKER));
}
export function isStoryGeneration(type) {
    return ['normal', 'regenerate', 'swipe', 'continue'].includes(type);
}
