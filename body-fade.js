/** Use the host's parse-once, morphdom-based streaming renderer. No token queue,
 * per-character timers, second DOM renderer, or changes to request/FPS settings. */
export function configureBodyFade(context, settings) {
    const native = context.powerUserSettings;
    if (!native) return;
    if (typeof settings.nativeFadeOriginal !== 'boolean') {
        settings.nativeFadeOriginal = Boolean(native.stream_fade_in);
    }
    native.stream_fade_in = settings.smoothBody ? true : settings.nativeFadeOriginal;
    const checkbox = document.getElementById('stream_fade_in');
    if (checkbox) checkbox.checked = native.stream_fade_in;
    document.documentElement.classList.toggle('cute-cot-smooth-body', settings.smoothBody);
    document.documentElement.style.setProperty('--cute-cot-body-fade', `${settings.bodyFadeMs}ms`);
}

export function restoreBodyFade(context) {
    const settings = context.extensionSettings?.cute_cot;
    if (context.powerUserSettings && typeof settings?.nativeFadeOriginal === 'boolean') {
        context.powerUserSettings.stream_fade_in = settings.nativeFadeOriginal;
        const checkbox = document.getElementById('stream_fade_in');
        if (checkbox) checkbox.checked = settings.nativeFadeOriginal;
    }
    document.documentElement.classList.remove('cute-cot-smooth-body');
    document.documentElement.style.removeProperty('--cute-cot-body-fade');
    context.saveSettingsDebounced();
}
