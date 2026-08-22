import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { createRequire } from 'module';
import { execSync } from 'child_process';
const require = createRequire(import.meta.url);
const pkg = require('./package.json');
const commitHash = execSync('git rev-parse HEAD').toString().trim().slice(0, 8);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(() => {
  return {
    base: '/',
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['sss-logo.png'],
        manifest: {
          name: 'Chamber Bingo',
          short_name: 'Bingo',
          description: 'Hudson Valley Gateway Chamber of Commerce Bingo',
          theme_color: '#1695B2',
          background_color: '#F5F5F0',
          display: 'standalone',
          orientation: 'portrait',
          scope: '/',
          start_url: '/',
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          // The variable fonts ship one woff2 per unicode-range subset. Only the
          // Latin ones are ever needed here, and precaching all 24 added ~675KB
          // to the install for nothing. The rest stay in the build and are still
          // fetched on demand by any browser that actually needs them.
          globIgnores: [
            '**/*-{cyrillic,cyrillic-ext,vietnamese,greek,greek-ext,math,symbols}-*.woff2',
          ],
          // Exclude Firebase's reserved /__/ paths from the SW navigation fallback.
          // Without this, the SW intercepts /__/auth/handler and serves our app
          // instead of Firebase's auth handler, breaking OAuth popups.
          navigateFallbackDenylist: [/^\/__\//],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
              handler: 'NetworkFirst',
              options: { cacheName: 'firestore-cache' },
            },
            {
              urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
              handler: 'CacheFirst',
              options: { cacheName: 'map-tiles', expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 } },
            },
          ],
        },
      }),
    ],
    define: {
      // GEMINI_API_KEY was inlined here. `define` performs a literal text
      // substitution into the bundle, so whatever that variable held shipped to
      // every browser in plain text. It is blank today and the Google GenAI
      // dependency is not installed, so nothing used it -- but the day someone
      // filled it in, they would have published it.
      __APP_VERSION__: JSON.stringify(`${pkg.version}.${commitHash}`),
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      headers: {
        // Allow Firebase OAuth popups to close themselves
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      },
    },
  };
});
