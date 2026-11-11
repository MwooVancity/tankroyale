import type { Camera, Object3D, Scene, Mesh, FogExp2 } from 'three';
import { Vector3, Sphere } from 'three';

// EXPERIMENT (owner via PM 2026-11-11: "can three.js in a WebView hit 30 fps on
// the 6a at all?"). A look-be-damned floor: ?emergency (or Game Loop scenario 4).
// Every tank draws its baked proxy, no shadow map, world meshes past 250 m are
// hidden and fog closes by 250 m. Measures the engine, not a shippable look.

let forced = false;
const forcedHooks: Array<() => void> = [];
/** Game Loop scenarios 4/5 arrive after boot: owners (renderer.ts) react here. */
export function onEmergencyForced(fn: () => void): void { forcedHooks.push(fn); }
export function forceEmergencyPreset(): void {
  if (forced) return;
  forced = true;
  for (const fn of forcedHooks) { try { fn(); } catch { /* experiment only */ } }
}
export function isEmergencyPreset(): boolean {
  if (forced) return true;
  try { return new URLSearchParams(window.location.search).has('emergency'); } catch { return false; }
}

export const EMERGENCY_VIEW_M = 250;   // terrain
export const EMERGENCY_PROP_M = 150;   // props and vegetation
const _cam = new Vector3(), _sph = new Sphere();

/** 1 s scan: hide world meshes whose bounds lie wholly past the view distance. Returns meshes hidden. */
export function emergencyCull(scene: Scene, camera: Camera): number {
  camera.getWorldPosition(_cam);
  let hidden = 0;
  for (const world of scene.children) {
    if (!world.name.startsWith('world-')) continue;
    for (const part of world.children) part.traverse((o: Object3D) => {
      const limit = part.name === 'terrain' ? EMERGENCY_VIEW_M : EMERGENCY_PROP_M;
      const m = o as Mesh & { isInstancedMesh?: boolean; boundingSphere?: Sphere | null; computeBoundingSphere?: () => void };
      if (!m.isMesh || !m.geometry) return;
      const ud = m.userData as { emergencyHidden?: boolean };
      let s: Sphere | null | undefined;
      if (m.isInstancedMesh) { if (!m.boundingSphere) m.computeBoundingSphere?.(); s = m.boundingSphere; }
      else { if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere(); s = m.geometry.boundingSphere; }
      if (!s) return;
      _sph.copy(s).applyMatrix4(m.matrixWorld);
      const far = _cam.distanceTo(_sph.center) - _sph.radius > limit;
      if (far && m.visible) { m.visible = false; ud.emergencyHidden = true; hidden++; }
      else if (!far && ud.emergencyHidden) { m.visible = true; ud.emergencyHidden = false; }
    });
  }
  const fog = scene.fog as FogExp2 | null;
  // exp2 fog: 1 - exp(-(d * density)^2) reaches ~0.98 at d = 2 / density.
  if (fog && 'density' in fog && fog.density < 2 / EMERGENCY_VIEW_M) fog.density = 2 / EMERGENCY_VIEW_M;
  return hidden;
}
