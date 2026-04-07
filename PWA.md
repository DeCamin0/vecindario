# PWA – Vecindario

This app is a **Progressive Web App (PWA)** ready for production at the site root (e.g. `https://vecindario.decaminoservicios.com/`).

## What was added

- **vite-plugin-pwa** – Generates the web manifest, service worker (Workbox), and registration script.
- **Web App Manifest** (`manifest.webmanifest`) – Name, short_name, description, start_url, scope, display (standalone), theme_color, background_color, and icons (192×192, 512×512).
- **Service worker** (`sw.js`) – Precaches HTML, JS, CSS, and assets; uses a navigation fallback to `index.html` for SPA routing; works with `base: '/'`.
- **Icons** – `public/icon-192.png` and `public/icon-512.png` (from the app logo) for install and home screen.
- **Meta tags** – `theme-color`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style` for install and standalone behaviour.

## How to test PWA on mobile (install)

1. **Deploy** the `dist/` folder at the **document root** of the vhost (same pattern as DeCamino).

2. **On Android (Chrome):**
   - Open your production URL in Chrome.
   - Tap the **menu** (⋮) → **“Install app”** or **“Add to Home screen”**.
   - Confirm; the app icon appears on the home screen.
   - Open it: the app runs in **standalone** mode (no browser UI).

3. **On iOS (Safari):**
   - Open your production URL in Safari.
   - Tap the **Share** button → **“Add to Home Screen”**.
   - Name it and tap **Add**.
   - Open the icon from the home screen: the app runs in standalone mode (status bar uses `black-translucent`).

4. **Requirements:**
   - The site must be served over **HTTPS** (or `localhost` for testing).
   - The server must serve the app (and assets) at the vhost root (`/`).

## Build

```bash
npm run build
```

Output is in `dist/`, ready to deploy. The service worker and manifest use root paths (`base: '/'`).
