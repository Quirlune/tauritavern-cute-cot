import { KEY, splitThoughts, makeRecord, excludeHistory } from './parser.js';

const PATCHED = Symbol.for('Quirlune.cuteCot.integration.v1');

/** TauriTavern v2.2.0 adapter. The stream event runs before onProgressStreaming.
 * Wrapping that boundary separates raw thought text BEFORE cleanUpMessage,
 * markdown balancing, regexes, DOM formatting and the stored message body.
 * ReasoningHandler.updateDom is also used for detached/virtualized projections;
 * decorating it needs no competing ChatSurface owner or global DOM observer.
 */
export function installIntegration({ getContext, ReasoningHandler, getSettings, render, now = Date.now }) {
    const ctx = getContext();
    if (!ctx?.eventSource?.makeFirst || !ctx.eventTypes?.STREAM_TOKEN_RECEIVED ||
        typeof ReasoningHandler?.prototype?.updateDom !== 'function') {
        throw new Error('花笺无法接入当前消息接口；需要 TauriTavern 2.2.0 兼容接口。');
    }
    if (ReasoningHandler.prototype[PATCHED]) return;
    ReasoningHandler.prototype[PATCHED] = true;
    const active = new Set();
    const wrapped = new WeakSet();
    const streamStates = new WeakMap();
    const originalUpdateDom = ReasoningHandler.prototype.updateDom;
    ReasoningHandler.prototype.updateDom = function (messageId, options) {
        // The native renderer never receives our archive as its reasoning input.
        const result = originalUpdateDom.call(this, messageId, options);
        const current = getContext();
        const record = current.chat[messageId]?.extra?.[KEY];
        const display = record?.status === 'thinking' && current.streamingProcessor?.messageId !== Number(messageId)
            ? { ...record, status: 'interrupted' } : record;
        if (this.messageDom) render(this.messageDom, display, getSettings());
        return result;
    };

    function syncSwipe(message) {
        const i = message.swipe_id;
        if (Number.isInteger(i) && Array.isArray(message.swipes)) {
            message.swipes[i] = message.mes;
            if (Array.isArray(message.swipe_info)) {
                message.swipe_info[i] = { ...message.swipe_info[i], extra: structuredClone(message.extra ?? {}) };
            }
        }
    }

    function cleanMessage(id, type) {
        const message = getContext().chat[id];
        if (!message || message.is_user || message.is_system) return;
        const settings = getSettings();
        const parsed = splitThoughts(message.mes, settings);
        if (parsed.found) {
            message.extra ??= {};
            const record = makeRecord(parsed, settings);
            const previous = message.extra[KEY];
            if (type === 'continue' && previous?.text) record.text = `${previous.text}\n\n${record.text}`;
            message.extra[KEY] = record;
            message.mes = parsed.body;
            syncSwipe(message);
        }
    }

    function attachStream() {
        const processor = getContext().streamingProcessor;
        if (!processor || wrapped.has(processor) || processor.type === 'impersonate') return;
        if (typeof processor.onProgressStreaming !== 'function' || typeof processor.finalizeIntermediaryMessage !== 'function') {
            throw new Error('花笺：流式接口发生变化，不能安全分离思考内容。');
        }
        wrapped.add(processor);
        const settings = { ...getSettings() };
        const message = getContext().chat[processor.messageId];
        const oldRecord = processor.type === 'continue' ? message?.extra?.[KEY] : null;
        // Swiping reuses the message object. It must not inherit the previous reply's archive.
        if (message?.extra && processor.type !== 'continue') delete message.extra[KEY];
        const state = { processor, message, started: null, record: oldRecord, raw: null, alternatives: null };
        streamStates.set(processor, state);
        active.add(state);
        const progress = processor.onProgressStreaming;
        processor.onProgressStreaming = async function (id, raw, final = false) {
            const current = getContext().chat[id];
            if (!current || current.is_user || current.is_system) return progress.call(this, id, raw, final);
            const parsed = splitThoughts(raw, settings, !final);
            state.raw = raw;
            if (parsed.found) {
                state.started ??= now();
                const duration = !parsed.incomplete && state.record?.status === 'done'
                    ? state.record.duration : now() - state.started;
                const record = makeRecord(parsed, settings, duration, final);
                if (oldRecord?.text) record.text = `${oldRecord.text}\n\n${record.text}`;
                current.extra ??= {};
                current.extra[KEY] = record;
                state.record = record;
            } else if (!oldRecord && state.record) {
                delete current.extra[KEY];
                state.record = null;
                state.started = null;
            }
            // The original method retains normal body formatting, counters and save behavior.
            const result = await progress.call(this, id, parsed.body, final);
            if (this.messageDom) render(this.messageDom, current.extra?.[KEY], getSettings());
            return result;
        };
        const finalize = processor.finalizeIntermediaryMessage;
        processor.finalizeIntermediaryMessage = async function (id, raw, options) {
            const current = getContext().chat[id];
            // Native batch-swipes copy the active extra object. Restore a distinct archive
            // for every candidate inside MESSAGE_RECEIVED, before the native save.
            if (current && Array.isArray(this.swipes) && this.swipes.length) {
                state.alternatives = {
                    start: current.swipes?.length ?? 0,
                    records: this.swipes.map(text => {
                        const p = splitThoughts(text, settings);
                        return p.found ? makeRecord(p, settings) : null;
                    }),
                };
                this.swipes = this.swipes.map(text => splitThoughts(text, settings).body);
            }
            return finalize.call(this, id, raw, options);
        };
        // A provider failure may have no GENERATION_STOPPED event.
        const onError = processor.onErrorStreaming;
        if (typeof onError === 'function') {
            processor.onErrorStreaming = function (...args) {
                finishState(state);
                return onError.apply(this, args);
            };
        }
    }

    function finishState(state) {
        const { processor, message } = state;
        if (!message || !getContext().chat.includes(message)) return;
        if (message.extra?.[KEY]?.status === 'thinking') {
            message.extra[KEY] = { ...message.extra[KEY], status: 'interrupted', duration: now() - state.started };
        }
        syncSwipe(message);
        if (processor.messageDom) render(processor.messageDom, message.extra?.[KEY], getSettings());
    }

    const { eventSource: events, eventTypes: types } = ctx;
    events.makeFirst(types.STREAM_TOKEN_RECEIVED, attachStream);
    events.makeFirst(types.MESSAGE_RECEIVED, (id, type) => {
        if (!getContext().streamingProcessor && type === 'swipe') {
            const message = getContext().chat[id];
            if (message?.extra) delete message.extra[KEY];
        }
        cleanMessage(id, type);
        // GENERATION_ENDED can precede MESSAGE_RECEIVED in native finalization.
        const currentState = streamStates.get(getContext().streamingProcessor);
        for (const state of currentState ? [currentState] : []) {
            if (state.processor.messageId !== Number(id) || !state.alternatives) continue;
            const message = getContext().chat[id];
            state.alternatives.records.forEach((record, offset) => {
                const info = message?.swipe_info?.[state.alternatives.start + offset];
                if (!info) return;
                info.extra ??= {};
                delete info.extra[KEY];
                if (record) info.extra[KEY] = record;
            });
            state.alternatives = null;
        }
    });
    for (const event of [types.MESSAGE_EDITED, types.MESSAGE_UPDATED]) {
        if (event) events.makeFirst(event, cleanMessage);
    }
    for (const event of [types.GENERATION_STOPPED, types.GENERATION_ENDED]) {
        events.on(event, async () => {
            const needsSave = active.size > 0;
            for (const state of active) finishState(state);
            active.clear();
            if (needsSave) await getContext().saveChat?.();
        });
    }
    events.on(types.CHAT_CHANGED, () => active.clear());

    globalThis.cuteCotExcludeHistory = messages => excludeHistory(messages, getSettings());
    // The prompt-ready hook also covers dry-run/quiet chat-completion assembly.
    if (types.CHAT_COMPLETION_PROMPT_READY) {
        events.makeLast(types.CHAT_COMPLETION_PROMPT_READY, data => {
            for (const message of data.chat ?? []) {
                if (message.role !== 'assistant') continue;
                if (typeof message.content === 'string') {
                    message.content = splitThoughts(message.content, getSettings()).body;
                } else if (Array.isArray(message.content)) {
                    for (const part of message.content) {
                        if (part.type === 'text' && typeof part.text === 'string') {
                            part.text = splitThoughts(part.text, getSettings()).body;
                        }
                    }
                }
            }
        });
    }
    return { cleanMessage };
}
