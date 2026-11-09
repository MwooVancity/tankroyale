// On-phone A/B lab: TEST BUILDS ONLY (VITE_PERF_LAB=1, never in a Play build).
// Once a battle runs, it cycles render settings every few seconds and logs one
// `[lab]` line per setting to logcat, so a single Firebase Test Lab run says
// what each part of the frame costs on a real phone.
import * as THREE from 'three';

type Cfg = { name: string; on(): void; off(): void; direct?: boolean };

export function createPerfLab(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
  setScale: (ratio: number | null) => void) {
  const SETTLE_MS = 2500, MEASURE_MS = 5000, START_AFTER_MS = 20000;
  const nop = () => {};
  const css = new THREE.Vector2();
  const scaled = (r: number) => ({ on: () => setScale(r), off: () => setScale(null) });
  const out = (r: number) => ({ on: () => setScale(-r), off: () => setScale(null) });
  const hideCss = (sel: string) => ({
    on: () => document.querySelectorAll<HTMLElement>(sel).forEach((e) => { e.style.display = 'none'; }),
    off: () => document.querySelectorAll<HTMLElement>(sel).forEach((e) => { e.style.display = ''; }),
  });
  // Shadows fully off (pass + sampling; recompiles, the stall reset handles it).
  const shadowCasters = (on: boolean) => scene.traverse((o) => { if ((o as THREE.DirectionalLight).isDirectionalLight) (o as THREE.DirectionalLight).castShadow = on; });
  // Lab #5 (2026-11-09): mediump on every material (Mali runs fp16 much faster),
  // a shorter view distance, and the best-case combo, measured on current code.
  const mediump = (on: boolean) => scene.traverse((o) => {
    const ms = (o as THREE.Mesh).material; if (!ms) return;
    for (const m of (Array.isArray(ms) ? ms : [ms]) as THREE.Material[]) { m.precision = on ? 'mediump' : null; m.needsUpdate = true; }
  });
  const pc = camera as THREE.PerspectiveCamera; let farWas = 0;
  const far = (on: boolean, d: number) => { if (on) { farWas = pc.far; pc.far = d; } else if (farWas) pc.far = farWas; pc.updateProjectionMatrix(); };
  const hudAll = hideCss('.cot-hud');
  const named = (n: string) => { const o = scene.getObjectByName(n); return o ? [o] : []; };
  const hideObjs = (pick: () => THREE.Object3D[]) => { let hid: THREE.Object3D[] = []; return {
    on: () => { hid = pick().filter((o) => o.visible); hid.forEach((o) => { o.visible = false; }); },
    off: () => { hid.forEach((o) => { o.visible = true; }); hid = []; } }; };
  const cfgs: Cfg[] = [
    { name: 'ship', on: nop, off: nop },
    // Lab #6: where do the ~460 draw calls go? Hide one group per row.
    { name: 'ship+hide:tanks', ...hideObjs(() => scene.children.filter((c) => c.name.startsWith('tank_'))) },
    { name: 'ship+hide:props', ...hideObjs(() => named('props')) },
    { name: 'ship+hide:vegetation', ...hideObjs(() => named('vegetation')) },
    { name: 'ship+hide:fx', ...hideObjs(() => named('fx')) },
    { name: 'ship+hide:worldOther', ...hideObjs(() => (scene.children.find((c) => c.name.startsWith('world-'))?.children || []).filter((c) => c.name !== 'props' && c.name !== 'vegetation')) },
    { name: 'ship+far250', on: () => far(true, 250), off: () => far(false, 0) },
    { name: 'ship+hud:allHidden', ...hudAll },
    { name: 'ship-again', on: nop, off: nop },
  ];
  // Then hide each big top-level scene group, one at a time (full chain).
  let groupsAdded = false;
  const addGroups = () => {
    if (groupsAdded) return;
    groupsAdded = true;
    const names: string[] = [];
    for (const child of scene.children) {
      let n = 0;
      child.traverse(() => { n++; });
      names.push(`${child.name || child.type}:${n}`);
      if (n < 20 || !child.visible) continue;
    }
    console.info(`[lab] scene children ${names.join(' ')}`);
  };

  let firstAt = 0, idx = -1, phaseAt = 0, frames = 0, sumMs = 0, sumCpu = 0, sumRenderJs = 0, calls = 0, tris = 0, lastAt = 0, done = false;
  const start = (i: number, now: number) => {
    idx = i; phaseAt = now; frames = 0; sumMs = 0; sumCpu = 0; sumRenderJs = 0; calls = 0; tris = 0;
    cfgs[idx].on();
  };
  return {
    /** True when this frame must skip the composer and draw straight to the canvas. */
    get direct() { return !done && idx >= 0 && !!cfgs[idx].direct; },
    /** Call at the start of post.render. */
    begin(now: number) {
      if (done) return;
      if (idx < 0) {
        // Battle world present (the garage has no vegetation): start the clock.
        if (!firstAt) {
          if (now - lastAt < 1000) return;
          lastAt = now;
          if (scene.getObjectByName('vegetation')) { firstAt = now; console.info('[lab] battle seen'); }
          return;
        }
        if (now - firstAt < START_AFTER_MS) return;
        addGroups();
        renderer.info.autoReset = false;
        console.info(`[lab] start gl=${(renderer.getContext().getParameter(0x1F01) || '?')} css=${renderer.getSize(css).x}x${css.y} dpr=${window.devicePixelRatio}`);
        lastAt = 0;
        start(0, now);
      }
      renderer.info.reset();
      if (lastAt && now - lastAt > 700) { console.info(`[lab] stall ${Math.round(now - lastAt)} ms in ${cfgs[idx].name}`); phaseAt = now; frames = 0; sumMs = 0; sumCpu = 0; sumRenderJs = 0; calls = 0; tris = 0; }
      if (lastAt && now - phaseAt > SETTLE_MS) { frames++; sumMs += now - lastAt; sumCpu += (globalThis as { __frameCpuMs?: number }).__frameCpuMs || 0; }
      lastAt = now;
      if (now - phaseAt >= SETTLE_MS + MEASURE_MS) {
        const c = cfgs[idx];
        const b = renderer.getDrawingBufferSize(new THREE.Vector2());
        console.info(`[lab] cfg=${c.name} fps=${(1000 * frames / Math.max(1, sumMs)).toFixed(1)} frameMs=${(sumMs / Math.max(1, frames)).toFixed(1)}`
          + ` mainThreadMs=${(sumCpu / Math.max(1, frames)).toFixed(1)} renderJsMs=${(sumRenderJs / Math.max(1, frames)).toFixed(1)}`
          + ` calls=${Math.round(calls / Math.max(1, frames))} tris=${Math.round(tris / Math.max(1, frames))} buf=${b.x}x${b.y} progs=${renderer.info.programs?.length}`);
        c.off();
        if (idx + 1 >= cfgs.length) { done = true; renderer.info.autoReset = true; console.info('[lab] done'); return; }
        start(idx + 1, now);
      }
    },
    /** Call after the frame was drawn, with the JS time spent drawing. */
    end(renderJsMs: number) {
      if (done || idx < 0 || performance.now() - phaseAt <= SETTLE_MS) return;
      sumRenderJs += renderJsMs;
      calls += renderer.info.render.calls;
      tris += renderer.info.render.triangles;
    },
  };
}
