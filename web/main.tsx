import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled offline fonts — no CDN dependency for a local app.
import '@fontsource/instrument-sans/400.css'
import '@fontsource/instrument-sans/500.css'
import '@fontsource/instrument-sans/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/jetbrains-mono/500.css'
import { App } from './App.tsx'
import './App.css'

createRoot(document.getElementById('root') ?? document.body).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
