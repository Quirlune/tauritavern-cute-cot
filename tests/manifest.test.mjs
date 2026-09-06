import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
test('manifest entry points exist and activate through the TT 2.2 hook', () => {
    const manifest = JSON.parse(readFileSync(new URL('../manifest.json', import.meta.url)));
    assert.equal(manifest.hooks.activate, 'activate');
    assert.equal(manifest.generate_interceptor, 'cuteCotExcludeHistory');
    assert.ok(existsSync(new URL('../' + manifest.js, import.meta.url)));
    assert.ok(existsSync(new URL('../' + manifest.css, import.meta.url)));
    const hostPath = new URL('../../../reasoning.js', 'https://localhost/scripts/extensions/third-party/tauritavern-cute-cot/index.js');
    assert.equal(hostPath.pathname, '/scripts/reasoning.js');
});
