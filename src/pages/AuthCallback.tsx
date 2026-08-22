import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { handleGoogleRedirect } from '../lib/googleAuth';
import Mandala from '../components/Mandala';

export default function AuthCallback() {
  const location = useLocation();

  useEffect(() => {
    handleGoogleRedirect();
  }, [location.search]);

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