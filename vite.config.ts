import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { version } from './package.json';

export default defineConfig({
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['static/cons-logo.png', 'static/logo.png'],
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
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 8100,
    proxy: {
      '/bc': {
        target: 'https://rgmc-gcp-api-935246372408.asia-southeast1.run.app',
        changeOrigin: true,
        secure: true,
      },
    },
  },
});
