// Battle bots merge static parts per (moving node, material). Fails if the
// merge pass is removed (m1a2 bot was 52 draws) or merges across moving nodes.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.js';
import { createTankState } from '../sim/movement.ts';

const build = (botPaint) => createTank('m1a2', null, {
  proceduralOnly: true, geometryReceipt: true, quality: 'ai', geometryQuality: 'low', batchStatic: true, botPaint,
});
const draws = (v) => { let n = 0; v.root.traverseVisible((o) => { if (o.isMesh) n++; }); return n; };

const bot = build(true);
const state = createTankState(getSpec('m1a2'), new THREE.Vector3(), 0);
bot.syncFromState(state, 0, 60);
const merged = [];
const paints = new Set();
bot.root.traverse((o) => { if (o.userData.botMerge) merged.push(o); });
merged.forEach((o) => { if (o.material.color.getHex() === 0xffffff && !o.material.map) paints.add(o.material); });
assert.equal(paints.size, 1, 'bot untextured parts share one paint material');
assert(merged.length > 0, 'bot build installs merged draws');
assert(merged.every((o) => /^rig_/.test(o.parent.name)), 'every merged draw sits directly on a moving rig node');
assert(draws(bot) <= 40, `m1a2 bot draws ${draws(bot)} <= 40 (52 before the merge)`);

// Running gear, tracks and markings never fold into a merge.
bot.root.traverse((o) => {
  if (o.userData.runningGear || o.userData.vehicleMarking) assert(!o.userData.botMerge, `${o.name} kept separate`);
});

// Turret yaw still moves turret parts and never hull parts.
const turretMerge = merged.find((o) => o.parent.name === 'rig_turret');
const hullMerge = merged.find((o) => o.parent.name === 'rig_hull');
assert(turretMerge && hullMerge, 'hull and turret each have merged draws');

state.turretYaw = 1.2;
bot.syncFromState(state, 0, 60);
bot.root.getObjectByName('rig_turret').rotation.y = 1.2;
bot.root.updateMatrixWorld(true);
const q = new THREE.Quaternion();
turretMerge.getWorldQuaternion(q);
assert(Math.abs(q.y) > 0.3, 'turret merged draw follows turret yaw');
hullMerge.getWorldQuaternion(q);
assert(Math.abs(q.y) < 1e-6, 'hull merged draw ignores turret yaw');

// Wreck and rematch keep working on merged draws.
bot.setDestroyed({ ageS: 0 });
bot.resetDestroyed();
bot.dispose();

// Player builds (botPaint off) keep their own materials.
const player = build(false);
player.root.traverse((o) => {
  if (o.userData.botMerge) assert(o.material.color?.getHex?.() !== 0xffffff || o.material.map, `player ${o.name} never uses the white bot paint`);
});
player.dispose();
console.log(`botMerge.selftest: m1a2 bot ${merged.length} merged draws, passed`);
