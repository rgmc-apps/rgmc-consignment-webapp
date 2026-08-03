import { createApp } from 'vue';
import { IonicVue } from '@ionic/vue';
import { createPinia } from 'pinia';

// When a new build is deployed the old cached JS references stale hashed filenames.
// Vite fires this event when a preload fails with 404; reloading fetches the new bundle.
window.addEventListener('vite:preloadError', () => {
  window.location.reload();
});

import App from './App.vue';
import router from './router';

/* Core Ionic CSS */
import '@ionic/vue/css/core.css';
import '@ionic/vue/css/normalize.css';
import '@ionic/vue/css/structure.css';
import '@ionic/vue/css/typography.css';
import '@ionic/vue/css/padding.css';
import '@ionic/vue/css/float-elements.css';
import '@ionic/vue/css/text-alignment.css';
import '@ionic/vue/css/text-transformation.css';
import '@ionic/vue/css/flex-utils.css';
import '@ionic/vue/css/display.css';

/* App theme — must come after Ionic CSS */
import './theme/variables.css';

import { useAuthStore } from './stores/auth.store';
import { useSessionStore } from './stores/session.store';

const pinia = createPinia();
const app = createApp(App).use(IonicVue).use(pinia).use(router);

const PUBLIC_ROUTES = ['/splash', '/login'];

/* Route guard added after pinia is registered */
router.beforeEach((to) => {
  const authStore = useAuthStore();
  const isPublic = PUBLIC_ROUTES.includes(to.path);

  if (!isPublic && !authStore.isAuthenticated) {
    return '/splash';
  }
  if (to.path === '/login' && authStore.isAuthenticated) {
    return '/app/home';
  }
  return true;
});

router.isReady().then(() => {
  /* Rehydrate stores from localStorage on boot */
  const authStore = useAuthStore();
  const sessionStore = useSessionStore();
  authStore.loadFromStorage();
  sessionStore.loadFromStorage();

  app.mount('#app');
});
