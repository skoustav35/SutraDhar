import { auth, isFirebaseConfigured } from './firebase';
import { GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult } from 'firebase/auth';

const isMobile = () => /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('email');
googleProvider.addScope('profile');
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

export function signInWithGoogle(_appName = 'The Council') {
  if (!isFirebaseConfigured || !auth) {
    console.error('[google-auth] Firebase not configured');
    return;
  }
  signInWithPopup(auth, googleProvider).catch((error) => {
    console.error('[google-auth] signInWithPopup failed:', error.message);
  });
}

export async function handleGoogleRedirect() {
  if (!isFirebaseConfigured || !auth) return;
  try {
    const result = await getRedirectResult(auth);
    if (result) {
      console.log('[google-auth] Redirect sign-in successful');
    }
  } catch (error) {
    console.error('[google-auth] getRedirectResult failed:', error);
  }
}