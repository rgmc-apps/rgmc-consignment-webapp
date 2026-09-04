<template>
  <ion-page class="splash" :class="{ 'splash--minimalist': isMinimalist }">
    <ion-content :fullscreen="true" class="splash-content">
      <div class="splash-body">

        <!-- Logo -->
        <div
          class="logo-wrap"
          :class="{
            'logo-wrap--breathing': loadPhase === 'companies' || loadPhase === 'selecting',
            'logo-wrap--done': allDone,
            'logo-wrap--error': hasError,
          }"
        >
          <img :src="logoSrc" alt="RGMC Consignment" class="logo-img" />
        </div>

        <!-- Phase: loading companies -->
        <Transition name="phase">
          <div v-if="loadPhase === 'companies' && !hasError" class="phase-wrap">
            <div class="loading-row">
              <ion-spinner name="crescent" class="phase-spinner" />
              <span :key="connectingText" class="phase-label cycling-text">{{ connectingText }}</span>
            </div>
          </div>
        </Transition>

        <!-- Phase: company selection -->
        <Transition name="phase">
          <div v-if="loadPhase === 'selecting' && !hasError" class="phase-wrap company-phase">
            <p class="select-prompt">Select a company to continue</p>
            <div class="company-select-box">
              <ion-select
                v-model="selectedCompanyId"
                placeholder="Choose company"
                interface="action-sheet"
                class="company-select"
              >
                <ion-select-option
                  v-for="c in companies"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.displayName }}
                </ion-select-option>
              </ion-select>
            </div>
          </div>
        </Transition>

        <!-- Phase: loading data steps -->
        <Transition name="phase">
          <div v-if="loadPhase === 'data' && !hasError" class="steps-wrap">
            <div
              v-for="(step, i) in steps"
              :key="step.key"
              class="step"
              :class="{
                'step--loading': step.status === 'loading',
                'step--done':    step.status === 'done',
                'step--error':   step.status === 'error',
                'step--idle':    step.status === 'idle',
              }"
              :style="{ animationDelay: `${i * 70}ms` }"
            >
              <span class="step__icon">
                <ion-spinner v-if="step.status === 'loading'" name="crescent" />
                <ion-icon v-else-if="step.status === 'done'"  :icon="checkmarkCircleOutline" class="icon-done" />
                <ion-icon v-else-if="step.status === 'error'" :icon="closeCircleOutline"     class="icon-error" />
                <span v-else class="step__dot" />
              </span>
              <span :key="stepLabel(step)" class="step__label cycling-text">{{ stepLabel(step) }}</span>
            </div>

            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${progressPct}%` }" />
            </div>
          </div>
        </Transition>

        <!-- Slow / connection notice (non-blocking) -->
        <Transition name="notice-fade">
          <div v-if="slowNoticeMsg && !hasError" class="slow-notice">
            <ion-icon :icon="informationCircleOutline" class="slow-notice__icon" />
            <span class="slow-notice__text">{{ slowNoticeMsg }}</span>
          </div>
        </Transition>

        <!-- Error block -->
        <Transition name="err-fade">
          <div v-if="hasError" class="error-block">
            <ion-icon
              :icon="isTimeout ? hourglassOutline : wifiOutline"
              class="error-block__icon"
              :class="{ 'error-block__icon--timeout': isTimeout }"
            />
            <p class="error-block__kind" :class="{ 'error-block__kind--timeout': isTimeout }">{{ isTimeout ? 'Connection timed out' : 'Connection error' }}</p>
            <p class="error-block__msg">{{ errorText }}</p>
            <ion-button class="retry-btn" @click="load">
              <ion-icon :icon="refreshOutline" slot="start" />
              Retry
            </ion-button>
          </div>
        </Transition>

        <p class="splash-version">RGMC Group &copy; {{ year }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonIcon, IonSpinner, IonButton, IonSelect, IonSelectOption } from '@ionic/vue';
import {
  checkmarkCircleOutline,
  closeCircleOutline,
  wifiOutline,
  refreshOutline,
  hourglassOutline,
  informationCircleOutline,
} from 'ionicons/icons';
import { ApiService, setApiCompany } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';
import { useTheme } from '@/composables/useTheme';
import { useLoadingText } from '@/composables/useLoadingText';
import type { Company } from '@/types';

const TIMEOUT_MS = { companies: 15_000, step: 20_000 };

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error('__timeout__')), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

const { theme } = useTheme();
const isMinimalist = computed(() => theme.value === 'minimalist');
const logoSrc = computed(() =>
  isMinimalist.value ? '/static/logo-bnw.png' : '/static/cons-logo-splash.png',
);

type StepStatus = 'idle' | 'loading' | 'done' | 'error';
type LoadPhase = 'companies' | 'selecting' | 'data';

interface LoadStep {
  key: string;
  label: string;
  status: StepStatus;
}

const router    = useRouter();
const authStore = useAuthStore();
const year      = new Date().getFullYear();

const loadPhase         = ref<LoadPhase>('companies');
const companies         = ref<Company[]>([]);
const selectedCompanyId = ref('');

const steps = ref<LoadStep[]>([
  { key: 'brands',        label: 'Loading company data',   status: 'idle' },
  { key: 'item-families', label: 'Matching item families', status: 'idle' },
  { key: 'contacts',      label: 'Loading user directory', status: 'idle' },
]);

const errorText     = ref('');
const isTimeout     = ref(false);
const slowNoticeMsg = ref('');
const isSlowNetwork = ref(false);

const hasError    = computed(() => !!errorText.value);
const allDone     = computed(() => steps.value.every((s) => s.status === 'done'));
const progressPct = computed(() => {
  const done = steps.value.filter((s) => s.status === 'done').length;
  return Math.round((done / steps.value.length) * 100);
});

// Cycling text for the "Connecting to server…" phase
const isConnecting = computed(() => loadPhase.value === 'companies' && !hasError.value);
const connectingText = useLoadingText(
  ['Connecting to server…', 'Establishing API connection…', 'Fetching available companies…', 'Reaching RGMC API…', 'Taking a bit longer than usual…', 'Still trying, please wait…'],
  isConnecting,
);

// Per-step cycling messages while a step is in 'loading' state
const stepMessages: Record<string, string[]> = {
  'brands':        ['Loading company data',   'Fetching brand catalog',   'Reading brand settings', 'Mapping brand data',       'Still loading, please wait…', 'Taking longer than expected…'],
  'item-families': ['Matching item families', 'Linking brand families',   'Resolving family codes', 'Mapping item groups',      'Still loading, please wait…', 'Taking longer than expected…'],
  'contacts':      ['Loading user directory', 'Fetching contact records', 'Syncing user accounts',  'Building user list',       'Still loading, please wait…', 'Taking longer than expected…'],
};
const stepCycleIdx = ref(0);
let stepCycleTimer: ReturnType<typeof setInterval> | null = null;

watch(
  () => steps.value.some((s) => s.status === 'loading'),
  (active) => {
    if (active) {
      stepCycleIdx.value = 0;
      stepCycleTimer = setInterval(() => { stepCycleIdx.value++; }, 2500);
    } else {
      if (stepCycleTimer) { clearInterval(stepCycleTimer); stepCycleTimer = null; }
    }
  },
);

onUnmounted(() => {
  if (stepCycleTimer) clearInterval(stepCycleTimer);
  clearSlowTimers();
});

function stepLabel(step: LoadStep): string {
  if (step.status !== 'loading') return step.label;
  const msgs = stepMessages[step.key] ?? [step.label];
  return msgs[stepCycleIdx.value % msgs.length];
}

function setStep(key: string, status: StepStatus) {
  const s = steps.value.find((s) => s.key === key);
  if (s) s.status = status;
}

function handleStepError(err: unknown, fallback: string) {
  if (err instanceof Error && err.message === '__timeout__') {
    isTimeout.value = true;
    errorText.value = 'The server took too long to respond. Check your connection and try again.';
  } else {
    isTimeout.value = false;
    errorText.value = err instanceof Error ? err.message : fallback;
  }
}

// ── Slow-notice timers ──────────────────────────────────────────────────────

let slowTimer1: ReturnType<typeof setTimeout> | null = null;
let slowTimer2: ReturnType<typeof setTimeout> | null = null;

function clearSlowTimers() {
  if (slowTimer1) { clearTimeout(slowTimer1); slowTimer1 = null; }
  if (slowTimer2) { clearTimeout(slowTimer2); slowTimer2 = null; }
  slowNoticeMsg.value = '';
}

function startSlowTimers(phase: 'companies' | 'data') {
  clearSlowTimers();

  slowTimer1 = setTimeout(() => {
    if (hasError.value) return;
    slowNoticeMsg.value = isSlowNetwork.value
      ? 'Your internet connection is slow — loading may take a while'
      : phase === 'companies'
        ? 'Taking longer than usual — server may be starting up'
        : 'Syncing is taking longer than usual';
  }, 6_000);

  slowTimer2 = setTimeout(() => {
    if (hasError.value) return;
    slowNoticeMsg.value = phase === 'companies'
      ? 'Server cold start detected — this can take up to 30 seconds'
      : 'Almost there — the server may be under load';
  }, 13_000);
}

function checkConnectionSpeed() {
  const conn = (navigator as any).connection ?? (navigator as any).mozConnection ?? (navigator as any).webkitConnection;
  if (!conn) return;
  const type: string = conn.effectiveType ?? '';
  if (type === 'slow-2g' || type === '2g') {
    isSlowNetwork.value = true;
    slowNoticeMsg.value = 'Slow connection detected — loading may take longer';
  } else if (type === '3g') {
    isSlowNetwork.value = true;
  }
}

watch(selectedCompanyId, async (id) => {
  if (!id || loadPhase.value !== 'selecting') return;
  const company = companies.value.find((c) => c.id === id);
  if (!company) return;
  setApiCompany(company.code);
  StorageService.setCompany(company);
  await loadData(company.code);
});

async function load() {
  errorText.value         = '';
  isTimeout.value         = false;
  loadPhase.value         = 'companies';
  selectedCompanyId.value = '';
  companies.value         = [];
  steps.value.forEach((s) => (s.status = 'idle'));
  startSlowTimers('companies');

  try {
    companies.value = await withTimeout(ApiService.getCompanies(), TIMEOUT_MS.companies);
    clearSlowTimers();
    loadPhase.value = 'selecting';
  } catch (err) {
    clearSlowTimers();
    if (err instanceof Error && err.message === '__timeout__') {
      isTimeout.value = true;
      errorText.value = 'Could not reach the RGMC API — the server took too long to respond. Check your connection and try again.';
    } else {
      isTimeout.value = false;
      errorText.value = err instanceof Error ? err.message : 'Failed to reach the RGMC API. Check your connection.';
    }
  }
}

async function loadData(companyName?: string) {
  loadPhase.value = 'data';
  startSlowTimers('data');

  const hasBrands   = StorageService.getCachedBrands().length > 0;
  const hasContacts = StorageService.getCachedContacts().length > 0;

  // Fast-path: everything already in cache — skip all network calls
  if (hasBrands && hasContacts) {
    clearSlowTimers();
    steps.value.forEach((s) => (s.status = 'done'));
    await new Promise((r) => setTimeout(r, 400));
    router.replace(authStore.isAuthenticated ? '/app/home' : '/login');
    return;
  }

  // Mark which steps are already satisfied by cache
  setStep('brands',        hasBrands ? 'done' : 'loading');
  setStep('item-families', hasBrands ? 'done' : 'loading');
  setStep('contacts',      hasContacts ? 'done' : 'loading');

  // Fetch brands+families and contacts in parallel — they're completely independent.
  // Brands and families are combined because both are needed to build the stored brand list.
  const [brandsResult, contactsResult] = await Promise.allSettled([
    hasBrands
      ? Promise.resolve()
      : Promise.all([
          withTimeout(ApiService.getBrands(companyName), TIMEOUT_MS.step),
          withTimeout(ApiService.getItemFamilies(), TIMEOUT_MS.step),
        ])
          .then(([brands, families]) => {
            StorageService.setCachedBrands(
              brands.map((b) => ({
                ...b,
                itemFamilyCode: families.find((f) => f.description === b.displayName)?.code,
              })),
            );
            setStep('brands', 'done');
            setStep('item-families', 'done');
          })
          .catch((err) => { setStep('brands', 'error'); setStep('item-families', 'error'); throw err; }),
    hasContacts
      ? Promise.resolve()
      : withTimeout(ApiService.getContacts(), TIMEOUT_MS.step)
          .then((contacts) => { StorageService.setCachedContacts(contacts); setStep('contacts', 'done'); })
          .catch((err) => { setStep('contacts', 'error'); throw err; }),
  ]);

  const failed = [brandsResult, contactsResult].find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  if (failed) {
    clearSlowTimers();
    handleStepError(failed.reason, 'Failed to load required data.');
    return;
  }

  clearSlowTimers();
  await new Promise((r) => setTimeout(r, 700));
  router.replace(authStore.isAuthenticated ? '/app/home' : '/login');
}

onMounted(async () => {
  checkConnectionSpeed();
  await StorageService.init();

  if (authStore.isAuthenticated) {
    router.replace('/app/home');
    return;
  }

  load();
});
</script>

<style scoped>
/* ── Layout ── */
.splash { --background: #1a1a1a; }
.splash-content { --background: #1a1a1a; }

/* ── Minimalist theme overrides ── */
.splash--minimalist { --background: #f7f7f7; }
.splash--minimalist .splash-content { --background: #f7f7f7; }
.splash--minimalist .phase-label { color: #666; }
.splash--minimalist .select-prompt { color: #777; }
.splash--minimalist .company-select-box {
  background: #f0f0f0;
  border-color: #dedede;
  animation: select-box-in 0.4s var(--ease-out-expo) 0.1s both;
}
.splash--minimalist .company-select {
  --color: #333;
  --placeholder-color: #888;
}
.splash--minimalist .step__label { color: #666; }
.splash--minimalist .step--done .step__label { color: #333; }
.splash--minimalist .step__dot { background: #cccccc; }
.splash--minimalist .error-block__msg { color: #666; }
.splash--minimalist .progress-track { background: #e4e4e4; }
.splash--minimalist .phase-spinner { color: #888; }
.splash--minimalist .step__icon ion-spinner { color: #888; }
.splash--minimalist .splash-version { color: #bbb; }
.splash--minimalist .retry-btn {
  --background: #555;
  --background-activated: #333;
}
.splash--minimalist .logo-wrap--breathing {
  animation: logo-enter 0.7s var(--ease-out-expo) both;
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
  margin-bottom: 44px;
  animation: logo-enter 0.7s var(--ease-out-expo) both;
  will-change: filter;
}

/* Gold breath pulse during loading phases */
.logo-wrap--breathing {
  animation:
    logo-enter     0.7s  var(--ease-out-expo) both,
    logo-load-pulse 2.6s  ease-in-out 0.75s infinite;
}

/* Gold bloom when all steps complete */
.logo-wrap--done {
  animation: logo-glow-bloom 0.95s var(--ease-out-expo) forwards;
}

/* Red tint on error — no animation, just state */
.logo-wrap--error {
  filter: drop-shadow(0 0 14px oklch(56% 0.21 24 / 0.5));
}

.logo-img {
  width: 220px;
  height: 220px;
  object-fit: contain;
  display: block;
}

/* ── Phase wrapper ── */
.phase-wrap {
  width: 100%;
  max-width: 260px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
}

/* ── Companies loading row ── */
.loading-row {
  display: flex;
  align-items: center;
  gap: 12px;
  animation: fade-slide-up 0.4s var(--ease-out-expo) 0.15s both;
}

.phase-spinner {
  width: 18px;
  height: 18px;
  color: oklch(62% 0.13 74);
  flex-shrink: 0;
}

.phase-label {
  font-size: 14px;
  color: #999;
  font-weight: 500;
  letter-spacing: 0.2px;
}

/* ── Company selection phase ── */
.company-phase { gap: 16px; }

.select-prompt {
  font-size: 13px;
  color: #888;
  margin: 0;
  text-align: center;
  font-weight: 500;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  animation: fade-slide-up 0.35s var(--ease-out-expo) 0.05s both;
}

.company-select-box {
  width: 100%;
  background: oklch(20% 0.005 74);
  border: 1px solid oklch(28% 0.01 74);
  border-radius: 12px;
  overflow: hidden;
  animation:
    select-box-in   0.4s var(--ease-out-expo) 0.1s both,
    select-hint-glow 2.2s ease-in-out 0.6s infinite;
}

.company-select {
  width: 100%;
  --color: #ffffff;
  --placeholder-color: #666;
  --placeholder-opacity: 1;
  --padding-start: 16px;
  --padding-end: 16px;
  --padding-top: 15px;
  --padding-bottom: 15px;
  font-size: 15px;
  font-weight: 500;
}

/* ── Data loading steps ── */
.steps-wrap {
  width: 100%;
  max-width: 260px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.step {
  display: flex;
  align-items: center;
  gap: 12px;
  animation: fade-slide-up 0.38s var(--ease-out-expo) both;
  /* animation-delay set inline via :style binding */
}

.step--idle    { opacity: 0.32; }
.step--loading { opacity: 1; }
.step--done    { opacity: 1; }
.step--error   { opacity: 1; }

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
  color: oklch(62% 0.13 74);
}

.step__icon ion-icon { font-size: 20px; }

.icon-done {
  color: var(--ion-color-success);
  animation: icon-pop 0.25s var(--ease-out-quart) both;
}

.icon-error {
  color: var(--ion-color-danger);
  animation: icon-shake 0.42s var(--ease-out-quart) both;
}

.step__dot {
  display: block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: oklch(30% 0.005 74);
  margin: auto;
}

.step__label {
  font-size: 14px;
  color: #aaa;
  font-weight: 500;
  transition: color 0.3s ease;
}

.step--done  .step__label { color: #e8e8e8; }
.step--error .step__label { color: var(--ion-color-danger); }

/* ── Progress bar ── */
.progress-track {
  width: 100%;
  height: 3px;
  background: oklch(22% 0.005 74);
  border-radius: 2px;
  margin-top: 8px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    oklch(45% 0.09 74) 0%,
    oklch(55% 0.12 74) 30%,
    oklch(66% 0.14 74) 50%,
    oklch(55% 0.12 74) 70%,
    oklch(45% 0.09 74) 100%
  );
  background-size: 200% 100%;
  animation: bar-shimmer 2s linear infinite;
  transition: width 0.55s var(--ease-out-expo);
}

/* ── Error block ── */
.error-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  text-align: center;
  max-width: 260px;
}

.error-block__icon {
  font-size: 44px;
  color: var(--ion-color-danger);
}

.error-block__icon--timeout {
  color: oklch(72% 0.14 55);
}

.error-block__kind {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: var(--ion-color-danger);
  margin: 0;
}

.error-block__kind--timeout {
  color: oklch(72% 0.14 55);
}

.error-block__msg {
  font-size: 14px;
  color: #999;
  line-height: 1.65;
  margin: 0;
}

.retry-btn {
  --background: oklch(53% 0.11 74);
  --background-activated: oklch(44% 0.09 74);
  --border-radius: 10px;
  min-width: 120px;
}

/* ── Slow / connection notice ── */
.slow-notice {
  display: flex;
  align-items: center;
  gap: 7px;
  background: oklch(22% 0.03 55 / 0.85);
  border: 1px solid oklch(60% 0.12 55 / 0.3);
  border-radius: 20px;
  padding: 7px 14px;
  max-width: 260px;
  text-align: left;
  backdrop-filter: blur(4px);
  margin-top: 20px;
}

.slow-notice__icon {
  font-size: 15px;
  color: oklch(72% 0.14 55);
  flex-shrink: 0;
}

.slow-notice__text {
  font-size: 12px;
  color: oklch(72% 0.10 55);
  line-height: 1.5;
  font-weight: 500;
}

.splash--minimalist .slow-notice {
  background: oklch(96% 0.02 55 / 0.9);
  border-color: oklch(60% 0.10 55 / 0.25);
}

.splash--minimalist .slow-notice__text { color: oklch(48% 0.09 55); }
.splash--minimalist .slow-notice__icon { color: oklch(55% 0.12 55); }

/* ── Version ── */
.splash-version {
  position: absolute;
  bottom: 24px;
  font-size: 11px;
  color: #3a3a3a;
  margin: 0;
  letter-spacing: 0.3px;
}

/* ── Keyframes ── */
@keyframes logo-enter {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes logo-load-pulse {
  0%, 100% { filter: drop-shadow(0 0 0 oklch(62% 0.13 74 / 0)); }
  50%       { filter: drop-shadow(0 0 16px oklch(62% 0.13 74 / 0.25)); }
}

@keyframes logo-glow-bloom {
  0%   { filter: drop-shadow(0 0 0 oklch(62% 0.13 74 / 0)); }
  55%  { filter: drop-shadow(0 0 36px oklch(66% 0.14 74 / 0.72)); }
  100% { filter: drop-shadow(0 0 20px oklch(60% 0.12 74 / 0.44)); }
}

@keyframes select-box-in {
  from { opacity: 0; transform: scale(0.95) translateY(6px); }
  to   { opacity: 1; transform: scale(1)   translateY(0); }
}

@keyframes select-hint-glow {
  0%, 100% {
    border-color: oklch(28% 0.01 74);
    box-shadow: none;
  }
  50% {
    border-color: oklch(53% 0.11 74 / 0.55);
    box-shadow: 0 0 0 3px oklch(53% 0.11 74 / 0.08);
  }
}

@keyframes icon-shake {
  0%, 100% { transform: translateX(0); }
  18%      { transform: translateX(-5px); }
  36%      { transform: translateX(4px); }
  54%      { transform: translateX(-3px); }
  72%      { transform: translateX(2px); }
}

@keyframes bar-shimmer {
  from { background-position: -200% center; }
  to   { background-position:  200% center; }
}

/* ── Phase transitions (Vue <Transition name="phase">) ── */
.phase-enter-active {
  transition: opacity 0.35s var(--ease-out-expo), transform 0.35s var(--ease-out-expo);
}
.phase-leave-active {
  transition: opacity 0.15s ease;
  position: absolute; /* don't push layout during leave */
}
.phase-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.phase-leave-to {
  opacity: 0;
}

/* ── Cycling loading text ── */
@keyframes text-appear {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cycling-text {
  display: inline-block;
  animation: text-appear 0.3s ease;
}

@media (prefers-reduced-motion: reduce) {
  .cycling-text { animation: none !important; }
}

/* ── Error block transition ── */
.err-fade-enter-active { transition: opacity 0.28s var(--ease-out-expo), transform 0.28s var(--ease-out-expo); }
.err-fade-leave-active { transition: opacity 0.16s ease; }
.err-fade-enter-from   { opacity: 0; transform: translateY(10px); }
.err-fade-leave-to     { opacity: 0; }

/* ── Notice fade transition ── */
.notice-fade-enter-active { transition: opacity 0.4s var(--ease-out-expo), transform 0.4s var(--ease-out-expo); }
.notice-fade-leave-active { transition: opacity 0.2s ease; }
.notice-fade-enter-from   { opacity: 0; transform: translateY(6px); }
.notice-fade-leave-to     { opacity: 0; }
</style>
