import test from 'node:test';
import assert from 'node:assert/strict';
import { configureBodyFade, restoreBodyFade } from '../body-fade.js';
import { DEFAULTS, validateSettings } from '../parser.js';

function fixture(initial) {
    const classes = new Set(), vars = new Map(), checkbox = { checked: initial };
    globalThis.document = {
        getElementById: () => checkbox,
        documentElement: {
            classList: { toggle: (key, enabled) => enabled ? classes.add(key) : classes.delete(key), remove: key => classes.delete(key) },
            style: { setProperty: (key, value) => vars.set(key, value), removeProperty: key => vars.delete(key) },
        },
    };
    return { context: { powerUserSettings: { stream_fade_in: initial }, extensionSettings: {}, saveSettingsDebounced() {} }, classes, vars, checkbox };
}
test('native fade enabled without touching unrelated performance or model settings', () => {
    const f = fixture(false), settings = { ...DEFAULTS };
    f.context.powerUserSettings.streaming_fps = 30;
    configureBodyFade(f.context, settings);
    assert.equal(f.context.powerUserSettings.stream_fade_in, true);
    assert.equal(f.context.powerUserSettings.streaming_fps, 30);
    assert.equal(settings.nativeFadeOriginal, false);
    assert.equal(f.vars.get('--cute-cot-body-fade'), '160ms');
    assert.equal(f.checkbox.checked, true);
});
test('reload and disable restore the original setting, not the already-enabled value', () => {
    for (const original of [false, true]) {
        const f = fixture(original), settings = { ...DEFAULTS };
        configureBodyFade(f.context, settings);
        configureBodyFade(f.context, settings);
        f.context.extensionSettings.cute_cot = settings;
        restoreBodyFade(f.context);
        assert.equal(f.context.powerUserSettings.stream_fade_in, original);
        assert.equal(f.classes.size, 0);
    }
});
test('switching smooth option off restores native fade independently of layout', () => {
    const f = fixture(false), settings = { ...DEFAULTS };
    configureBodyFade(f.context, settings);
    settings.smoothBody = false;
    configureBodyFade(f.context, settings);
    assert.equal(f.context.powerUserSettings.stream_fade_in, false);
    assert.equal(settings.wideLayout, undefined);
});
test('new settings migrate missing fields, respect false and bound duration', () => {
    assert.equal(validateSettings({}).bodyFadeMs, 160);
    assert.equal(validateSettings({ bodyFadeMs: 999 }).bodyFadeMs, 260);
    assert.equal(validateSettings({ bodyFadeMs: 1 }).bodyFadeMs, 80);
    assert.equal(validateSettings({ smoothBody: false }).smoothBody, false);
    assert.equal(validateSettings({ wideLayout: true }).wideLayout, undefined);
});
