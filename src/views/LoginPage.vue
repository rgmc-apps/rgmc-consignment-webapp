<template>
  <ion-page :class="['login-page', { 'login--minimalist': isMinimalist }]">

    <!-- Password setup modal — shown when account has no valid bcrypt hash -->
    <set-password-modal :is-open="authStore.forcePasswordSetup" />

    <ion-content :fullscreen="true" class="login-content">
      <div class="login-container">
        <!-- Logo block -->
        <div class="login-logo-block">
          <img :src="logoSrc" alt="RGMC Consignment" class="login-logo" />
          <h1 class="login-title">RGMC Consignment</h1>
          <p class="login-subtitle">Web App</p>
        </div>

        <!-- Network notice -->
        <Transition name="net-notice-fade">
          <div v-if="networkNotice" :class="['net-notice', `net-notice--${networkNotice}`]">
            <ion-icon :icon="networkNotice === 'offline' ? cloudOfflineOutline : warningOutline" />
            <div class="net-notice-text">
              <span class="net-notice-main">{{
                networkNotice === 'offline'
                  ? 'No internet connection'
                  : 'Connection seems slow'
              }}</span>
              <span class="net-notice-sub">{{
                networkNotice === 'offline'
                  ? 'Check your Wi-Fi or mobile data.'
                  : 'Sign-in may take longer than usual.'
              }}</span>
            </div>
          </div>
        </Transition>

        <!-- Form card -->
        <ion-card :class="['login-card', { 'login-card--shake': isCardShaking, 'login-card--success': loginState === 'success' }]">
          <ion-card-content>
            <!-- Indeterminate loading strip — visible while auth or sync is in progress -->
            <Transition name="strip-fade">
              <div v-if="(isLoading || isSyncing) && loginState !== 'success'" class="login-progress-strip" />
            </Transition>
            <p class="login-form-heading">Sign In</p>

            <!-- Company dropdown -->
            <ion-item lines="full" class="login-field">
              <ion-label position="stacked">Company</ion-label>
              <ion-select
                v-model="selectedCompanyId"
                placeholder="Select company"
                interface="action-sheet"
                :disabled="isLoading || companiesLoading"
              >
                <ion-select-option
                  v-for="c in companies"
                  :key="c.id"
                  :value="c.id"
                >
                  {{ c.displayName }}
                </ion-select-option>
              </ion-select>
              <Transition name="spin-fade">
                <ion-spinner v-if="companiesLoading" slot="end" name="crescent" />
              </Transition>
            </ion-item>

            <!-- Brand dropdown -->
            <ion-item
              lines="full"
              class="login-field"
              :class="{ 'login-field--unlocking': selectedCompanyId && !brandsLoading }"
            >
              <ion-label position="stacked">Brand</ion-label>
              <ion-select
                v-model="selectedBrandId"
                placeholder="Select brand"
                interface="action-sheet"
                :disabled="isLoading || brandsLoading || !selectedCompanyId"
              >
                <ion-select-option
                  v-for="b in brands"
                  :key="b.id"
                  :value="b.id"
                >
                  {{ b.displayName }}
                </ion-select-option>
              </ion-select>
              <Transition name="spin-fade">
                <ion-spinner v-if="brandsLoading" slot="end" name="crescent" />
              </Transition>
            </ion-item>

            <!-- Item family code for selected brand -->
            <Transition name="family-fade">
              <div v-if="selectedBrand?.itemFamilyCode" class="brand-family-tag">
                <ion-icon :icon="pricetagOutline" />
                <span>Item Family: <strong>{{ selectedBrand.itemFamilyCode }}</strong></span>
              </div>
            </Transition>

            <!-- Username -->
            <ion-item lines="full" :class="['login-field', { 'login-field--error': loginState === 'error' }]">
              <ion-label position="stacked">Username</ion-label>
              <ion-input
                v-model="username"
                type="text"
                placeholder="Enter your name"
                autocomplete="username"
                :disabled="isLoading || !selectedCompanyId"
                @keyup.enter="handleLogin"
              />
            </ion-item>

            <!-- Password -->
            <ion-item lines="full" :class="['login-field', { 'login-field--error': loginState === 'error' }]">
              <ion-label position="stacked">Password</ion-label>
              <ion-input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                autocomplete="current-password"
                :disabled="isLoading || !selectedCompanyId"
                @keyup.enter="handleLogin"
              />
              <ion-button
                slot="end"
                fill="clear"
                size="small"
                @click="showPassword = !showPassword"
              >
                <ion-icon :icon="showPassword ? eyeOffOutline : eyeOutline" slot="icon-only" />
              </ion-button>
            </ion-item>

            <!-- Error message -->
            <Transition name="err-fade">
            <div v-if="authStore.error" class="login-error">
              <ion-icon :icon="alertCircleOutline" />
              <span>{{ authStore.error }}</span>
            </div>
            </Transition>

            <!-- Submit -->
            <ion-button
              expand="block"
              :class="['login-btn', {
                'login-btn--loading': isLoading || isSyncing,
                'login-btn--success': loginState === 'success',
              }]"
              :disabled="!canSubmit || isLoading || isSyncing"
              @click="handleLogin"
            >
              <ion-icon v-if="loginState === 'success' && !isSyncing" :icon="checkmarkCircleOutline" slot="start" />
              <ion-spinner v-else-if="isLoading || isSyncing" name="crescent" slot="start" />
              <span :key="isLoading ? loginLoadingText : undefined" class="cycling-text">{{
                loginState === 'success' && !isSyncing ? 'Signed in' :
                isSyncing  ? syncBtnLabel :
                isLoading  ? loginLoadingText :
                             'Sign In'
              }}</span>
            </ion-button>

            <!-- Sync status panel — shown after login success while data loads -->
            <Transition name="sync-status-fade">
              <div v-if="loginState === 'success' && isSyncing" class="login-sync-status">
                <ion-spinner name="dots" class="sync-status-dots" />
                <div class="sync-status-text">
                  <div class="sync-status-top">
                    <span :key="syncHeaderText" class="sync-status-label cycling-text">{{ syncHeaderText }}</span>
                    <span class="sync-status-pct">{{ syncProgress }}%</span>
                  </div>
                  <!-- Per-table rows — shown for all phases -->
                  <div v-if="syncSubTasks.length" class="sync-subtasks">
                    <div v-for="(task, i) in syncSubTasks" :key="task.label" class="sync-subtask-row">
                      <ion-icon
                        v-if="task.status === 'done'"
                        :icon="checkmarkCircleOutline"
                        class="subtask-icon subtask-icon--done"
                      />
                      <ion-icon
                        v-else-if="task.status === 'error'"
                        :icon="alertCircleOutline"
                        class="subtask-icon subtask-icon--error"
                      />
                      <ion-spinner v-else name="crescent" class="subtask-spinner" />
                      <span
                        class="subtask-label"
                        :class="{
                          'subtask-label--done': task.status === 'done',
                          'subtask-label--error': task.status === 'error',
                        }"
                      >{{ task.label }}</span>
                      <!-- Show live % next to Item Prices while it's loading -->
                      <span v-if="task.status === 'pending' && i === 4" class="subtask-pct">{{ syncProgress }}%</span>
                      <span v-if="task.status === 'error'" class="subtask-err-note">Failed</span>
                    </div>
                  </div>
                  <div class="sync-progress-track">
                    <div class="sync-progress-fill" :style="{ width: syncProgress + '%' }" />
                  </div>
                  <span :key="syncSubCycleText" class="sync-status-sub cycling-text">{{ syncSubCycleText }}</span>
                </div>
              </div>
            </Transition>
          </ion-card-content>
        </ion-card>

        <p class="login-footer">RGMC Group Inc. - IT/MIS &copy; {{ currentYear }}</p>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonPage,
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
} from '@ionic/vue';
import { eyeOutline, eyeOffOutline, alertCircleOutline, cloudOfflineOutline, warningOutline, pricetagOutline, checkmarkCircleOutline } from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { ApiService, setApiCompany } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useSync } from '@/composables/useSync';
import { useLoadingText } from '@/composables/useLoadingText';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import SetPasswordModal from '@/components/SetPasswordModal.vue';
import { useTheme } from '@/composables/useTheme';
import type { Brand, Company } from '@/types';

