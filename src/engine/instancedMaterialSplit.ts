import type { Material, Object3D } from 'three';

// One material drawn by both an InstancedMesh and a plain Mesh makes three
// rebuild its program parameters (getParameters + cache key) every time the
// instancing flag flips: ~24 times a frame for tank wheels, ~6 ms/frame at 4x
// CPU throttle on winter (frame-profile 2026-11-10). The instanced side gets a
// twin material that mirrors the original by reference before each draw, so
// paint, camo, wreck darkening and needsUpdate on the original still apply.

const SKIP = new Set(['id', 'uuid', 'version', '_listeners']);
// The twin owns these after creation: per-material shader hooks (cascade
// shadows, wreck burn) guard on the material object or userData and must hook
// the twin and the original separately.
const OWN = new Set(['userData', 'defines', 'onBeforeCompile', 'customProgramCacheKey']);
type Twin = { src: Material; dst: Material; keys: string[]; frame: number; srcVersion: number };
type Rec = Record<string, unknown>;

/** Cascade-shadow registration (lighting.twinShadowMaterial / releaseShadowMaterial); set once by main. */
export interface ShadowTwinning { twin(src: Material, dst: Material): boolean; release(dst: Material): unknown }
let shadows: ShadowTwinning | null = null;
export function setShadowTwinning(s: ShadowTwinning | null): void { shadows = s; }

function sync(t: Twin): void {
  const s = t.src as unknown as Rec, d = t.dst as unknown as Rec;
  for (const k of t.keys) if (d[k] !== s[k]) d[k] = s[k];
  if (t.src.version !== t.srcVersion) { t.srcVersion = t.src.version; t.dst.needsUpdate = true; }
}

function makeTwin(src: Material): Twin | null {
  const csm = (src as { defines?: Rec }).defines?.USE_CSM !== undefined;
  if (csm && !shadows) return null;
  const Ctor = src.constructor as new () => Material;
  const dst = new Ctor();
  const all = Object.keys(src).filter((k) => !SKIP.has(k));
  for (const k of all) (dst as unknown as Rec)[k] = (src as unknown as Rec)[k];
  dst.userData = { ...src.userData };
  const defines = (src as { defines?: Rec }).defines;
  if (defines) (dst as unknown as { defines: Rec }).defines = { ...defines };
  // Cascade shadows key their shader on the material object: register the twin itself, same hook.
  if (csm && !shadows!.twin(src, dst)) return null;
  sourceOf.set(dst, src);
  const twin = { src, dst, keys: all.filter((k) => !OWN.has(k)), frame: -1, srcVersion: src.version };
  src.addEventListener('dispose', () => { if (csm) shadows?.release(dst); dst.dispose(); });
  return twin;
}

const twins = new WeakMap<Material, Twin | null>();
const meshTwin = new WeakMap<Object3D, Twin>();
/** Original of a twin material (tests and look checks). */
export function twinSource(m: Material): Material | undefined { return sourceOf.get(m); }
const sourceOf = new WeakMap<Material, Material>();

// Module-level on purpose: a closure made inside splitInstancedMaterials shares
// its scope with the scene-wide `inst` map, so every hooked mesh kept every
// instanced mesh of that traversal (removed bot tanks included) alive.
function hookSync(o: Object3D): void {
  const prev = o.onBeforeRender;
  o.onBeforeRender = function (renderer, ...rest) {
    const f = renderer.info.render.frame;
    const tw = meshTwin.get(this);
    if (tw && tw.frame !== f) { tw.frame = f; sync(tw); }
    return prev.call(this, renderer, ...rest);
  };
}

/** Scene-wide (tanks share fleet materials across tanks): give instanced meshes their own material wherever a plain mesh shares it. Returns meshes moved. */
export function splitInstancedMaterials(root: Object3D | null | undefined): number {
  if (!root) return 0;
  const plain = new Set<Material>(), inst = new Map<Material, Object3D[]>();
  root.traverse((o) => {
    const m = (o as { material?: Material | Material[] }).material;
    if (!m || Array.isArray(m) || !(o as { isMesh?: boolean }).isMesh) return;
    if ((o as { isInstancedMesh?: boolean }).isInstancedMesh) {
      const list = inst.get(m) || []; list.push(o); inst.set(m, list);
    } else plain.add(m);
  });
  let n = 0;
  for (const [src, meshes] of inst) {
    if (!plain.has(src)) continue;
    let twin = twins.get(src);
    if (twin === undefined) { twin = makeTwin(src); if (twin || shadows) twins.set(src, twin); }
    if (!twin) continue;
    const t: Twin = twin;
    for (const o of meshes) {
      (o as unknown as { material: Material }).material = t.dst;
      n++;
      const had = meshTwin.has(o);
      meshTwin.set(o, t);
      if (!had) hookSync(o);
    }
  }
  return n;
}
