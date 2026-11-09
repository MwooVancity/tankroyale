// Performance preset: hide scenery (props + vegetation) whose nearest edge is
// farther than `maxM` from the camera. Tanks and terrain are never touched, so
// no enemy is ever hidden. Lab #5 (vc883, Pixel 6a): the frame is main-thread
// bound on draw submission; a 250 m view cut took 368 calls to 299 and
// 25-29 fps to 30.1. Big objects (terrain-sized, merged/instanced spreads) stay
// visible because their bounding sphere reaches the camera.
import * as THREE from 'three';

const GROUPS = ['props', 'vegetation'];
const _c = new THREE.Vector3();
const _s = new THREE.Sphere();

export interface CullItem { obj: THREE.Object3D; sphere: THREE.Sphere | null }

/** True when the sphere's nearest point is beyond maxM from cam. */
export function beyond(cam: THREE.Vector3, center: THREE.Vector3, radius: number, maxM: number): boolean {
  return cam.distanceTo(center) - radius > maxM;
}

export function createFarCull(maxM = 250, everyMs = 400) {
  let items: CullItem[] = [];
  let worldRef: THREE.Object3D | null = null;
  let at = 0;
  const collect = (scene: THREE.Scene) => {
    items = [];
    worldRef = scene.children.find((c) => c.name.startsWith('world-')) || null;
    if (!worldRef) return;
    for (const g of worldRef.children) {
      if (!GROUPS.includes(g.name)) continue;
      // Direct children: a whole prop/tree cluster toggles as one.
      for (const obj of g.children) items.push({ obj, sphere: null });
    }
  };
  return {
    update(scene: THREE.Scene, camera: THREE.Camera, now: number, on: boolean) {
      if (now - at < everyMs) return;
      at = now;
      if (!worldRef || worldRef.parent !== scene) collect(scene);
      camera.getWorldPosition(_c);
      for (const it of items) {
        if (!on) { if (it.obj.userData.farCulled) { it.obj.visible = true; it.obj.userData.farCulled = false; } continue; }
        if (!it.sphere) {
          const box = new THREE.Box3().setFromObject(it.obj);
          if (box.isEmpty()) continue;
          it.sphere = box.getBoundingSphere(new THREE.Sphere());
        }
        _s.copy(it.sphere);
        const far = beyond(_c, _s.center, _s.radius, maxM);
        // Only touch objects we hid, so other systems' visibility stays theirs.
        if (far && it.obj.visible) { it.obj.visible = false; it.obj.userData.farCulled = true; }
        else if (!far && it.obj.userData.farCulled) { it.obj.visible = true; it.obj.userData.farCulled = false; }
      }
    },
    get count() { return items.length; },
  };
}
