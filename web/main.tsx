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
import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'
import './styles/shell.css'
import './styles/sidebar.css'
import './styles/chat.css'
import './styles/composer.css'
import './styles/components.css'

createRoot(document.getElementById('root') ?? document.body).render(
  <StrictMode>
    <ToastHost>
      <App />
    </ToastHost>
  </StrictMode>,
)