const { theme } = useTheme();
const isMinimalist = computed(() => theme.value === 'minimalist');
const logoSrc = computed(() =>
  isMinimalist.value ? '/static/logo-bnw.png' : '/static/cons-logo.png',
);

const router = useRouter();
const authStore = useAuthStore();

const companies = ref<Company[]>([]);
const companiesLoading = ref(false);
const selectedCompanyId = ref<string>('');

const brands = ref<Brand[]>([]);
const brandsLoading = ref(false);
const selectedBrandId = ref<string>('');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const currentYear = new Date().getFullYear();

/* ─── Login animation state ─── */
const loginState = ref<'idle' | 'loading' | 'success' | 'error'>('idle');
const isCardShaking = ref(false);

watch([username, password], () => {
  if (loginState.value === 'error') loginState.value = 'idle';
});

const isLoading = computed(() => authStore.isLoading);
const { isSyncing, syncPhase, syncProgress, syncSubTasks, sync } = useSync();

const loginLoadingText = useLoadingText(
  ['Signing in…', 'Verifying credentials…', 'Checking permissions…', 'Almost there…'],
  isLoading,
);
const syncHeaderText = useLoadingText(
  ['Syncing data…', 'Fetching customer list…', 'Loading product catalog…', 'Retrieving contacts…', 'Getting latest prices…', 'Almost done…'],
  isSyncing,
);
const syncSubCycleText = useLoadingText(
  [
    'Preparing your workspace for offline use',
    'Building local data cache…',
    'Setting up offline mode…',
    'Optimizing for your session…',
    'Caching for offline access…',
  ],
  isSyncing,
  3200,
);

