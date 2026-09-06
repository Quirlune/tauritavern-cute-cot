const panels = new WeakMap();
let nextId = 0;

export function applyTheme(root, settings) {
    root.style.setProperty('--cot-accent', settings.color);
    root.style.setProperty('--cot-text', settings.textColor);
    root.style.setProperty('--cot-limit', `${settings.maxHeight}px`);
    root.style.setProperty('--cot-font', `${settings.fontSize}px`);
}

/** One panel per native message element; no document observer or persistent timer.
 * Detached virtualized messages and their listeners are collected together.
 */
export function renderPanel(messageElement, record, settings) {
    let ui = panels.get(messageElement);
    if (!record) {
        ui?.root.remove();
        panels.delete(messageElement);
        return;
    }
    if (!ui || !messageElement.contains(ui.root)) {
        const root = document.createElement('section');
        root.className = 'cute-cot';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'cute-cot-toggle';
        const label = document.createElement('span');
        label.className = 'cute-cot-label';
        const chevron = document.createElement('span');
        chevron.className = 'cute-cot-chevron';
        chevron.setAttribute('aria-hidden', 'true');
        button.append(label, chevron);
        const reveal = document.createElement('div');
        reveal.className = 'cute-cot-reveal';
        reveal.id = `cute-cot-${++nextId}`;
        button.setAttribute('aria-controls', reveal.id);
        const clip = document.createElement('div');
        clip.className = 'cute-cot-clip';
        const viewport = document.createElement('div');
        viewport.className = 'cute-cot-viewport';
        viewport.tabIndex = 0;
        viewport.setAttribute('aria-label', '思考原文');
        const text = document.createElement('div');
        text.className = 'cute-cot-text';
        viewport.append(text);
        clip.append(viewport);
        reveal.append(clip);
        root.append(button, reveal);
        const anchor = messageElement.querySelector('.mes_text');
        if (!anchor) return;
        anchor.before(root);
        ui = { root, button, label, reveal, viewport, text, status: null, open: false, follow: true };
        panels.set(messageElement, ui);
        button.addEventListener('click', () => setExpanded(ui, !ui.open));
        // User scrolling up suspends following. No timer needs to survive unmount.
        viewport.addEventListener('wheel', event => { if (event.deltaY < 0) ui.follow = false; }, { passive: true });
        let touchY = 0;
        viewport.addEventListener('touchstart', event => { touchY = event.touches[0]?.clientY ?? 0; }, { passive: true });
        viewport.addEventListener('touchmove', event => {
            if ((event.touches[0]?.clientY ?? 0) > touchY + 4) ui.follow = false;
        }, { passive: true });
        viewport.addEventListener('scroll', () => {
            if (viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 8) ui.follow = true;
        }, { passive: true });
    }
    applyTheme(ui.root, settings);
    const thinking = record.status === 'thinking';
    ui.root.dataset.thinking = String(thinking);
    ui.label.textContent = thinking ? '思考中…' : record.status === 'interrupted' ? '思考已停止' : '思考完成';
    if (!thinking && Number.isFinite(record.duration)) {
        ui.label.textContent += ` · ${(record.duration / 1000).toFixed(1)} 秒`;
    }
    if (ui.status !== record.status) {
        setExpanded(ui, thinking);
        ui.status = record.status;
        ui.follow = true;
    }
    const next = record.text || (thinking ? '…' : '（空思考块）');
    if (next !== ui.text.textContent) {
        // This is the only insertion point for model text. Never use innerHTML,
        // markdown helpers, XML parsers or the host's messageFormatting here.
        ui.text.textContent = next;
    }
    if (ui.root.isConnected) {
        // Animate growth as lines arrive, then keep a bounded scrolling viewport.
        ui.viewport.style.height = `${Math.min(settings.maxHeight, ui.text.scrollHeight + 30)}px`;
        if (ui.open && ui.follow) {
            const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
            ui.viewport.scrollTo({ top: ui.viewport.scrollHeight, behavior: reduced ? 'auto' : 'smooth' });
        }
    }
    return ui.root;
}

function setExpanded(ui, open) {
    ui.open = open;
    ui.root.dataset.open = String(open);
    ui.button.setAttribute('aria-expanded', String(open));
    ui.reveal.setAttribute('aria-hidden', String(!open));
    ui.viewport.tabIndex = open ? 0 : -1;
    ui.reveal.inert = !open;
}
