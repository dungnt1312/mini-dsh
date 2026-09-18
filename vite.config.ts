import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { pwaServiceWorker } from './web/pwa/pwa-plugin.ts'

export default defineConfig({
  root: 'web',
  base: '/',
  plugins: [react(), tailwindcss(), pwaServiceWorker()],
  build: {
    outDir: '../web-dist',
    emptyOutDir: true,
  },
})
