<template>
  <ion-page class="splash">
    <ion-content :fullscreen="true" class="splash-content">
      <div class="splash-body">

        <!-- Logo -->
        <div class="logo-wrap" :class="{ 'logo-wrap--done': allDone, 'logo-wrap--error': hasError }">
          <img src="/static/cons-logo-splash.png" alt="RGMC Consignment" class="logo-img" />
        </div>

        <!-- Loading steps -->
        <div v-if="!hasError" class="steps-wrap">
          <div
            v-for="step in steps"
            :key="step.key"
            class="step"
            :class="{
              'step--loading': step.status === 'loading',
              'step--done': step.status === 'done',
              'step--error': step.status === 'error',
              'step--idle': step.status === 'idle',
            }"
          >
            <span class="step__icon">
              <ion-spinner v-if="step.status === 'loading'" name="crescent" />
              <ion-icon
                v-else-if="step.status === 'done'"
                :icon="checkmarkCircleOutline"
              />
              <ion-icon
                v-else-if="step.status === 'error'"
                :icon="closeCircleOutline"
              />
              <span v-else class="step__dot" />
            </span>
            <span class="step__label">{{ step.label }}</span>
          </div>

          <!-- Gold progress bar -->
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: `${progressPct}%` }" />
          </div>
        </div>

        <!-- Error block -->
        <Transition name="err-fade">
        <div v-if="hasError" class="error-block">
          <ion-icon :icon="wifiOutline" class="error-block__icon" />
          <p class="error-block__msg">{{ errorText }}</p>
          <ion-button class="retry-btn" @click="load">
            <ion-icon :icon="refreshOutline" slot="start" />
            Retry
          </ion-button>
        </div>
        </Transition>

        <!-- Version tag -->
        <p class="splash-version">RGMC Group &copy; {{ year }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonIcon, IonSpinner, IonButton } from '@ionic/vue';
import {
  checkmarkCircleOutline,
  closeCircleOutline,
  wifiOutline,
  refreshOutline,
} from 'ionicons/icons';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';

type StepStatus = 'idle' | 'loading' | 'done' | 'error';

interface LoadStep {
  key: string;
  label: string;
  status: StepStatus;
}

const router = useRouter();
const authStore = useAuthStore();
const year = new Date().getFullYear();

const steps = ref<LoadStep[]>([
  { key: 'brands', label: 'Loading company data', status: 'idle' },
  { key: 'contacts', label: 'Loading user directory', status: 'idle' },
]);

const errorText = ref('');

const hasError = computed(() => steps.value.some((s) => s.status === 'error'));
const allDone = computed(() => steps.value.every((s) => s.status === 'done'));
const progressPct = computed(() => {
  const done = steps.value.filter((s) => s.status === 'done').length;
  return Math.round((done / steps.value.length) * 100);
});

function setStep(key: string, status: StepStatus) {
  const s = steps.value.find((s) => s.key === key);
  if (s) s.status = status;
}

async function load() {
  steps.value.forEach((s) => (s.status = 'idle'));
  errorText.value = '';

  /* Load brands */
  setStep('brands', 'loading');
  try {
    const brands = await ApiService.getBrands();
    StorageService.setCachedBrands(brands);
    setStep('brands', 'done');
  } catch (err) {
    setStep('brands', 'error');
    errorText.value =
      err instanceof Error ? err.message : 'Failed to reach the RGMC API. Check your connection.';
    return;
  }

  /* Load contacts */
  setStep('contacts', 'loading');
  try {
    const contacts = await ApiService.getContacts();
    StorageService.setCachedContacts(contacts);
    setStep('contacts', 'done');
  } catch (err) {
    setStep('contacts', 'error');
    errorText.value =
      err instanceof Error ? err.message : 'Failed to load user directory.';
    return;
  }

  /* Brief "ready" pause, then redirect */
  await new Promise((r) => setTimeout(r, 600));

  if (authStore.isAuthenticated) {
    router.replace('/app/home');
  } else {
    router.replace('/login');
  }
}

