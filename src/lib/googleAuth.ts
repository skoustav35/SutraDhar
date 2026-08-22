import supabase from './supabase';

export function signInWithGoogle() {
  const redirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL;
  if (!redirectUrl) {
    console.warn('[google-auth] Missing VITE_AUTH_REDIRECT_URL');
    return;
  }
  supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: redirectUrl,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });
}

export async function handleGoogleRedirect() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  if (!code) return;
  
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[google-auth] exchangeCodeForSession failed:', error.message);
    return;
  }
  
  window.history.replaceState({}, '', window.location.pathname);
}

export async function signOut() {
  await supabase.auth.signOut();
}