onUnmounted(() => {
  if (syncSlowTimer) { clearTimeout(syncSlowTimer); syncSlowTimer = null; }
});

const syncBtnLabel = computed(() => {
  const phase = syncPhase.value || 'Syncing…';
  return syncProgress.value > 0 && syncProgress.value < 100
    ? `${phase} ${syncProgress.value}%`
    : phase;
});

const { isOnline, isSlowConnection } = useNetworkStatus();

const isSyncingSlow = ref(false);
let syncSlowTimer: ReturnType<typeof setTimeout> | null = null;

watch(isSyncing, (active) => {
  if (active) {
    syncSlowTimer = setTimeout(() => { isSyncingSlow.value = true; }, 10_000);
  } else {
    if (syncSlowTimer) { clearTimeout(syncSlowTimer); syncSlowTimer = null; }
    isSyncingSlow.value = false;
  }
});

const networkNotice = computed<'offline' | 'slow' | null>(() => {
  if (!isOnline.value) return 'offline';
  if (isSlowConnection.value || isSyncingSlow.value) return 'slow';
  return null;
});

const selectedCompany = computed(() => companies.value.find((c) => c.id === selectedCompanyId.value) ?? null);
const selectedBrand = computed(() => brands.value.find((b) => b.id === selectedBrandId.value) ?? null);

const canSubmit = computed(
  () => selectedCompanyId.value && selectedBrandId.value && username.value.trim(),
);

onMounted(() => {
  loadCompanies();
});

watch(selectedCompanyId, (id) => {
  /* Reset downstream selections so stale values from a previous company don't linger */
  selectedBrandId.value = '';
  username.value = '';
  password.value = '';
  brands.value = [];
  authStore.clearError();

  if (!id) return;

  const company = companies.value.find((c) => c.id === id);
  /* Point the API interceptor at the newly selected company so all /bc/ calls
     below pick up the correct ?company= param */
  setApiCompany(company?.code ?? null);

  loadBrands();
  loadContacts();
});

function loadCompanies() {
  companiesLoading.value = true;
  ApiService.getCompanies()
    .then((data) => {
      companies.value = data;
      // Restore the company chosen on the splash screen (if any)
      const stored = StorageService.getCompany();
      if (stored) {
        const match = data.find((c) => c.id === stored.id);
        if (match) selectedCompanyId.value = match.id;
      }
    })
    .catch(() => { companies.value = []; })
    .finally(() => { companiesLoading.value = false; });
}

function loadBrands() {
  brandsLoading.value = true;
  Promise.all([ApiService.getBrands(selectedCompany.value?.code), ApiService.getItemFamilies()])
    .then(([rawBrands, families]) => {
      brands.value = rawBrands.map((b) => ({
        ...b,
        itemFamilyCode: families.find((f) => f.description === b.displayName)?.code,
      }));
    })
    .catch(() => { brands.value = []; })
    .finally(() => { brandsLoading.value = false; });
}

