import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import Mandala from './Mandala';

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212] text-[#FF9933]">
        <div className="relative">
          <Mandala className="w-24 h-24 opacity-60" />
          <div className="absolute inset-0 flex items-center justify-center text-xs tracking-[0.3em] text-[#c9a24a]">
            OM
          </div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/" replace />;
  return <>{children}</>;
}
