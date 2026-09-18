/// <reference types="vite/client" />
/**
 * Register the build-emitted service worker so the client installs as a PWA.
 * Skipped in the Vite dev server (no `sw.js` there) and in browsers without
 * service worker support; a failed registration leaves the app fully usable.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => undefined)
  })
}
