// node tools/export-glb.mjs: exports every tank (GLB), map terrain/props/vegetation (GLB + placement JSON)
// and spec/ballistics/map data (JSON) for the Unity rebuild. Output: ../../unity-export (OUT=dir overrides).
// Env: ONLY=tanks|data|maps (comma list), TANKS=id,id  MAPS=monsoon,skybridge  (default MAPS: monsoon,skybridge)
// Tanks are built in the page with the real fleet factory (quality 'high', full geometry), then GLTFExporter.
import { createServer } from 'vite';
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const OUT = path.resolve(process.env.OUT || path.join(ROOT, '..', '..', '..', 'unity-export'));
const ONLY = new Set((process.env.ONLY || 'tanks,data,maps').split(','));
const MAPS = (process.env.MAPS || 'monsoon,skybridge').split(',');
for (const d of ['tanks', 'data', 'maps']) fs.mkdirSync(path.join(OUT, d), { recursive: true });

const server = await createServer({ root: ROOT, logLevel: 'error', server: { port: 6520, strictPort: false, fs: { strict: false } } });
await server.listen();
const browser = await puppeteer.launch({ headless: 'new', args: ['--use-gl=angle', '--enable-webgl', '--no-sandbox'], protocolTimeout: 1200000 });
const log = (...a) => console.log(...a);
const failures = [];

