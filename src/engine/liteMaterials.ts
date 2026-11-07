// Phone "Performance" preset: draw world and vehicle surfaces with Lambert
// instead of MeshStandard/MeshPhysical. Pixel 6a Test Lab (Android 12): a
// Lambert override took the battle from 11.7 to 44 fps at the same pixels and
// triangles; per-pixel PBR shading was the GPU bill, not draw calls or post.
// Materials with a custom onBeforeCompile (terrain splat, foliage wind) keep
// their own shader: their hooks patch Standard chunks.
import * as THREE from 'three';

const cache = new WeakMap<THREE.Material, THREE.Material>();
type Std = THREE.MeshStandardMaterial & Partial<THREE.MeshPhysicalMaterial>;

function toLambert(src: Std): THREE.Material {
  const hit = cache.get(src);
  if (hit) return hit;
  const m = new THREE.MeshLambertMaterial({
    name: src.name ? `${src.name}.lite` : 'lite',
    color: src.color, map: src.map, alphaMap: src.alphaMap, aoMap: src.aoMap, aoMapIntensity: src.aoMapIntensity,
    emissive: src.emissive, emissiveMap: src.emissiveMap, emissiveIntensity: src.emissiveIntensity,
    lightMap: src.lightMap, lightMapIntensity: src.lightMapIntensity,
    vertexColors: src.vertexColors, transparent: src.transparent, opacity: src.opacity, alphaTest: src.alphaTest,
    side: src.side, depthWrite: src.depthWrite, depthTest: src.depthTest, fog: src.fog, flatShading: src.flatShading,
    polygonOffset: src.polygonOffset, polygonOffsetFactor: src.polygonOffsetFactor, polygonOffsetUnits: src.polygonOffsetUnits,
    blending: src.blending, colorWrite: src.colorWrite, visible: src.visible, toneMapped: src.toneMapped,
  });
  // Metals lit by Lambert read flat and dark; brighten toward their albedo.
  if ((src.metalness ?? 0) > 0.5) m.color = src.color.clone().multiplyScalar(1.25);
  m.userData = src.userData;
  cache.set(src, m);
  cache.set(m, m);
  return m;
}

function lite(mat: THREE.Material): THREE.Material {
  const s = mat as Std;
  if (!(s.isMeshStandardMaterial) || cache.get(mat) === mat) return mat;
  // ponytail: three's default onBeforeCompile is an empty prototype method; an own one is a custom shader hook
  if (Object.prototype.hasOwnProperty.call(mat, 'onBeforeCompile')) return mat;
  return toLambert(s);
}

/** Swap PBR materials under `root` for cached Lambert copies. Returns meshes changed. */
export function applyLiteMaterials(root: THREE.Object3D): number {
  let changed = 0;
  root.traverse((o) => {
    // Battle point lights (muzzle, explosion, killcam, sniper fill) idle at
    // intensity 0 but every lit pixel still loops over them: hiding them was
    // 18 -> 27 fps on the Pixel 6a. Garage lights are never 0 and stay.
    if ((o as THREE.PointLight).isPointLight && (o as THREE.PointLight).intensity === 0 && o.visible) {
      o.visible = false;
      changed++;
      return;
    }
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material || (o as THREE.SkinnedMesh).isSkinnedMesh) return;
    if (Array.isArray(mesh.material)) {
      const next = mesh.material.map(lite);
      if (next.some((m, i) => m !== (mesh.material as THREE.Material[])[i])) { mesh.material = next; changed++; }
    } else {
      const next = lite(mesh.material);
      if (next !== mesh.material) { mesh.material = next; changed++; }
    }
  });
  return changed;
}
