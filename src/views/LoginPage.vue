<template>
  <ion-page class="login-page">

    <!-- Password setup modal — shown when account has no valid bcrypt hash -->
    <set-password-modal :is-open="authStore.forcePasswordSetup" />

    <ion-content :fullscreen="true" class="login-content">
      <div class="login-container">
        <!-- Logo block -->
        <div class="login-logo-block">
          <img src="/static/cons-logo.png" alt="RGMC Consignment" class="login-logo" />
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
        <ion-card class="login-card">
          <ion-card-content>
            <p class="login-form-heading">Sign In</p>

            <!-- Brand dropdown -->
            <ion-item lines="full" class="login-field">
              <ion-label position="stacked">Brand</ion-label>
              <ion-select
                v-model="selectedBrandId"
                placeholder="Select brand"
                interface="action-sheet"
                :disabled="isLoading || brandsLoading"
              >
                <ion-select-option
                  v-for="b in brands"
                  :key="b.id"
                  :value="b.id"
                >
                  {{ b.displayName }}
                </ion-select-option>
              </ion-select>
              <ion-spinner v-if="brandsLoading" slot="end" name="crescent" />
            </ion-item>

            <!-- Item family code for selected brand -->
            <Transition name="family-fade">
              <div v-if="selectedBrand?.itemFamilyCode" class="brand-family-tag">
                <ion-icon :icon="pricetagOutline" />
                <span>Item Family: <strong>{{ selectedBrand.itemFamilyCode }}</strong></span>
              </div>
            </Transition>

            <!-- Username -->
            <ion-item lines="full" class="login-field">
              <ion-label position="stacked">Username</ion-label>
              <ion-input
                v-model="username"
                type="text"
                placeholder="Enter your name"
                autocomplete="username"
                :disabled="isLoading"
                @keyup.enter="handleLogin"
              />
            </ion-item>

            <!-- Password -->
            <ion-item lines="full" class="login-field">
              <ion-label position="stacked">Password</ion-label>
              <ion-input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                placeholder="Enter your password"
                autocomplete="current-password"
                :disabled="isLoading"
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
              class="login-btn"
              :disabled="!canSubmit || isLoading || isSyncing"
              @click="handleLogin"
            >
              <ion-spinner v-if="isLoading || isSyncing" name="crescent" slot="start" />
              <span>{{
                isSyncing ? syncBtnLabel :
                isLoading  ? 'Signing in…'  :
                             'Sign In'
              }}</span>
            </ion-button>
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
import { eyeOutline, eyeOffOutline, alertCircleOutline, cloudOfflineOutline, warningOutline, pricetagOutline } from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useSync } from '@/composables/useSync';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import SetPasswordModal from '@/components/SetPasswordModal.vue';
import type { Brand } from '@/types';

const router = useRouter();
const authStore = useAuthStore();

const brands = ref<Brand[]>([]);
const brandsLoading = ref(false);
const selectedBrandId = ref<string>('');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const currentYear = new Date().getFullYear();

const isLoading = computed(() => authStore.isLoading);
const { isSyncing, sync } = useSync();

const syncBtnMessages = [
  'Loading data…',
  'Fetching items…',
  'Loading customers…',
  'Preparing app…',
  'Almost ready…',
];
const syncBtnIndex = ref(0);
let syncBtnTimer: ReturnType<typeof setInterval> | null = null;

watch(isSyncing, (active) => {
  if (active) {
    syncBtnIndex.value = 0;
    syncBtnTimer = setInterval(() => {
      syncBtnIndex.value = (syncBtnIndex.value + 1) % syncBtnMessages.length;
    }, 5000);
  } else {
    if (syncBtnTimer) { clearInterval(syncBtnTimer); syncBtnTimer = null; }
    syncBtnIndex.value = 0;
  }
});

onUnmounted(() => {
  if (syncBtnTimer)  { clearInterval(syncBtnTimer);  syncBtnTimer  = null; }
  if (syncSlowTimer) { clearTimeout(syncSlowTimer);  syncSlowTimer = null; }
});

const syncBtnLabel = computed(() => syncBtnMessages[syncBtnIndex.value]);

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

const selectedBrand = computed(() => brands.value.find((b) => b.id === selectedBrandId.value) ?? null);

const canSubmit = computed(
  () => selectedBrandId.value && username.value.trim(),
);

onMounted(() => {
  loadBrands();
});

function loadBrands() {
  /* Splash already pre-loaded brands into cache — read synchronously */
  const cached = StorageService.getCachedBrands();
  if (cached.length) {
    brands.value = cached;
    return;
  }
  /* Fallback: splash was skipped somehow */
  brandsLoading.value = true;
  ApiService.getBrands()
    .then((data) => {
      StorageService.setCachedBrands(data);
      brands.value = data;
    })
    .catch(() => { brands.value = []; })
    .finally(() => { brandsLoading.value = false; });
}

async function handleLogin() {
  if (!canSubmit.value) return;
  authStore.clearError();
  if (!selectedBrand.value) return;

  const ok = await authStore.login(selectedBrand.value, username.value, password.value);
  if (!ok) return;

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
</style>
