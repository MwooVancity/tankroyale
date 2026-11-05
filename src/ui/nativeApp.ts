// True inside the Capacitor Android/iOS app. There, any extension-less path on
// https://localhost serves index.html (a full game reboot), so web pages,
// /api routes and outside links must be skipped.
export function isNativeApp(): boolean {
  return !!(globalThis as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();
}
