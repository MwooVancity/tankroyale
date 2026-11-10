// Headless prop triangle breakdown per map (desktop, no phone): node tools/prop-tris.mjs <mapId...>
// Counts are before distance LOD (poles swap past 105-120 m) and skip wrecks (tank builders not loaded).
// Minimal canvas stub: props bake canvas textures; triangle counts don't need pixels.
const ctxStub = () => new Proxy({}, { get: (t, k) => {
  if (k in t) return t[k];
  if (k === 'getImageData' || k === 'createImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(Math.max(1, (w || x) * (h || y)) * 4), width: w || x, height: h || y });
  if (k === 'canvas') return { width: 1, height: 1 };
  if (k === 'measureText') return () => ({ width: 10 });
  if (/^create(Linear|Radial|Conic)Gradient$|^createPattern$/.test(k)) return () => ({ addColorStop() {} });
  return () => {};
}, set: (t, k, v) => { t[k] = v; return true; } });
globalThis.document = { createElement: () => ({ width: 1, height: 1, style: {}, getContext: ctxStub, toDataURL: () => '' }) };
globalThis.OffscreenCanvas = class { constructor(w, h) { this.width = w; this.height = h; } getContext() { return ctxStub(); } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.Image = class { set src(v) {} };
const R = new URL('../src/', import.meta.url).href;
// TIER=mobile: count what a phone on its default preset builds (quality.ts reads ?tier).
if (process.env.TIER) {
  const mem = new Map();
  globalThis.window = { location: { search: `?tier=${process.env.TIER}` }, localStorage: { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) }, matchMedia: () => ({ matches: true }), innerWidth: 915, innerHeight: 412, devicePixelRatio: 2.6 };
  (await import(R + 'engine/quality.ts')).resolveDeviceTier();
  console.log('preset', (await import(R + 'engine/quality.ts')).getPreset().label);
}
const { createHeightField } = await import(R + 'world/terrain.ts');
const { createProps } = await import(R + 'world/props.ts');
const { getMapConfig } = await import(R + 'world/maps/index.ts');
const fs = await import('node:fs'); const { fileURLToPath } = await import('node:url');
globalThis.fetch = async (u) => new Response(fs.readFileSync(fileURLToPath(String(u))));
await (await import(R + 'world/propsModelStore.ts')).preloadPropModels();
for (const id of process.argv.slice(2)) {
  const config = getMapConfig(id);
  const hf = createHeightField(config.seed ?? 1337, config);
  const engineCtx = new Proxy({ anisotropy: 4, scene: { add() {} }, renderer: null }, { get: (t, k) => (k in t ? t[k] : () => {}) });
  // VEG=1: the vegetation group instead of props (same seed as world/map.ts).
  const props = process.env.VEG
    ? (await import(R + 'world/vegetation.ts')).createVegetation(hf, engineCtx, 2001, config)
    : createProps(hf, engineCtx, 2002, config);
  const fam = [];
  let total = 0;
  props.group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry, per = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : 1;
    const mat = Array.isArray(o.material) ? o.material[0] : o.material;
    total += per * n;
    fam.push([Math.round(per * n), `${o.isInstancedMesh ? 'I' + n + 'x' + Math.round(per) : 'M'} ${o.name || mat?.name || mat?.type} shadow=${o.castShadow ? 1 : 0}`]);
  });
  fam.sort((a, b) => b[0] - a[0]);
  console.log(`== ${id}: ${fam.length} meshes, ${(total / 1e6).toFixed(2)} M tris`);
  for (const [t, s] of fam.slice(0, 12)) console.log(String(t).padStart(8), s);
}
