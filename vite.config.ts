import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { version } from './package.json';

// Stamped at build time — changes every `npm run build` so each GCP deployment
// gets a unique identifier without relying on git history (shallow clones return 1).
function getBuildTimestamp(): string {
  return new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const proxyTarget = env.VITE_API_BASE_URL;

  return {
    plugins: [
      vue(),
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        includeAssets: ['static/cons-logo.png', 'static/cons-logo-splash.png', 'static/logo.png', 'static/logo-bnw.png'],
        manifest: {
          name: 'RGMC Consignment',
          short_name: 'RGMC',
          description: 'RGMC Consignment Web App',
          theme_color: '#1a1a1a',
          background_color: '#1a1a1a',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: '/static/cons-logo.png', sizes: '192x192', type: 'image/png' },
            { src: '/static/cons-logo.png', sizes: '512x512', type: 'image/png' },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          navigateFallback: '/index.html',
          navigateFallbackDenylist: [/^\/bc\//],
          cleanupOutdatedCaches: true,
        },
      }),
    ],
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_BUILD__:   JSON.stringify(getBuildTimestamp()),
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 8100,
      proxy: proxyTarget
        ? {
            '/bc':       { target: proxyTarget, changeOrigin: true, secure: true },
            '/internal': { target: proxyTarget, changeOrigin: true, secure: true },
            '/tasks':    { target: proxyTarget, changeOrigin: true, secure: true },
          }
        : undefined,
    },
  };
});
