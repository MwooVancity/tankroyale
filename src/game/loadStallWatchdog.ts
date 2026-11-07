/**
 * Battle-load stall watchdog. A load step that never resolves left the loading
 * screen up forever (no timeout anywhere in the entry chain). This fires once
 * when the loader's progress has not moved for `stallMs`.
 * ponytail: stall-based, not a total-time cap: a Pixel 6a load is ~43 s and a
 * budget phone can legitimately take longer, but no single step should sit
 * still for a minute. Breaks if one honest step exceeds 60 s on a weak phone;
 * the `[battle-load] failed stalled <stage>` log names that step.
 */
export interface LoadProgressMark {
  at: number;
  stage: string;
}

export function watchLoadStall(
  last: () => LoadProgressMark,
  onStall: (stage: string, stalledMs: number) => void,
  { stallMs = 60_000, everyMs = 5_000, now = () => performance.now() } = {},
): () => void {
  let fired = false;
  const timer = setInterval(() => {
    const mark = last();
    const stalled = now() - mark.at;
    if (fired || stalled < stallMs) return;
    fired = true;
    clearInterval(timer);
    onStall(mark.stage, Math.round(stalled));
  }, everyMs);
  return () => clearInterval(timer);
}
