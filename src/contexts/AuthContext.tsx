import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { auth, isFirebaseConfigured } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface AuthValue {
  user: User | null;
  loading: boolean;
}

const AuthContext = createContext<AuthValue>({ user: null, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      console.warn('[Auth] Firebase not configured');
      setLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth as import('firebase/auth').Auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return <AuthContext.Provider value={{ user, loading }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);