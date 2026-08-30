/**
 * Google Sign-In wrapper for Tank Royale.
 * Uses @codetrix-studio/capacitor-google-auth on Android/iOS,
 * falls back to no-op in browser (desktop play still works).
 */

export interface GoogleUser {
  id: string;
  displayName: string;
  email: string;
  photoUrl: string;
}

const STORED_KEY = 'tr.google.user.v1';

function storedUser(): GoogleUser | null {
  try {
    const raw = localStorage.getItem(STORED_KEY);
    return raw ? (JSON.parse(raw) as GoogleUser) : null;
  } catch {
    return null;
  }
}

function saveUser(user: GoogleUser): void {
  try { localStorage.setItem(STORED_KEY, JSON.stringify(user)); } catch { /* ok */ }
}

export function clearGoogleUser(): void {
  try { localStorage.removeItem(STORED_KEY); } catch { /* ok */ }
}

/** Returns cached user without network call. */
export function getCachedGoogleUser(): GoogleUser | null {
  return storedUser();
}

/**
 * Sign in with Google.
 * On Android: triggers the native Google Sign-In sheet.
 * In browser: resolves immediately with null (graceful no-op).
 */
export async function signInWithGoogle(): Promise<GoogleUser | null> {
  // Return cached user if already signed in
  const cached = storedUser();
  if (cached) return cached;

  try {
    // Use indirect import so Vite/rolldown doesn't try to bundle the native plugin
    const pkg = '@codetrix-studio/capacitor-google-auth';
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const { GoogleAuth } = await (new Function('p', 'return import(p)'))(pkg) as typeof import('@codetrix-studio/capacitor-google-auth');
    await GoogleAuth.initialize();
    const result = await GoogleAuth.signIn();
    const user: GoogleUser = {
      id: result.id || '',
      displayName: result.displayName || result.name || '',
      email: result.email || '',
      photoUrl: result.imageUrl || '',
    };
    if (user.id) saveUser(user);
    return user;
  } catch (err: unknown) {
    // Not on Android, plugin not available, or user cancelled — all fine
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('cancel') && !msg.includes('Cancel') && !msg.includes('dismissed')) {
      console.warn('[GoogleAuth] sign-in skipped:', msg);
    }
    return null;
  }
}

export async function signOutGoogle(): Promise<void> {
  clearGoogleUser();
  try {
    const { GoogleAuth } = await import('@codetrix-studio/capacitor-google-auth');
    await GoogleAuth.signOut();
  } catch { /* ok */ }
}
