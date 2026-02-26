// Stub – Firebase auth has been removed. These functions exist only to satisfy
// the auto-generated supabase/client.ts import until it is regenerated.

interface MinimalAuth {
  currentUser: { getIdToken: (force: boolean) => Promise<string | null> } | null;
  onAuthStateChanged: (cb: (user: unknown) => void) => () => void;
  signOut: () => Promise<void>;
}

export function getFirebaseAuth(): MinimalAuth | null {
  return null;
}

export function isFirebaseAuthEnabled(): boolean {
  return false;
}