function loadContacts() {
  /* Pre-warm the contacts cache with company-scoped data so auth.store finds
     the right users when the login form is submitted */
  ApiService.getContacts()
    .then((data) => { StorageService.setCachedContacts(data); })
    .catch(() => {/* non-fatal — auth.store will retry on submit */});
}

async function handleLogin() {
  if (!canSubmit.value) return;
  authStore.clearError();
  loginState.value = 'idle';
  if (!selectedCompany.value || !selectedBrand.value) return;

  const ok = await authStore.login(selectedCompany.value, selectedBrand.value, username.value, password.value);

  if (!ok) {
    loginState.value = 'error';
    isCardShaking.value = true;
    setTimeout(() => { isCardShaking.value = false; }, 420);
    return;
  }

  loginState.value = 'success';

  /* Full offline prep — fetch all master data so the app works without a
     network connection after this login. Failure is non-fatal. */
  await sync();

  router.replace('/app/home');
}
</script>

<style scoped>
.login-page {
  --background: var(--app-dark);
}

.login-content {
  --background: var(--app-dark);
}

.login-container {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;   /* horizontal centre for all children */
  justify-content: center;
  padding: 32px 20px;
  gap: 24px;
  box-sizing: border-box;
  width: 100%;
  max-width: 480px; /* login card stays comfortably narrow even on wide screens */
  margin: 0 auto;
}

.login-logo-block {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  animation: fade-slide-up 0.55s var(--ease-out-expo) both;
}

.login-logo {
  width: 90px;
  height: 90px;
  object-fit: contain;
}

.login-title {
  font-size: 22px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  letter-spacing: 0.5px;
}

.login-subtitle {
  font-size: 12px;
  color: var(--app-gold-light);
  margin: 0;
  letter-spacing: 1.5px;
  text-transform: uppercase;
}

.login-card {
  width: 100%;
  max-width: 420px;
  --background: var(--app-surface);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  border: 1px solid var(--app-border);
  animation: fade-slide-up 0.55s var(--ease-out-expo) 0.1s both;
}

.login-form-heading {
  font-size: 18px;
  font-weight: 700;
  color: var(--app-fg);
  margin: 0 0 16px;
  text-align: left;
}

.login-field {
  --background: transparent;
  --border-color: var(--app-border);
  --padding-start: 0;
  --color: var(--app-fg);
  margin-bottom: 4px;
}

/* ion-select: selected value text + placeholder */
.login-field ion-select {
  --color: var(--app-fg);
  --placeholder-color: var(--app-text-muted);
  --placeholder-opacity: 1;
}

/* ion-select caret / icon */
.login-field ion-select::part(icon) {
  color: var(--app-text-muted);
  opacity: 1;
}

/* ion-label inside login fields */
.login-field ion-label {
  color: var(--app-text-muted) !important;
}

/* ion-input text */
.login-field ion-input {
  --color: var(--app-fg);
  --placeholder-color: var(--app-text-muted);
  --placeholder-opacity: 1;
}

.login-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--app-danger-bg);
  border: 1px solid var(--app-error-border);
  border-radius: 8px;
  margin-top: 12px;
  color: var(--ion-color-danger);
  font-size: 13px;
}

.login-btn {
  margin-top: 20px;
  --background: var(--app-gold);
  --background-activated: var(--app-gold-dark);
  height: 48px;
  font-size: 16px;
  font-weight: 700;
  transition: transform 0.12s var(--ease-out-expo);
}

.login-btn:active {
  transform: scale(0.97);
}

/* Error message Transition */
.err-fade-enter-active { transition: opacity 0.22s ease, transform 0.22s var(--ease-out-quart); }
.err-fade-leave-active { transition: opacity 0.15s ease; }
.err-fade-enter-from   { opacity: 0; transform: translateY(-6px); }
.err-fade-leave-to     { opacity: 0; }

.login-footer {
  font-size: 12px;
  color: var(--app-text-muted);
  margin: 0;
  text-align: center;
}

