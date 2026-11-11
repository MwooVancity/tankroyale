/**
 * Google Sign-In wrapper for Tank Royale.
 * Uses @codetrix-studio/capacitor-google-auth on Android/iOS,
 * falls back to no-op in browser (desktop play still works).
 */

import { Capacitor, registerPlugin } from '@capacitor/core';

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

const ASKED_KEY = 'tr.google.asked';
let askedThisSession = false;
export function googleAsked(): boolean {
  if (askedThisSession) return true;
  try { return localStorage.getItem(ASKED_KEY) === '1'; } catch { return false; }
}
function markGoogleAsked(): void {
  askedThisSession = true;
  try { localStorage.setItem(ASKED_KEY, '1'); } catch { /* session flag still holds */ }
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
  // Ask once (teardown 2026-11-10: the sheet reopened on every Private/LAN
  // pick only to fill the nickname). A cancel or failure is remembered; the
  // nickname field stays editable, so nothing is lost.
  if (googleAsked()) return null;
  markGoogleAsked();

  try {
    // A runtime import('@codetrix-studio/...') can never resolve inside the packaged
    // app (same bug admob.ts had), so sign-in silently never ran. Bind natively.
    if (!Capacitor.isNativePlatform()) return null;
    const GoogleAuth = registerPlugin<{ initialize(): Promise<void>; signIn(): Promise<{ id: string; displayName: string; name: string; email: string; imageUrl: string }>; signOut(): Promise<void> }>('GoogleAuth');
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
