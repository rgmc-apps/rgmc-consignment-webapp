import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';
import { execSync } from 'node:child_process';
// Single source of truth for the human-readable app version (bumped by hand for
// real releases — see the comment in src/version.ts). The per-commit identifier
// that changes automatically is __APP_BUILD__ below, not this.
import { APP_VERSION } from './src/version';

// Short commit SHA of the exact source this build was made from. Requires `git`
// on PATH and a .git directory in the build context — both true for local dev and
// for the Docker build (the builder stage installs git and .dockerignore no longer
// strips .git; see Dockerfile). Returns null instead of throwing so a build never
// fails just because git metadata isn't available (e.g. a tarball with no .git).
function getGitSha(): string | null {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
}

// Stamped at build time — changes on every `npm run build`, so every GCP deployment
// gets a unique, traceable identifier without needing any commit-back workflow.
// Commit count was tried before and rejected: Cloud Build's checkout here is a
// shallow clone (depth 1), so `git rev-list --count` always returns 1. The short
// SHA has no such problem — even a depth-1 clone knows its own commit hash — so it
// carries the "which commit" information and the timestamp disambiguates rebuilds
// of that same commit (cache-busted redeploys, manual re-runs, etc).
function getBuildId(): string {
  const sha = getGitSha();
  const timestamp = new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return sha ? `${sha} · ${timestamp}` : timestamp;
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
      __APP_VERSION__: JSON.stringify(APP_VERSION),
      __APP_BUILD__:   JSON.stringify(getBuildId()),
    },
    build: {
      // Framework code changes far less often than app code. Keeping it in its own
      // hashed chunk means a deploy only invalidates the (small) app chunks in the
      // browser/service-worker cache instead of the whole 1.3 MB bundle.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('/bcryptjs/')) return undefined; // stays a lazy chunk (login only)
            if (id.includes('/@ionic/') || id.includes('/ionicons/')) return 'ionic';
            if (id.includes('/vue') || id.includes('/pinia/') || id.includes('/@vue/')) return 'vue';
            return 'vendor';
          },
        },
      },
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