/* ── Network notice ── */
.net-notice {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: 10px;
  width: 100%;
  margin-bottom: 12px;
  box-sizing: border-box;
}
.net-notice ion-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
}
.net-notice-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.net-notice-main {
  font-size: 13px;
  font-weight: 600;
  line-height: 1.3;
}
.net-notice-sub {
  font-size: 11px;
  opacity: 0.8;
  line-height: 1.3;
}
.net-notice--offline {
  background: rgba(var(--ion-color-danger-rgb), 0.15);
  color: var(--ion-color-danger-shade);
}
.net-notice--slow {
  background: rgba(var(--ion-color-warning-rgb), 0.15);
  color: var(--ion-color-warning-shade);
}
.net-notice-fade-enter-active,
.net-notice-fade-leave-active { transition: opacity 0.3s ease, transform 0.3s ease; }
.net-notice-fade-enter-from,
.net-notice-fade-leave-to    { opacity: 0; transform: translateY(-6px); }

/* ── Item family tag ── */
.brand-family-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 4px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(160, 115, 32, 0.1);
  border: 1px solid rgba(160, 115, 32, 0.22);
  font-size: 12px;
  color: rgba(196, 151, 46, 0.9);
}

.brand-family-tag ion-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.brand-family-tag strong {
  font-weight: 700;
  letter-spacing: 0.3px;
}

.family-fade-enter-active { transition: opacity 0.22s ease, transform 0.22s var(--ease-out-quart); }
.family-fade-leave-active { transition: opacity 0.15s ease; }
.family-fade-enter-from   { opacity: 0; transform: translateY(-4px); }
.family-fade-leave-to     { opacity: 0; }

/* Spinner fade-in/out (companies loading, brands loading) */
.spin-fade-enter-active { transition: opacity 0.18s ease, transform 0.18s var(--ease-out-quart); }
.spin-fade-leave-active { transition: opacity 0.12s ease; }
.spin-fade-enter-from   { opacity: 0; transform: scale(0.7); }
.spin-fade-leave-to     { opacity: 0; }

/* Brand field unlock — subtle pulse when it becomes interactive */
@keyframes field-unlock {
  0%   { box-shadow: none; }
  40%  { box-shadow: inset 0 0 0 1px oklch(53% 0.11 74 / 0.35); }
  100% { box-shadow: none; }
}

.login-field--unlocking {
  animation: field-unlock 0.55s var(--ease-out-expo) both;
}

/* ── Minimalist overrides ── */
.login--minimalist .login-title { color: #1a1a1a; }
.login--minimalist .login-card {
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.08);
}
.login--minimalist .brand-family-tag {
  background: rgba(0, 0, 0, 0.05);
  border-color: rgba(0, 0, 0, 0.12);
  color: #555555;
}

/* ═══════════ Animation additions ═══════════ */

/* ── Error shake ── */
@keyframes login-shake {
  0%, 100% { transform: translateX(0); }
  15%       { transform: translateX(-9px); }
  30%       { transform: translateX(9px); }
  45%       { transform: translateX(-6px); }
  60%       { transform: translateX(6px); }
  75%       { transform: translateX(-3px); }
  90%       { transform: translateX(3px); }
}

.login-card--shake {
  animation: login-shake 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* ── Error field highlight ── */
.login-field--error {
  --border-color: var(--ion-color-danger) !important;
  transition: --border-color 0.18s ease;
}

/* ── Loading progress strip ── */
.login-progress-strip {
  position: relative;
  height: 3px;
  margin: -16px -16px 16px;
  background: oklch(53% 0.11 74 / 0.12);
  overflow: hidden;
  border-radius: 16px 16px 0 0;
}

.login-progress-strip::after {
  content: '';
  position: absolute;
  top: 0;
  height: 100%;
  width: 42%;
  left: -42%;
  background: linear-gradient(90deg, transparent 0%, var(--app-gold) 50%, transparent 100%);
  animation: progress-sweep 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes progress-sweep {
  0%   { left: -42%; }
  65%  { left: 100%; }
  100% { left: 100%; }
}

.strip-fade-enter-active { transition: opacity 0.2s ease; }
.strip-fade-leave-active { transition: opacity 0.15s ease; }
.strip-fade-enter-from,
.strip-fade-leave-to     { opacity: 0; }

/* ── Button loading pulse ── */
@keyframes btn-breathe {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.78; }
}

.login-btn--loading {
  animation: btn-breathe 1.6s ease-in-out infinite;
}

/* ── Button success state ── */
.login-btn--success {
  --background: oklch(52% 0.15 145);
  --background-activated: oklch(46% 0.15 145);
  --background-hover: oklch(55% 0.15 145);
}

/* ── Card success ring ── */
@keyframes card-success-ring {
  0%   { box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 0 oklch(52% 0.15 145 / 0.5); }
  45%  { box-shadow: 0 6px 24px rgba(0,0,0,0.3), 0 0 0 5px oklch(52% 0.15 145 / 0.3); }
  100% { box-shadow: 0 6px 24px rgba(0,0,0,0.3), 0 0 0 2px oklch(52% 0.15 145 / 0.18); }
}

.login-card--success {
  animation: card-success-ring 0.52s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  border-color: oklch(52% 0.15 145 / 0.35);
  transition: border-color 0.3s ease;
}

/* ── Sync status panel ── */
.login-sync-status {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 10px;
  background: oklch(52% 0.15 145 / 0.08);
  border: 1px solid oklch(52% 0.15 145 / 0.2);
}

.sync-status-dots {
  color: oklch(62% 0.15 145);
  flex-shrink: 0;
  font-size: 1.1rem;
}

.sync-status-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.sync-status-label {
  font-size: 13px;
  font-weight: 600;
  color: oklch(70% 0.12 145);
  display: block;
}

.sync-status-sub {
  font-size: 11px;
  color: oklch(60% 0.08 145 / 0.75);
  display: block;
}

/* Panel enter/leave */
.sync-status-fade-enter-active { transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1); }
.sync-status-fade-leave-active { transition: opacity 0.15s ease; }
.sync-status-fade-enter-from   { opacity: 0; transform: translateY(-6px); }
.sync-status-fade-leave-to     { opacity: 0; }

