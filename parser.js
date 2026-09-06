export const KEY = 'cute_cot';
export const DEFAULTS = Object.freeze({
    open: '<think>', close: '</think>', color: '#d3a1b7',
    textColor: '#79616d', maxHeight: 180, fontSize: 14,
    smoothBody: true, bodyFadeMs: 160, wideLayout: true,
});

export function validateSettings(value) {
    const s = { ...DEFAULTS, ...value };
    for (const key of ['open', 'close']) {
        if (typeof s[key] !== 'string' || !s[key].trim() || s[key].length > 128) {
            throw new Error('起止标记不能为空，且不能超过 128 个字符。');
        }
    }
    if (s.open === s.close || s.open.includes(s.close) || s.close.includes(s.open)) {
        throw new Error('起止标记不能相同，也不能互相包含。');
    }
    for (const key of ['color', 'textColor']) {
        if (!/^#[\da-f]{6}$/i.test(s[key])) throw new Error('请选择有效的颜色。');
    }
    s.maxHeight = Math.min(320, Math.max(80, Number(s.maxHeight) || 180));
    s.fontSize = Math.min(22, Math.max(12, Number(s.fontSize) || 14));
    s.bodyFadeMs = Math.min(260, Math.max(80, Number(s.bodyFadeMs) || 160));
    s.smoothBody = s.smoothBody !== false;
    s.wideLayout = s.wideLayout !== false;
    return s;
}

function partialSuffix(text, marker) {
    for (let n = Math.min(text.length, marker.length - 1); n > 0; n--) {
        if (text.endsWith(marker.slice(0, n))) return n;
    }
    return 0;
}

/** Literal, case-sensitive delimiters. Content is never interpreted as HTML/XML/Markdown.
 * Cumulative snapshots allow token boundaries, replacements and regenerated text.
 * A partial opening delimiter is withheld while streaming and restored at EOF.
 * An unclosed block stays private even after stop/error/EOF.
 */
export function splitThoughts(text, settings = DEFAULTS, streaming = false) {
    text = typeof text === 'string' ? text : '';
    const { open, close } = settings;
    if (!open || !close || open === close) throw new Error('Invalid delimiters');
    const body = [], thoughts = [];
    let cursor = 0, found = false, incomplete = false, pending = '';
    while (cursor < text.length) {
        const start = text.indexOf(open, cursor);
        if (start < 0) {
            const tail = text.slice(cursor);
            const n = streaming ? partialSuffix(tail, open) : 0;
            body.push(n ? tail.slice(0, -n) : tail);
            pending = n ? tail.slice(-n) : '';
            break;
        }
        found = true;
        body.push(text.slice(cursor, start));
        const end = text.indexOf(close, start + open.length);
        if (end < 0) {
            const tail = text.slice(start + open.length);
            const n = streaming ? partialSuffix(tail, close) : 0;
            thoughts.push(n ? tail.slice(0, -n) : tail);
            incomplete = true;
            break;
        }
        thoughts.push(text.slice(start + open.length, end));
        cursor = end + close.length;
    }
    return { body: body.join(''), thought: thoughts.join('\n\n'), found, incomplete, pending };
}

export function makeRecord(parsed, settings, duration = null, final = true) {
    return {
        version: 1, text: parsed.thought,
        open: settings.open, close: settings.close,
        status: parsed.incomplete ? (final ? 'interrupted' : 'thinking') : 'done',
        duration,
    };
}

/** Remove custom archives from the generation COPY, never from the stored chat. */
export function excludeHistory(messages, settings) {
    for (const message of messages ?? []) {
        if (!message || message.is_user || message.is_system) continue;
        const record = message.extra?.[KEY];
        const markers = record?.open && record?.close ? record : settings;
        message.mes = splitThoughts(message.mes, markers).body;
        if (message.extra) {
            message.extra = { ...message.extra };
            delete message.extra[KEY];
        }
        // Alternative replies are not part of the prompt; do not expose archives
        // to downstream interceptors that enumerate the complete message object.
        if (message.swipe_info) {
            message.swipe_info = message.swipe_info.map(info => {
                const extra = { ...info?.extra };
                delete extra[KEY];
                return { ...info, extra };
            });
        }
        if (Array.isArray(message.swipes)) {
            message.swipes = message.swipes.map(text => splitThoughts(text, markers).body);
        }
    }
}
