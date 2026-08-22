import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { handleGoogleRedirect } from './lib/googleAuth'

// Apply saved theme synchronously before first paint to avoid a flash.
document.documentElement.dataset.theme = localStorage.getItem('council-theme') || 'dark'

handleGoogleRedirect()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