/* ── Sync sub-tasks ── */
.sync-subtasks {
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 6px 0 2px;
}

.sync-subtask-row {
  display: flex;
  align-items: center;
  gap: 7px;
}

.subtask-icon--done {
  font-size: 14px;
  color: oklch(62% 0.15 145);
  flex-shrink: 0;
}

.subtask-icon--error {
  font-size: 14px;
  color: var(--ion-color-danger);
  flex-shrink: 0;
}

.subtask-spinner {
  width: 14px;
  height: 14px;
  color: oklch(62% 0.15 145);
  flex-shrink: 0;
}

.subtask-label {
  font-size: 12px;
  font-weight: 600;
  color: oklch(70% 0.12 145);
  flex: 1;
}

.subtask-label--done {
  opacity: 0.55;
}

.subtask-label--error {
  color: var(--ion-color-danger);
}

.subtask-err-note {
  font-size: 10px;
  font-weight: 700;
  color: var(--ion-color-danger);
  text-transform: uppercase;
  letter-spacing: 0.4px;
  flex-shrink: 0;
}

.subtask-pct {
  font-size: 11px;
  font-weight: 700;
  color: oklch(70% 0.12 145);
  flex-shrink: 0;
}

/* ── Sync progress bar ── */
.sync-status-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}

.sync-status-pct {
  font-size: 12px;
  font-weight: 700;
  color: oklch(70% 0.12 145);
  flex-shrink: 0;
}

.sync-progress-track {
  height: 4px;
  border-radius: 4px;
  background: oklch(52% 0.15 145 / 0.15);
  overflow: hidden;
  margin: 5px 0 4px;
}

.sync-progress-fill {
  height: 100%;
  border-radius: 4px;
  background: linear-gradient(90deg, oklch(52% 0.15 145) 0%, oklch(68% 0.18 145) 100%);
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

/* ── Cycling loading text fade-in ── */
@keyframes text-appear {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.cycling-text {
  display: inline-block;
  animation: text-appear 0.3s ease;
}

/* ── Reduced motion ── */
@media (prefers-reduced-motion: reduce) {
  .login-card--shake,
  .login-card--success,
  .login-progress-strip::after,
  .login-btn--loading,
  .cycling-text {
    animation: none !important;
  }
  .login-progress-strip {
    background: var(--app-gold);
    opacity: 0.4;
  }
  .login-btn--success,
  .login-card--success {
    --background: oklch(52% 0.15 145);
    box-shadow: 0 8px 32px rgba(0,0,0,0.4), 0 0 0 2px oklch(52% 0.15 145 / 0.3);
  }
  .sync-status-fade-enter-active,
  .sync-status-fade-leave-active,
  .sync-label-swap-enter-active,
  .sync-label-swap-leave-active {
    transition: none !important;
  }
  .sync-progress-fill {
    transition: none !important;
  }
}
</style>