onMounted(async () => {
  // Restore IDB items so getCachedItems() is accurate before the cache check
  await StorageService.init();

  const hasLocalCache =
    StorageService.getCachedCustomers().length > 0 &&
    StorageService.getCachedItems().length > 0 &&
    StorageService.getCachedItemCategories().length > 0;

  // Already logged in + full local cache → skip network, go straight to app
  if (authStore.isAuthenticated && hasLocalCache) {
    router.replace('/app/home');
    return;
  }

  load();
});
</script>

<style scoped>
.splash {
  --background: #1a1a1a;
}

.splash-content {
  --background: #1a1a1a;
}

.splash-body {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 32px 32px;
  gap: 0;
}

/* ── Logo ── */
.logo-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 40px;
  animation: logo-enter 0.65s var(--ease-out-expo) both;
  filter: drop-shadow(0 0 0px rgba(160, 115, 32, 0));
  transition: filter 0.5s ease;
}

.logo-wrap--done {
  filter: drop-shadow(0 0 18px rgba(160, 115, 32, 0.45));
  animation: none;
}

.logo-wrap--error {
  filter: drop-shadow(0 0 12px rgba(var(--ion-color-danger-rgb), 0.5));
  animation: none;
}

.logo-img {
  width: 220px;
  height: 220px;
  object-fit: contain;
}

@keyframes logo-enter {
  from { opacity: 0; transform: scale(0.82); }
  to   { opacity: 1; transform: scale(1);    }
}

.step--done .step__icon ion-icon {
  animation: icon-pop 0.22s var(--ease-out-quart) both;
}

/* Error block Transition */
.err-fade-enter-active { transition: opacity 0.24s ease, transform 0.24s var(--ease-out-quart); }
.err-fade-leave-active { transition: opacity 0.16s ease; }
.err-fade-enter-from   { opacity: 0; transform: translateY(10px); }
.err-fade-leave-to     { opacity: 0; }

/* ── Steps ── */
.steps-wrap {
  width: 100%;
  max-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: fade-slide-up 0.45s var(--ease-out-quart) 0.28s both;
}

.step {
  display: flex;
  align-items: center;
  gap: 12px;
  transition: opacity 0.3s;
}

.step--idle {
  opacity: 0.35;
}

.step--loading {
  opacity: 1;
}

.step--done {
  opacity: 1;
}

.step--error {
  opacity: 1;
}

.step__icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.step__icon ion-spinner {
  width: 18px;
  height: 18px;
  color: #a07320;
}

.step__icon ion-icon {
  font-size: 20px;
}

.step--done .step__icon ion-icon {
  color: var(--ion-color-success);
}

.step--error .step__icon ion-icon {
  color: var(--ion-color-danger);
}

.step__dot {
  display: block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #444;
  margin: auto;
}

.step__label {
  font-size: 14px;
  color: #ccc;
  font-weight: 500;
}

.step--done .step__label {
  color: #fff;
}

/* ── Progress bar ── */
.progress-track {
  width: 100%;
  height: 3px;
  background: #333;
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #a07320, #c4972e);
  border-radius: 2px;
  transition: width 0.5s ease;
}

/* ── Error block ── */
.error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
  max-width: 280px;
}

.error-block__icon {
  font-size: 44px;
  color: var(--ion-color-danger);
}

.error-block__msg {
  font-size: 14px;
  color: #aaa;
  line-height: 1.6;
  margin: 0;
}

.retry-btn {
  --background: #a07320;
  --background-activated: #7a5418;
  --border-radius: 8px;
  min-width: 120px;
}

/* ── Version ── */
.splash-version {
  position: absolute;
  bottom: 24px;
  font-size: 11px;
  color: #444;
  margin: 0;
  letter-spacing: 0.3px;
}
</style>
