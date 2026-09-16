import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled offline fonts — no CDN dependency for a local app.
import '@fontsource/instrument-sans/400.css'
import '@fontsource/instrument-sans/500.css'
import '@fontsource/instrument-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import { App } from './App.tsx'
import { ToastHost } from './components/common/Toast.tsx'
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx'
import { TooltipProvider } from './components/ui/TooltipProvider.tsx'
import './styles/app.css'
import './styles/markdown.css'
import './styles/motion.css'

createRoot(document.getElementById('root') ?? document.body).render(
  <StrictMode>
    <TooltipProvider>
      <ToastHost>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </ToastHost>
    </TooltipProvider>
  </StrictMode>,
)
