import assert from 'node:assert/strict';

function installBrowser(search, { memory = 8, cores = 8 } = {}) {
  const storage = new Map();
  const localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, String(value)),
    removeItem: (key) => storage.delete(key),
  };
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      location: { search }, localStorage,
      matchMedia: () => ({ matches: false }),
    },
  });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      userAgent: 'Desktop', maxTouchPoints: 0,
      deviceMemory: memory, hardwareConcurrency: cores,
    },
  });
  return { storage, localStorage };
}

installBrowser('?tier=mobile');
const mobile = await import('./quality.ts?quality-mobile-contract');
assert.equal(mobile.resolveDeviceTier({ capabilities: { maxTextureSize: 8192 } }), 'mobile');
assert.equal(mobile.resolvePresetName(), 'mobile-low', 'phones start on Performance (Pixel 6a: 7 fps on Balanced)');
assert.equal(mobile.reportSustainedOverload(), false, 'Performance is the phone floor');
mobile.setMobilePresetName('mobile-high');
assert.equal(mobile.reportSustainedOverload(), true);
assert.equal(mobile.resolvePresetName(), 'mobile', 'sustained overload steps a phone down one preset');
assert.equal(mobile.texSize(4096, 'vehicle'), 2048,
  'mobile vehicle textures retain their tier cap');
assert.deepEqual(mobile.MOBILE_PRESET_ORDER, ['mobile-low', 'mobile', 'mobile-high']);

// Lite phones: budget GPUs on Performance only; mid and strong GPUs never.
mobile.setMobilePresetName('mobile-low');
const liteFor = (gpu) => { mobile.noteGpuRenderer(gpu); return mobile.isLitePhone(); };
for (const gpu of ['Mali-G52 MC2', 'Mali-G57 MC2', 'Mali-G57', 'PowerVR Rogue GE8320', 'Adreno (TM) 610', 'Adreno (TM) 506']) {
  assert.equal(liteFor(gpu), true, `${gpu} is a Lite phone`);
}
for (const gpu of ['Mali-G78 MP20', 'Mali-G57 MC3', 'Adreno (TM) 618', 'Adreno (TM) 650', 'Mali-G610 MC6', '']) {
  assert.equal(liteFor(gpu), false, `${gpu || 'masked GPU'} is not Lite`);
}
assert.equal(liteFor('Mali-G52 MC2') && mobile.soloTeamSize(), 7, 'Lite stays 7v7 until the g05 run decides');
mobile.setLiteTeamSize(5);
assert.equal(mobile.soloTeamSize(), 5);
mobile.setMobilePresetName('mobile');
assert.equal(mobile.isLitePhone(), false, 'picking Balanced leaves Lite');
assert.equal(mobile.soloTeamSize(), 7, 'non-Lite phones keep 7v7');
mobile.setLiteTeamSize(7);
mobile.noteGpuRenderer('');

const desktopBrowser = installBrowser('?tier=desktop');
const desktop = await import('./quality.ts?quality-desktop-contract');
assert.equal(desktop.resolveDeviceTier({ capabilities: { maxTextureSize: 16384 } }), 'desktop');
assert.equal(desktop.resolvePresetName(), 'high');
assert.equal(desktop.PRESETS.high.maxPixelRatio, 1.5);
assert.deepEqual(desktop.PRESETS.high.shadowMapSizes, [2048, 2048, 2048, 1024]);

let notified = null;
const unsubscribe = desktop.onPresetChange((preset) => { notified = preset.label; });
desktop.setPresetName('medium');
assert.equal(desktopBrowser.storage.get('tr.gfxPreset'), 'medium');
assert.equal(desktop.resolvePresetName(), 'medium');
assert.equal(notified, 'Medium');
assert.equal(unsubscribe(), true);
desktop.setPresetName('invalid');
assert.equal(desktop.resolvePresetName(), 'medium', 'invalid choices do not mutate quality');

console.log('quality.selftest: device, texture, preset, and subscription contracts passed');
