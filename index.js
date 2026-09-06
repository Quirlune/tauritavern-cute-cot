import { ReasoningHandler } from '../../../reasoning.js';
import { DEFAULTS, validateSettings } from './parser.js';
import { renderPanel, applyTheme } from './panel.js';
import { installIntegration } from './integration.js';
import { configureBodyFade, restoreBodyFade } from './body-fade.js';

let initialized = false;

export function activate() {
    if (initialized) return;
    const getContext = () => SillyTavern.getContext();
    const ctx = getContext();
    ctx.extensionSettings.cute_cot ??= { ...DEFAULTS };
    let settings = validateSettings(ctx.extensionSettings.cute_cot);
    // Migrate only the old defaults, retaining any user-selected palette.
    if (!settings.styleVersion) {
        if (settings.color === '#ed98b4') settings.color = DEFAULTS.color;
        if (settings.textColor === '#694852') settings.textColor = DEFAULTS.textColor;
        settings.styleVersion = 2;
    }
    configureBodyFade(ctx, settings);
    ctx.extensionSettings.cute_cot = { ...settings };
    ctx.saveSettingsDebounced();
    installIntegration({ getContext, ReasoningHandler, getSettings: () => settings, render: renderPanel });
    initialized = true;
    const host = document.querySelector('#extensions_settings2') ?? document.querySelector('#extensions_settings');
    if (!host) throw new Error('花笺：找不到扩展设置容器。');
    const section = document.createElement('div');
    section.id = 'cute-cot-settings';
    // Static UI only. Model content is exclusively handled in panel.js via textContent.
    section.innerHTML = `<div class="inline-drawer">
      <div class="inline-drawer-toggle inline-drawer-header"><b>花笺 · 自定义思考</b><div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div></div>
      <div class="inline-drawer-content"><div class="cute-cot-fields">
        <small>思考随生成展开，结束后自动收起。思考原文单独保存在本地聊天中，不加入后续聊天上下文。</small>
        <label>开始标记<input data-key="open" class="text_pole" type="text" maxlength="128" spellcheck="false"></label>
        <label>结束标记<input data-key="close" class="text_pole" type="text" maxlength="128" spellcheck="false"></label>
        <small>按原文精确匹配，区分大小写；不需要填写正则表达式。新标记从下一次生成开始生效。模型需实际输出这组标记。</small>
        <div class="cute-cot-colors"><label>面板颜色<input data-key="color" type="color"></label><label>文字颜色<input data-key="textColor" type="color"></label></div>
        <label>思考区域最大高度（像素）<input data-key="maxHeight" class="text_pole" type="number" min="80" max="320" step="10"></label>
        <label>思考文字大小（像素）<input data-key="fontSize" class="text_pole" type="number" min="12" max="22"></label>
        <label class="cute-cot-check"><input data-key="smoothBody" type="checkbox">正文平滑浮现（启用酒馆原生流式淡入）</label>
        <label>正文淡入时长（毫秒）<input data-key="bodyFadeMs" class="text_pole" type="number" min="80" max="260" step="20"></label>
        <small>默认 160 毫秒，收到即显示，不排队逐字播放。关闭平滑时恢复启用前的酒馆淡入设置。</small>
        <div class="cute-cot-error" role="status"></div>
        <button type="button" class="menu_button" data-save>保存设置</button>
      </div></div></div>`;
    host.append(section);
    // Deferred extension activation can happen after the initial chat projection.
    // Touch only visible nodes; future mounts use the native reasoning lifecycle.
    for (const row of document.querySelectorAll('#chat .mes[mesid]')) {
        const record = ctx.chat[Number(row.getAttribute('mesid'))]?.extra?.cute_cot;
        renderPanel(row, record?.status === 'thinking' ? { ...record, status: 'interrupted' } : record, settings);
    }
    for (const input of section.querySelectorAll('[data-key]')) {
        if (input.type === 'checkbox') input.checked = settings[input.dataset.key];
        else input.value = settings[input.dataset.key];
    }
    section.querySelector('[data-save]').addEventListener('click', () => {
        const status = section.querySelector('[role="status"]');
        try {
            const candidate = {};
            for (const input of section.querySelectorAll('[data-key]')) candidate[input.dataset.key] = input.type === 'checkbox' ? input.checked : input.value;
            settings = validateSettings({ ...settings, ...candidate });
            configureBodyFade(getContext(), settings);
            getContext().extensionSettings.cute_cot = { ...settings };
            getContext().saveSettingsDebounced();
            for (const panel of document.querySelectorAll('.cute-cot, .cute-cot-dock')) applyTheme(panel, settings);
            for (const row of document.querySelectorAll('#chat .mes')) {
                row.classList.remove('cute-cot-wide');
            }
            status.textContent = '已保存';
        } catch (error) { status.textContent = error.message; }
    });
}

export function disable() {
    restoreBodyFade(SillyTavern.getContext());
    document.querySelectorAll('#chat .cute-cot-wide').forEach(row => row.classList.remove('cute-cot-wide'));
}
