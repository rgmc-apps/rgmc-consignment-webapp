import { createRouter, createWebHistory } from '@ionic/vue-router';
import type { RouteRecordRaw } from 'vue-router';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    redirect: '/splash',
  },
  {
    path: '/splash',
    name: 'Splash',
    component: () => import('@/views/SplashPage.vue'),
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/LoginPage.vue'),
  },
  {
    path: '/app',
    component: () => import('@/views/TabsPage.vue'),
    children: [
      {
        path: '',
        redirect: '/app/home',
      },
      {
        path: 'home',
        name: 'Home',
        component: () => import('@/views/LandingPage.vue'),
      },
      {
        path: 'scan',
        name: 'Scan',
        component: () => import('@/views/ScanningPage.vue'),
      },
      {
        path: 'history',
        name: 'History',
        component: () => import('@/views/HistoryPage.vue'),
      },
    ],
  },
  {
    path: '/app/submit',
    name: 'Submit',
    component: () => import('@/views/SubmitPage.vue'),
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

// After a new deployment, old chunk filenames no longer exist on the server.
// Nginx returns index.html (SPA fallback) which the browser rejects as wrong MIME.
// Hard-navigating to the target route fetches the fresh index.html + new chunks.
router.onError((error, to) => {
  if (error.message.includes('dynamically imported module')) {
    window.location.assign(to.fullPath);
  }
});

export default router;
