import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, KEY, splitThoughts, validateSettings, excludeHistory } from '../parser.js';

test('all token boundaries keep thought text out of body', () => {
    const raw = '<think>PRIVATE_秘密<style>body{display:none}</style>\n```xml\n<x/>\n```</think>你好';
    for (let i = 0; i <= raw.length; i++) {
        const result = splitThoughts(raw.slice(0, i), DEFAULTS, true);
        assert.ok(!result.body.includes('PRIVATE'));
        assert.ok(!result.body.includes('<style>'));
        assert.ok(!result.body.includes('<think>'));
    }
    const final = splitThoughts(raw);
    assert.equal(final.body, '你好');
    assert.equal(final.thought, raw.slice(7, raw.indexOf('</think>')));
});
test('multiple blocks anywhere in body, including whitespace and emoji', () => {
    const p = splitThoughts(' 开头<think>一🌸</think>中间<think>二</think>结尾');
    assert.equal(p.body, ' 开头中间结尾');
    assert.equal(p.thought, '一🌸\n\n二');
});
test('partial open marker is withheld in stream and restored at EOF', () => {
    assert.equal(splitThoughts('正文<thi', DEFAULTS, true).body, '正文');
    assert.equal(splitThoughts('正文<thi').body, '正文<thi');
});
test('unclosed thought remains private at EOF; partial close preserved literally', () => {
    const p = splitThoughts('正文<think>秘密</thi');
    assert.equal(p.body, '正文');
    assert.equal(p.thought, '秘密</thi');
    assert.equal(p.incomplete, true);
});
test('empty block and exact closing marker', () => {
    assert.equal(splitThoughts('<think></think>').found, true);
    assert.equal(splitThoughts('<think></think>').incomplete, false);
    assert.equal(splitThoughts('<think>').incomplete, true);
});
test('custom regex metacharacters are literal, not a regular expression', () => {
    const s = { ...DEFAULTS, open: '[思考.*]', close: '[/思考?]' };
    assert.equal(splitThoughts('[思考.*]秘密[/思考?]正文', s).body, '正文');
    assert.equal(splitThoughts('[思考xyz]普通文字', s).found, false);
});
test('non-thought HTML and Markdown in body remain untouched', () => {
    const raw = '**粗体**\n<div>正文</div>\n<THINK>大写普通内容</THINK>';
    assert.equal(splitThoughts(raw).body, raw);
});
test('settings reject ambiguous markers and CSS injection', () => {
    for (const s of [{ open: '' }, { close: '<think>' }, { close: 'think' }, { color: 'red;display:none' }]) {
        assert.throws(() => validateSettings(s));
    }
    assert.equal(validateSettings({ maxHeight: 1000 }).maxHeight, 320);
});
test('history copy is clean while local archive and user instructions survive', () => {
    const stored = { mes: '正文', extra: { [KEY]: { text: 'PRIVATE', open: '<old>', close: '</old>' } },
        swipes: ['正文', '<old>PRIVATE</old>另一个'], swipe_info: [{ extra: { [KEY]: { text: 'PRIVATE' } } }] };
    const copy = [{ ...stored }, { is_user: true, mes: '请用<think>输出思考' }];
    excludeHistory(copy, DEFAULTS);
    assert.ok(!JSON.stringify(copy[0]).includes('PRIVATE'));
    assert.equal(copy[1].mes, '请用<think>输出思考');
    assert.equal(stored.extra[KEY].text, 'PRIVATE');
    assert.equal(stored.swipe_info[0].extra[KEY].text, 'PRIVATE');
    assert.ok(stored.swipes[1].includes('PRIVATE'));
});
test('large reasoning remains outside the message body', () => {
    const p = splitThoughts('<think>' + '思考'.repeat(100000) + '</think>正文');
    assert.equal(p.body, '正文');
    assert.equal(p.thought.length, 200000);
});
