// A phone call or app switch mid solo battle: open the pause menu so the
// player comes back to "Paused", not to a fight already in progress. The
// settings panel IS the pause (battleFrameRuntime stops the sim while open).
export interface PausePort {
  isOpen(): boolean;
  open(): void;
}

export function pauseOnBackground(settings: PausePort, battleActive: () => boolean) {
  return (backgrounded: boolean): boolean => {
    if (!backgrounded || settings.isOpen() || !battleActive()) return false;
    settings.open();
    return true;
  };
}
