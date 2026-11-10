import { Vector3, type Camera } from 'three';

export interface MobileAutoAimEntity {
  team?: unknown;
  state: { pos: Vector3 };
  spec: { dims: { heightM: number } };
  combat: { destroyed?: boolean };
}

const _center = new Vector3();
const _ndc = new Vector3();

/** Center-mass point used by both acquisition and the live lock. */
export function mobileAutoAimCenter(
  entity: MobileAutoAimEntity,
  out: Vector3,
): Vector3 {
  out.copy(entity.state.pos);
  out.y += entity.spec.dims.heightM * 0.5;
  return out;
}

interface LeadShooter {
  state: { pos: Vector3 };
  combat: { shellSlot?: number };
  spec: { gun?: { shells?: ReadonlyArray<{ velocityMps?: number; guided?: boolean }> } };
}

/**
 * Center mass moved forward by the target's ground speed x shell flight time,
 * the same lead the bots compute (ai.ts aimAndFire). A mover past ~300 m was
 * otherwise missed behind by the locked reticle. Guided rounds steer to the
 * reticle themselves, so they get no lead.
 */
export function mobileAutoAimLeadPoint(
  target: MobileAutoAimEntity & { state: { yaw?: number; speed?: number } },
  shooter: LeadShooter | null | undefined,
  out: Vector3,
): Vector3 {
  mobileAutoAimCenter(target, out);
  const shells = shooter?.spec?.gun?.shells;
  const shell = shells?.[Math.max(0, Math.min(shells.length - 1, (shooter?.combat?.shellSlot ?? 0) | 0))];
  const v = shell?.velocityMps || 0;
  const speed = target.state.speed || 0;
  if (!shooter || !shell || shell.guided || v < 100 || !speed) return out;
  const t = out.distanceTo(shooter.state.pos) / v;
  out.x += Math.sin(target.state.yaw || 0) * speed * t;
  out.z += Math.cos(target.state.yaw || 0) * speed * t;
  return out;
}

/** Pick the closest-to-reticle visible enemy inside a generous lock window. */
export function pickMobileAutoAimTarget<T extends MobileAutoAimEntity>(
  tanks: readonly T[] | null | undefined,
  player: T | null | undefined,
  camera: Camera | null | undefined,
  isVisible: (entity: T) => boolean = () => true,
): T | null {
  if (!player || !camera || !Array.isArray(tanks)) return null;
  camera.updateMatrixWorld(true);
  let best: T | null = null;
  let bestScore = Infinity;
  for (const ent of tanks) {
    if (!ent || ent === player || ent.team === player.team || !ent.state || !ent.spec ||
        !ent.combat || ent.combat.destroyed || !isVisible(ent)) continue;
    mobileAutoAimCenter(ent, _center);
    _ndc.copy(_center).project(camera);
    if (_ndc.z < -1 || _ndc.z > 1 || Math.abs(_ndc.x) > 0.72 || Math.abs(_ndc.y) > 0.66) continue;
    const rangeM = _center.distanceTo(player.state.pos);
    const score = _ndc.x * _ndc.x + _ndc.y * _ndc.y * 1.15 + rangeM * 0.00002;
    if (score < bestScore) { bestScore = score; best = ent; }
  }
  return best;
}
