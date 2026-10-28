import test from 'node:test';
import assert from 'node:assert/strict';
import { KEY, MARKER, normalizeSettings, buildPrompt, estimateTokens, hasDuplicate, isStoryGeneration } from '../core.js';

test('new user defaults to enabled level 3 and supplement mode', () => {
    assert.deepEqual(normalizeSettings(), { enabled: true, level: 3, supplement: true });
    assert.equal(normalizeSettings({ level: 99 }).level, 5);
    assert.equal(normalizeSettings({ level: -1 }).level, 1);
    assert.equal(normalizeSettings({ level: 'oops', enabled: 'false' }).level, 3);
    assert.equal(normalizeSettings({ custom: 'keep me' }).custom, 'keep me');
});
test('five initiative levels preserve player agency and pacing constraints', () => {
    const prompts = Array.from({ length: 5 }, (_, i) => buildPrompt({ level: i + 1 }));
    assert.equal(new Set(prompts).size, 5);
    for (const [i, p] of prompts.entries()) {
        assert.match(p, new RegExp(`Initiative ${i + 1}/5`));
        assert.ok(p.includes("Never decide the user character's"));
        assert.ok(p.includes('do not run a second event schedule'));
        assert.ok(p.includes('do not treat the level as a requirement'));
    }
    assert.ok(buildPrompt({ supplement: false }).includes('what they plausibly know'));
});
test('off produces no tokens; estimate includes whole injected text', () => {
    assert.equal(buildPrompt({ enabled: false }), '');
    assert.deepEqual(estimateTokens(''), { approximate: 0, low: 0, high: 0 });
    const p = buildPrompt({ level: 3 });
    assert.equal(estimateTokens(p).approximate, Math.ceil(p.length / 4));
});
test('duplicate guard ignores own slot and does not mislabel unrelated prompts', () => {
    assert.equal(hasDuplicate({ [KEY]: { value: MARKER } }), false);
    assert.equal(hasDuplicate({ other: { value: MARKER } }), true);
    assert.equal(hasDuplicate({ other: { value: 'Existing narrative engine' } }), false);
});
test('background and impersonation requests are excluded', () => {
    for (const type of ['normal', 'swipe', 'regenerate', 'continue']) assert.equal(isStoryGeneration(type), true);
    for (const type of ['quiet', 'impersonate', 'unknown', undefined]) assert.equal(isStoryGeneration(type), false);
});
