import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath, URL } from 'node:url';
import { version } from './package.json';

export default defineConfig({
  plugins: [vue()],
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