// In-page helpers, installed once per page: GLB export to window.__out, chunked base64 readback.
const PAGE_HELPERS = () => {
  window.__X = (async () => {
    const THREE = await import('/node_modules/three/build/three.module.js').catch(() => null);
    const { GLTFExporter } = await import('/node_modules/three/examples/jsm/exporters/GLTFExporter.js');
    const exporter = new GLTFExporter();
    // ponytail: GLTFExporter skips BatchedMesh; only counted (reported in manifest), expand if a tank uses one.
    const expandBatched = (root) => { let n = 0; root.traverse((o) => { if (o.isBatchedMesh) n++; }); return n; };
    const toGlb = (obj) => exporter.parseAsync(obj, { binary: true, onlyVisible: true, maxTextureSize: 1024 });
    const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
    window.__chunk = (i, n) => b64(window.__out.subarray(i, i + n));
    return { toGlb, expandBatched, THREE };
  })();
};
async function readOut(page, file) {
  const len = await page.evaluate(() => window.__out.length);
  const fd = fs.openSync(file, 'w'); const N = 4 << 20;
  for (let i = 0; i < len; i += N) fs.writeSync(fd, Buffer.from(await page.evaluate((a, b) => window.__chunk(a, b), i, N), 'base64'));
  fs.closeSync(fd); return len;
}
async function newPage() {
  const page = await browser.newPage();
  page.on('pageerror', (e) => log('pageerror', String(e).slice(0, 200)));
  await page.setViewport({ width: 915, height: 412, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.goto(`http://localhost:${server.config.server.port}/?nosplash=1`, { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForFunction('window.__GAME_READY === true', { timeout: 300000 });
  await page.evaluate(PAGE_HELPERS); await page.evaluate(() => window.__X.then(() => 0));
  return page;
}
// Move embedded images to <dir>/textures/<sha1>.<ext> (shared, deduped across GLBs) and repack the BIN chunk.
// The GLB then references them by relative URI (valid glTF 2.0; glTFast/Blender resolve it next to the .glb).
function externalizeImages(file) {
  const b = fs.readFileSync(file); const jl = b.readUInt32LE(12); const j = JSON.parse(b.subarray(20, 20 + jl).toString());
  if (!j.images?.length) return 0;
  const binStart = 20 + jl + 8; const texDir = path.join(path.dirname(file), 'textures'); fs.mkdirSync(texDir, { recursive: true });
  const imageViews = new Set();
  for (const im of j.images) {
    if (im.bufferView === undefined) continue;
    const v = j.bufferViews[im.bufferView]; const d = b.subarray(binStart + (v.byteOffset || 0), binStart + (v.byteOffset || 0) + v.byteLength);
    const name = `${crypto.createHash('sha1').update(d).digest('hex').slice(0, 16)}.${im.mimeType === 'image/jpeg' ? 'jpg' : 'png'}`;
    if (!fs.existsSync(path.join(texDir, name))) fs.writeFileSync(path.join(texDir, name), d);
    imageViews.add(im.bufferView); delete im.bufferView; im.uri = `textures/${name}`;
  }
  // ponytail: image bufferViews are left as zero-length entries so other indices stay valid.
  const parts = []; let off = 0;
  j.bufferViews.forEach((v, i) => {
    if (imageViews.has(i)) { v.byteOffset = 0; v.byteLength = 0; return; }
    const d = b.subarray(binStart + (v.byteOffset || 0), binStart + (v.byteOffset || 0) + v.byteLength);
    const pad = (4 - (off % 4)) % 4; if (pad) { parts.push(Buffer.alloc(pad)); off += pad; }
    v.byteOffset = off; parts.push(d); off += d.length;
  });
  j.bufferViews = j.bufferViews.map((v) => (v.byteLength === 0 ? { buffer: 0, byteOffset: 0, byteLength: 4 } : v)); // glTF needs byteLength>=1
  let bin = Buffer.concat(parts); if (bin.length < 4) bin = Buffer.concat([bin, Buffer.alloc(4)]);
  bin = Buffer.concat([bin, Buffer.alloc((4 - (bin.length % 4)) % 4)]); j.buffers[0].byteLength = bin.length;
  let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + bin.length, 8);
  const ch = (len, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(len, 0); c.writeUInt32LE(type, 4); return c; };
  fs.writeFileSync(file, Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(bin.length, 0x004e4942), bin]));
  return fs.statSync(file).size;
}
const writeJson = (rel, v) => { const f = path.join(OUT, rel); fs.writeFileSync(f, JSON.stringify(v)); return fs.statSync(f).size; };

try {
  const page = await newPage();
  const ids = await page.evaluate(async () => {
    const ff = await import('/src/vehicles/fleetFactory.ts'); await ff.ensureFullFleet();
    const sp = await import('/src/vehicles/specs.js'); return sp.ALL_TANK_IDS.slice();
  });
  const tankIds = process.env.TANKS ? process.env.TANKS.split(',') : ids;

  if (ONLY.has('tanks')) {
    const manifest = [];
    for (const id of tankIds) {
      try {
        const info = await page.evaluate(async (id) => {
          const { toGlb, expandBatched } = await window.__X;
          const ff = await import('/src/vehicles/fleetFactory.ts'); await ff.ensureTankBuilder(id);
          const D = window.__DEBUG;
          const ctx = { renderer: D.renderer, scene: D.scene, camera: D.camera, quality: 'high',
            setupShadowMaterial: (m, h = null) => D.lighting.setupShadowMaterial(m, h),
            releaseShadowMaterial: (m) => D.lighting.releaseShadowMaterial(m),
            anisotropy: Math.max(1, Math.min(8, D.renderer.capabilities.getMaxAnisotropy())) };
          const v = ff.createTank(id, ctx, { camoSeed: 4000, quality: 'high', geometryQuality: 'high' });
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          const root = v.root || v.group || v.object;
          const kinds = {}; const named = [];
          root.traverse((o) => { const k = o.isInstancedMesh ? 'InstancedMesh' : o.isBatchedMesh ? 'BatchedMesh' : o.isMesh ? 'Mesh' : o.type;
            kinds[k] = (kinds[k] || 0) + 1; if (o.name && /^rig_|wheel|track|road|sprocket|idler/i.test(o.name)) named.push(o.name); });
          const skippedBatched = expandBatched(root);
          // ponytail: LOD0 only (lower levels hidden so onlyVisible drops them); Unity LODGroup can be re-made from LOD0.
          root.traverse((o) => { if (o.isLOD) o.levels.forEach((l, i) => { if (i > 0) l.object.visible = false; }); });
          window.__out = new Uint8Array(await toGlb(root));
          v.dispose?.();
          return { kinds, named: [...new Set(named)].slice(0, 40), skippedBatched };
        }, id);
        const file = path.join(OUT, 'tanks', `${id}.glb`); await readOut(page, file);
        const bytes = externalizeImages(file) || fs.statSync(file).size;
        manifest.push({ id, bytes, ...info });
        log(`tank ${id} ${(bytes / 1e6).toFixed(2)} MB`, JSON.stringify(info.kinds));
      } catch (e) { failures.push(`tank ${id}: ${String(e.message || e).slice(0, 200)}`); log('FAIL', id, String(e).slice(0, 300)); }
    }
    writeJson('tanks/manifest.json', { allTankIds: ids, exported: manifest });
  }

  if (ONLY.has('data')) {
    const data = await page.evaluate(async () => {
      const sp = await import('/src/vehicles/specs.js');
      const bal = await import('/src/sim/ballistics.ts');
      const plain = (v, stack = []) => {
        if (v === null || typeof v === 'boolean' || typeof v === 'string') return v;
        if (typeof v === 'number') return Number.isFinite(v) ? v : String(v);
        if (typeof v === 'function' || typeof v === 'undefined' || typeof v === 'symbol') return undefined;
        if (ArrayBuffer.isView(v)) return Array.from(v);
        if (stack.includes(v)) return '[circular]';
        if (v.isMaterial || v.isTexture || v.isBufferGeometry || v.isObject3D) return `[three ${v.type || 'object'}]`;
        const s = [...stack, v];
        if (v instanceof Set) return [...v].map((x) => plain(x, s));
        if (v instanceof Map) return Object.fromEntries([...v].map(([k, x]) => [String(k), plain(x, s)]));
        if (Array.isArray(v)) return v.map((x) => { const p = plain(x, s); return p === undefined ? null : p; });
        const o = {}; for (const k of Object.keys(v)) { const p = plain(v[k], s); if (p !== undefined) o[k] = p; } return o;
      };
      const specs = {}; const pen = {};
      const D = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1250, 1500, 1750, 2000];
      for (const id of sp.ALL_TANK_IDS) {
        const s = sp.getSpec(id); specs[id] = plain(s);
        pen[id] = (s.gun?.shells || []).map((sh) => ({ name: sh.name, type: sh.type, caliberMm: sh.caliberMm, velocityMps: sh.velocityMps,
          gravityMps2: bal.shellGravityMps2(sh), penMmAtDistanceM: Object.fromEntries(D.map((d) => [d, +bal.penAtDistanceMm(sh, d).toFixed(2)])) }));
      }
      return { specs, pen, ids: sp.ALL_TANK_IDS.slice(),
        consts: { GRAVITY_SCALE: bal.GRAVITY_SCALE, SHELL_MAX_LIFETIME_S: bal.SHELL_MAX_LIFETIME_S, GUIDED_MISSILE_TURN_RATE_RAD_S: bal.GUIDED_MISSILE_TURN_RATE_RAD_S } };
    });
    // Non-exported rule constants are read from the source so they cannot drift from a hand copy.
    const srcConsts = (file) => {
      const txt = fs.readFileSync(path.join(ROOT, file), 'utf8'); const out = {};
      for (const m of txt.matchAll(/^const ([A-Z][A-Z0-9_]*)\s*=\s*(-?[\d.]+(?:e-?\d+)?)\s*;/gm)) out[m[1]] = Number(m[2]);
      return out;
    };
    const dmgSrc = fs.readFileSync(path.join(ROOT, 'src/sim/damage.ts'), 'utf8');
    const beh = dmgSrc.match(/const SHELL_BEHAVIOR = (\{[\s\S]*?\n\})/)[1];
    const shellBehavior = Function(`return (${beh});`)();
    for (const k of Object.keys(shellBehavior)) if (shellBehavior[k].ricochetDeg === Infinity) shellBehavior[k].ricochetDeg = 'Infinity';
    let n = 0;
    n += writeJson('data/tank_specs.json', { units: 'see README', ids: data.ids, specs: data.specs });
    n += writeJson('data/ballistics.json', {
      penetrationModel: 'linear pen100Mm (<=100 m) -> pen1000Mm (1000 m); if pen2000Mm>0 second segment 1000->2000 m, clamped beyond (src/sim/ballistics.ts penAtDistanceMm)',
      effectiveThickness: 'eff = (KE ? plate.keMm : plate.ceMm) / cos(max(0, impactDeg - norm))^slopeExp, angle clamped 89; KE norm *= 1.4*C/T when C >= OVERMATCH_NORM_BOOST*T (damage.ts effectiveThickness)',
      ricochet: 'HE never; KE never when overmatchCaliber >= OVERMATCH_NO_RICOCHET*plate.physicalMm; else ricochet when raw impact angle > ricochetDeg; max RICOCHET_MAX_BOUNCES; HEAT dies on ricochet',
      overmatchCaliber: 'shell.effectiveOvermatchCaliberMm if set; APFSDS 0.6*caliberMm; else caliberMm',
      gravity: '9.81*GRAVITY_SCALE m/s^2 for unguided shells; guided missiles fly the sight line (shellGravityMps2)',
      shellBehavior, constants: { ...data.consts, ...srcConsts('src/sim/ballistics.ts'), ...srcConsts('src/sim/damage.ts') },
      shellsByTank: data.pen,
    });
    log(`data ${(n / 1e6).toFixed(2)} MB`);
  }
  await page.close();

  if (ONLY.has('maps')) {
    for (const mapId of MAPS) {
      try {
        const mp = await newPage();
        await mp.evaluate((m) => window.__DEBUG.startBattle('m1a2', m), mapId);
        await new Promise((r) => setTimeout(r, 1500));
        const dir = path.join(OUT, 'maps', mapId); fs.mkdirSync(path.join(dir, 'props'), { recursive: true });
        // 1) heightfield 1025x1025 @1 m (float32 LE, row-major z then x) + ground type grid + 4 m terrain mesh GLB
        const meta = await mp.evaluate(async () => {
          const { toGlb, THREE: T0 } = await window.__X; const T = T0 || (await import('/node_modules/three/build/three.module.js'));
          const w = window.__DEBUG.world; const hf = w.heightField; const N = 1025, HALF = 512;
          const h = new Float32Array(N * N); const g = new Uint8Array(N * N); const GT = { hard: 0, medium: 1, soft: 2 };
          for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
            h[z * N + x] = hf.getHeightAt(x - HALF, z - HALF);
            g[z * N + x] = hf.getGroundType ? (GT[hf.getGroundType(x - HALF, z - HALF)] ?? 255) : 255;
          }
          window.__hf = new Uint8Array(h.buffer); window.__gt = g;
          const S = 4, M = (N - 1) / S + 1; const geo = new T.PlaneGeometry(1024, 1024, M - 1, M - 1); geo.rotateX(-Math.PI / 2);
          const p = geo.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, hf.getHeightAt(p.getX(i), p.getZ(i)));
          geo.computeVertexNormals(); geo.deleteAttribute('uv');
          const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ color: 0x6b7a4a, roughness: 1 })); mesh.name = 'terrain';
          window.__out = new Uint8Array(await toGlb(mesh));
          let mn = Infinity, mx = -Infinity; for (const v of h) { if (v < mn) mn = v; if (v > mx) mx = v; }
          const modes = await import('/src/sim/matchModes.ts');
          const game = window.__DEBUG.game; const all = [...(game.tankById?.values?.() || []), ...(Array.isArray(game.tanks) ? game.tanks : [])];
          const ents = []; for (const t of new Set(all)) if (t?.state?.pos) ents.push({ id: t.id, team: t.team, bot: !!t.bot,
            state: { pos: { x: t.state.pos.x, y: t.state.pos.y, z: t.state.pos.z }, yaw: t.state.yaw, speed: 0 }, combat: { hp: 1, maxHp: 1, destroyed: false } });
          const objectives = {};
          if (!ents.length) objectives.error = `no battle tanks found (game keys: ${Object.keys(game).slice(0, 40).join(',')})`;
          else for (const mode of ['capture_the_flag', 'zone_control', 'turbo_ball']) {
            const c = modes.createMatchModeController({ mode, entities: ents.map((e) => structuredClone(e)), revive: () => {}, terrainHeight: (x, z) => hf.getHeightAt(x, z) });
            const s = c.serialize(); objectives[mode] = { flags: s.flags, zones: s.zones, ball: s.ball, goals: s.goals };
          }
          const feat = w.getMinimapFeatures();
          return { size: 1024, samples: N, spacingM: 1, originXZ: [-512, -512], minY: mn, maxY: mx, groundTypes: ['hard', 'medium', 'soft'],
            spawnPoints: w.spawnPoints, battleStartTanks: ents.map((e) => ({ id: e.id, team: e.team, bot: e.bot, pos: e.state.pos, yaw: e.state.yaw })),
            objectives, features: JSON.parse(JSON.stringify(feat)), config: JSON.parse(JSON.stringify(w.config)) };
        });
        await readOut(mp, path.join(dir, 'terrain.glb'));
        const fetchBuf = async (name) => { await mp.evaluate((n) => { window.__out = window[n]; }, name); };
        await fetchBuf('__hf'); await readOut(mp, path.join(dir, 'heightfield_f32.raw'));
        await fetchBuf('__gt'); await readOut(mp, path.join(dir, 'groundtype_u8.raw'));
        fs.writeFileSync(path.join(dir, 'map.json'), JSON.stringify(meta, null, 1));
        // 2) props + vegetation: one entry per distinct (geometry, material) "type", placements = world TRS.
        const types = await mp.evaluate(async () => {
          const { THREE: T0 } = await window.__X; const T = T0 || (await import('/node_modules/three/build/three.module.js'));
          const w = window.__DEBUG.scene.getObjectByName('world-' + window.__DEBUG.world.mapId);
          const [, veg, props] = w.children; const r = (x) => Math.round(x * 1000) / 1000;
          const types = new Map(); const m4 = new T.Matrix4(), mw = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), s = new T.Vector3();
          const place = (layer, o, mat) => {
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            const key = `${layer}|${o.geometry.uuid}|${mats.map((m) => m.uuid).join(',')}`;
            let t = types.get(key);
            if (!t) { t = { id: `${layer}_${(o.name || o.parent?.name || 'mesh').replace(/[^\w-]+/g, '_')}_${types.size}`, layer, name: o.name, parent: o.parent?.name || '',
              instanced: !!o.isInstancedMesh, obj: o, placements: [] }; types.set(key, t); }
            mat.decompose(p, q, s); if (s.x === 0 && s.y === 0 && s.z === 0) return; // parked/crushed instance
            t.placements.push([r(p.x), r(p.y), r(p.z), r(q.x), r(q.y), r(q.z), r(q.w), r(s.x), r(s.y), r(s.z)]);
          };
          for (const [layer, g] of [['veg', veg], ['prop', props]]) g.traverse((o) => {
            if (!o.isMesh || !o.geometry) return; o.updateWorldMatrix(true, false);
            if (o.isInstancedMesh) for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m4); place(layer, o, mw.multiplyMatrices(o.matrixWorld, m4)); }
            else place(layer, o, o.matrixWorld);
          });
          window.__types = [...types.values()].filter((t) => t.placements.length);
          return window.__types.map(({ obj, ...t }) => t);
        });
        let glbBytes = 0; const skipped = [];
        for (let i = 0; i < types.length; i++) {
          try {
            await mp.evaluate(async (i) => {
              const { toGlb, THREE: T0 } = await window.__X; const T = T0 || (await import('/node_modules/three/build/three.module.js'));
              const t = window.__types[i]; const m = new T.Mesh(t.obj.geometry, t.obj.material); m.name = t.id;
              window.__out = new Uint8Array(await toGlb(m));
            }, i);
            const f = path.join(dir, 'props', `${types[i].id}.glb`); await readOut(mp, f);
            glbBytes += externalizeImages(f) || fs.statSync(f).size;
          } catch (e) { skipped.push(`${types[i].id}: ${String(e.message || e).slice(0, 120)}`); }
        }
        fs.writeFileSync(path.join(dir, 'placements.json'), JSON.stringify({ format: '[px,py,pz, qx,qy,qz,qw, sx,sy,sz] world space, three.js axes', types, skipped }));
        if (skipped.length) failures.push(`${mapId} prop GLBs skipped: ${skipped.length}`);
        log(`map ${mapId}: ${types.length} types, ${types.reduce((a, t) => a + t.placements.length, 0)} placements, prop GLBs ${(glbBytes / 1e6).toFixed(1)} MB`);
        await mp.close();
      } catch (e) { failures.push(`map ${mapId}: ${String(e.message || e).slice(0, 200)}`); log('FAIL map', mapId, String(e).slice(0, 300)); }
    }
  }
} finally {
  await browser.close(); await server.close();
  if (failures.length) { log('FAILURES:'); for (const f of failures) log(' ', f); }
}
