import test from 'node:test';
import assert from 'node:assert/strict';
import { installIntegration } from '../integration.js';
import { DEFAULTS, KEY } from '../parser.js';

function fixture() {
    const listeners = new Map();
    const events = {
        on(name, fn) { const list = listeners.get(name) ?? []; list.push(fn); listeners.set(name, list); },
        makeFirst(name, fn) { const list = listeners.get(name) ?? []; list.unshift(fn); listeners.set(name, list); },
        makeLast(name, fn) { this.on(name, fn); },
        async emit(name, ...args) { for (const fn of listeners.get(name) ?? []) await fn(...args); },
    };
    const names = ['STREAM_TOKEN_RECEIVED', 'MESSAGE_RECEIVED', 'MESSAGE_EDITED', 'MESSAGE_UPDATED', 'GENERATION_STOPPED', 'GENERATION_ENDED', 'CHAT_CHANGED', 'CHAT_COMPLETION_PROMPT_READY'];
    const message = { mes: '', extra: {}, swipes: [''], swipe_id: 0, swipe_info: [{ extra: {} }] };
    const ctx = { eventSource: events, eventTypes: Object.fromEntries(names.map(n => [n, n])), chat: [message], saveChat: async () => {} };
    class Handler { updateDom() { this.messageDom = {}; } }
    const rendered = [], formatted = [];
    let time = 0;
    const makeProcessor = (type = 'normal') => ({
        type, messageId: 0, messageDom: {}, swipes: [], reasoningHandler: new Handler(),
        async onProgressStreaming(id, raw) {
            formatted.push(raw);
            ctx.chat[id].mes = raw;
            this.reasoningHandler.updateDom(id);
            message.swipes[0] = raw;
            message.swipe_info[0].extra = structuredClone(message.extra);
        },
        async finalizeIntermediaryMessage(id, raw) {
            await this.onProgressStreaming(id, raw, true);
            for (const text of this.swipes) {
                message.swipes.push(text);
                message.swipe_info.push({ extra: structuredClone(message.extra) });
            }
            await events.emit('GENERATION_ENDED'); // native order, before MESSAGE_RECEIVED
            await events.emit('MESSAGE_RECEIVED', id);
        },
        onErrorStreaming() {},
    });
    ctx.streamingProcessor = makeProcessor();
    installIntegration({ getContext: () => ctx, ReasoningHandler: Handler, getSettings: () => DEFAULTS,
        render: (_, record) => rendered.push(record ? structuredClone(record) : null), now: () => time += 50 });
    const token = async (raw, final = false) => {
        await events.emit('STREAM_TOKEN_RECEIVED', raw);
        await ctx.streamingProcessor.onProgressStreaming(0, raw, final);
    };
    return { ctx, message, events, rendered, formatted, token, makeProcessor };
}

test('stream separation precedes formatter and completion closes immediately', async () => {
    const f = fixture();
    await f.token('<thi');
    assert.equal(f.message.mes, '');
    await f.token('<think>PRIVATE<style>body{display:none}</style>');
    assert.equal(f.message.extra[KEY].status, 'thinking');
    await f.token('<think>PRIVATE<style>body{display:none}</style></think>');
    assert.equal(f.message.extra[KEY].status, 'done');
    await f.token('<think>PRIVATE<style>body{display:none}</style></think>正文', true);
    assert.equal(f.message.mes, '正文');
    assert.ok(f.formatted.every(x => !x.includes('PRIVATE')));
    assert.equal(f.message.extra.reasoning, undefined);
    assert.equal(f.message.swipe_info[0].extra[KEY].text, 'PRIVATE<style>body{display:none}</style>');
});
test('stop and provider error preserve a private, collapsed archive', async () => {
    for (const error of [false, true]) {
        const f = fixture();
        await f.token('<think>PRIVATE');
        if (error) f.ctx.streamingProcessor.onErrorStreaming();
        else await f.events.emit('GENERATION_STOPPED');
        assert.equal(f.message.mes, '');
        assert.equal(f.message.extra[KEY].status, 'interrupted');
        assert.equal(f.rendered.at(-1).text, 'PRIVATE');
    }
});
test('non-stream output and edits are split before native handlers', async () => {
    const f = fixture();
    f.message.mes = '<think>PRIVATE</think>答复';
    await f.events.emit('MESSAGE_RECEIVED', 0);
    assert.equal(f.message.mes, '答复');
    f.message.mes = '前<think>新思考</think>后';
    await f.events.emit('MESSAGE_EDITED', 0);
    assert.equal(f.message.mes, '前后');
    assert.equal(f.message.extra[KEY].text, '新思考');
});
test('regenerate does not inherit previous archive; continue preserves it', async () => {
    const f = fixture();
    await f.token('<think>旧思考</think>旧正文', true);
    f.ctx.streamingProcessor = f.makeProcessor('continue');
    await f.token('旧正文，续写', true);
    assert.equal(f.message.extra[KEY].text, '旧思考');
    f.ctx.streamingProcessor = f.makeProcessor('swipe');
    await f.token('无思考的新正文', true);
    assert.equal(f.message.extra[KEY], undefined);
});
test('snapshot replacement clears stale thought', async () => {
    const f = fixture();
    await f.token('<think>旧思考');
    await f.token('替换后的正文', true);
    assert.equal(f.message.extra[KEY], undefined);
    assert.equal(f.message.mes, '替换后的正文');
});
test('batch swipes have independent archives despite native copied extras', async () => {
    const f = fixture();
    await f.token('<think>主思考</think>主正文');
    f.ctx.streamingProcessor.swipes = ['<think>另一个思考</think>另一个正文', '没有思考'];
    await f.ctx.streamingProcessor.finalizeIntermediaryMessage(0, '<think>主思考</think>主正文');
    assert.equal(f.message.swipes[1], '另一个正文');
    assert.equal(f.message.swipe_info[1].extra[KEY].text, '另一个思考');
    assert.equal(f.message.swipe_info[2].extra[KEY], undefined);
});
test('chat prompt guard removes assistant blocks, preserves user instructions', async () => {
    const f = fixture();
    const data = { chat: [{ role: 'assistant', content: '<think>PRIVATE</think>正文' },
        { role: 'user', content: '请用<think>标记' },
        { role: 'assistant', content: [{ type: 'text', text: '<think>PRIVATE</think>多模态正文' }, { type: 'image_url', image_url: { url: 'https://example.invalid/image' } }] }] };
    await f.events.emit('CHAT_COMPLETION_PROMPT_READY', data);
    assert.ok(!JSON.stringify(data).includes('PRIVATE'));
    assert.equal(data.chat[1].content, '请用<think>标记');
    assert.equal(data.chat[2].content[1].type, 'image_url');
});
test('impersonation is not modified', async () => {
    const f = fixture();
    f.ctx.streamingProcessor = f.makeProcessor('impersonate');
    await f.token('<think>写给用户输入框的内容</think>');
    assert.ok(f.message.mes.includes('<think>'));
});
