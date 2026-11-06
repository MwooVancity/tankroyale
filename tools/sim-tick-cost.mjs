// Per-tick CPU of the battle sim + bot AI in Node (no browser): 10 bots, one map.
// Usage: node tools/sim-tick-cost.mjs [mapId]   add --cpu-prof to node for a profile.
import { createAuthoritativeMatch } from '../src/sim/authoritativeMatch.ts';
import { ALL_TANK_IDS, getSpec } from '../src/vehicles/specs.js';
import { MAP_IDS } from '../src/world/maps/index.ts';
import { createDedicatedWorldCollision } from '../server/dedicatedWorldCollision.ts';

const mapId = process.argv[2] || MAP_IDS[0];
const specs = ALL_TANK_IDS.filter((id) => ['light', 'medium', 'heavy'].includes(getSpec(id).role)).slice(0, 10);
const players = specs.map((specId, i) => ({ id: `b${i}`, specId, team: i < 5 ? 'alpha' : 'bravo', bot: true, difficulty: 'normal' }));
const match = createAuthoritativeMatch({ players, mapId, seed: 7, countdownS: 0, worldCollision: createDedicatedWorldCollision(mapId) });
match.onMatchReady();
const inputs = new Map();
for (let i = 0; i < 120; i++) match.step({ dt: 1 / 60, inputs });
const t0 = performance.now(); let n = 0;
for (; n < 1800 && !match.result; n++) match.step({ dt: 1 / 60, inputs });
console.log(`${mapId}: ${n} ticks, ${((performance.now() - t0) / n).toFixed(2)} ms/tick (desktop CPU, 1x)`);
