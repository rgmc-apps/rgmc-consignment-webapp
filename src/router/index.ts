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

export default router;
