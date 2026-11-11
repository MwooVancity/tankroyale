import type { Object3D } from 'three';

// Art direction C ("Blitz-like", owner-approved 2026-11-11), phones only:
// the world (props, vegetation, terrain) casts no live shadow and props and
// vegetation receive none; only tanks cast, and the terrain still receives, so
// tank ground shadows stay. Headless dry run: shadow pass 47-85 -> 15-26 draws.
// Applied at world build (before shader warm-up, so no in-battle compiles)
// and again by the 1 s scene scan for anything streamed in later.

/** Returns meshes changed. `root` is a world group ('world-<id>') or the scene. */
export function applyPhoneWorldShadows(root: Object3D | null | undefined): number {
  if (!root) return 0;
  let changed = 0;
  const visit = (o: Object3D, inTerrain: boolean): void => {
    const terrain = inTerrain || o.name === 'terrain';
    const m = o as Object3D & { isMesh?: boolean };
    if (m.isMesh) {
      const receive = terrain;
      if (o.castShadow || o.receiveShadow !== receive) { o.castShadow = false; o.receiveShadow = receive; changed++; }
    }
    for (const c of o.children) visit(c, terrain);
  };
  if (root.name.startsWith('world-')) visit(root, false);
  else for (const c of root.children) if (c.name.startsWith('world-')) visit(c, false);
  return changed;
}
