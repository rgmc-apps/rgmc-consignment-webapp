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
              <span class="phase-label">Connecting to server…</span>
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
              <span class="step__label">{{ step.label }}</span>
            </div>

            <div class="progress-track">
              <div class="progress-fill" :style="{ width: `${progressPct}%` }" />
            </div>
          </div>
        </Transition>

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

        <p class="splash-version">RGMC Group &copy; {{ year }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { IonPage, IonContent, IonIcon, IonSpinner, IonButton, IonSelect, IonSelectOption } from '@ionic/vue';
import {
  checkmarkCircleOutline,
  closeCircleOutline,
  wifiOutline,
  refreshOutline,
} from 'ionicons/icons';
import { ApiService, setApiCompany } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';
import { useTheme } from '@/composables/useTheme';
import type { Company } from '@/types';

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

const errorText = ref('');

const hasError    = computed(() => !!errorText.value);
const allDone     = computed(() => steps.value.every((s) => s.status === 'done'));
const progressPct = computed(() => {
  const done = steps.value.filter((s) => s.status === 'done').length;
  return Math.round((done / steps.value.length) * 100);
});

function setStep(key: string, status: StepStatus) {
  const s = steps.value.find((s) => s.key === key);
  if (s) s.status = status;
}

watch(selectedCompanyId, async (id) => {
  if (!id || loadPhase.value !== 'selecting') return;
  const company = companies.value.find((c) => c.id === id);
  if (!company) return;
  setApiCompany(company);
  StorageService.setCompany(company);
  await loadData();
});

async function load() {
  errorText.value         = '';
  loadPhase.value         = 'companies';
  selectedCompanyId.value = '';
  companies.value         = [];
  steps.value.forEach((s) => (s.status = 'idle'));

  try {
    companies.value = await ApiService.getCompanies();
    loadPhase.value = 'selecting';
  } catch (err) {
    errorText.value =
      err instanceof Error ? err.message : 'Failed to reach the RGMC API. Check your connection.';
  }
}

async function loadData() {
  loadPhase.value = 'data';

  setStep('brands', 'loading');
  let rawBrands: Awaited<ReturnType<typeof ApiService.getBrands>> = [];
  try {
    rawBrands = await ApiService.getBrands();
    setStep('brands', 'done');
  } catch (err) {
    setStep('brands', 'error');
    errorText.value = err instanceof Error ? err.message : 'Failed to load brand data.';
    return;
  }

  setStep('item-families', 'loading');
  try {
    const families = await ApiService.getItemFamilies();
    StorageService.setCachedBrands(
      rawBrands.map((b) => ({
        ...b,
        itemFamilyCode: families.find((f) => f.description === b.displayName)?.code,
      })),
    );
    setStep('item-families', 'done');
  } catch (err) {
    setStep('item-families', 'error');
    errorText.value = err instanceof Error ? err.message : 'Failed to load item families.';
    return;
  }

  setStep('contacts', 'loading');
  try {
    StorageService.setCachedContacts(await ApiService.getContacts());
    setStep('contacts', 'done');
  } catch (err) {
    setStep('contacts', 'error');
    errorText.value = err instanceof Error ? err.message : 'Failed to load user directory.';
    return;
  }

  await new Promise((r) => setTimeout(r, 700));
  router.replace(authStore.isAuthenticated ? '/app/home' : '/login');
}

onMounted(async () => {
  await StorageService.init();

  const hasLocalCache =
    StorageService.getCachedCustomers().length > 0 &&
    StorageService.getCachedItems().length > 0 &&
    StorageService.getCachedItemCategories().length > 0;

  if (authStore.isAuthenticated && hasLocalCache) {
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

/* ── Error block transition ── */
.err-fade-enter-active { transition: opacity 0.28s var(--ease-out-expo), transform 0.28s var(--ease-out-expo); }
.err-fade-leave-active { transition: opacity 0.16s ease; }
.err-fade-enter-from   { opacity: 0; transform: translateY(10px); }
.err-fade-leave-to     { opacity: 0; }
</style>
