import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import ProtectedRoute from './components/ProtectedRoute';
import Landing from './pages/Landing';
import CouncilApp from './pages/CouncilApp';
import ApiPage from './pages/ApiPage';
import Research from './pages/Research';

function RootGate() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-[#121212]" />;
  if (user) return <Navigate to="/app" replace />;
  return <Landing />;
}

export default function App() {
  return (
    <ThemeProvider>
    <AuthProvider>
      <BrowserRouter>
        <AnimatePresence mode="wait">
          <Routes>
            <Route path="/" element={<RootGate />} />
            <Route path="/research" element={<Research />} />
            <Route
              path="/app"
              element={
                <ProtectedRoute>
                  <CouncilApp />
                </ProtectedRoute>
              }
            />
            <Route
              path="/app/api"
              element={
                <ProtectedRoute>
                  <ApiPage />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
