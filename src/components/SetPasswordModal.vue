<template>
  <ion-modal :is-open="isOpen" :can-dismiss="false">
    <ion-page class="set-pw-page">
      <ion-content :fullscreen="true" class="set-pw-content">
        <div class="set-pw-container">

          <!-- Header -->
          <div class="set-pw-header">
            <div class="set-pw-avatar">{{ userInitial }}</div>
            <h1 class="set-pw-title">Set Your Password</h1>
            <p class="set-pw-name">{{ displayName }}</p>
            <p class="set-pw-desc">
              Your account doesn't have a secure password yet.
              Create one to continue.
            </p>
          </div>

          <!-- Form -->
          <ion-card class="set-pw-card">
            <ion-card-content>

              <ion-item lines="full" class="pw-field">
                <ion-label position="stacked">New Password</ion-label>
                <ion-input
                  v-model="newPassword"
                  :type="showNew ? 'text' : 'password'"
                  placeholder="Min. 6 characters"
                  autocomplete="new-password"
                  :disabled="isSaving"
                  @keyup.enter="submit"
                />
                <ion-button slot="end" fill="clear" size="small" @click="showNew = !showNew">
                  <ion-icon :icon="showNew ? eyeOffOutline : eyeOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <ion-item lines="full" class="pw-field">
                <ion-label position="stacked">Confirm Password</ion-label>
                <ion-input
                  v-model="confirmPassword"
                  :type="showConfirm ? 'text' : 'password'"
                  placeholder="Re-enter password"
                  autocomplete="new-password"
                  :disabled="isSaving"
                  @keyup.enter="submit"
                />
                <ion-button slot="end" fill="clear" size="small" @click="showConfirm = !showConfirm">
                  <ion-icon :icon="showConfirm ? eyeOffOutline : eyeOutline" slot="icon-only" />
                </ion-button>
              </ion-item>

              <!-- Validation feedback -->
              <Transition name="val-fade">
                <div v-if="validationMsg" class="val-msg" :class="{ 'val-msg--ok': isValid }">
                  <ion-icon :icon="isValid ? checkmarkCircleOutline : alertCircleOutline" />
                  <span>{{ validationMsg }}</span>
                </div>
              </Transition>

              <ion-button
                expand="block"
                class="set-pw-btn"
                :disabled="!isValid || isSaving"
                @click="submit"
              >
                <ion-spinner v-if="isSaving" name="crescent" slot="start" />
                <ion-icon v-else :icon="lockClosedOutline" slot="start" />
                {{ isSaving ? 'Securing password…' : 'Set Password & Sign In' }}
              </ion-button>

            </ion-card-content>
          </ion-card>

          <ion-button fill="clear" class="cancel-btn" :disabled="isSaving" @click="cancel">
            Cancel
          </ion-button>

        </div>
      </ion-content>
    </ion-page>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonModal,
  IonPage,
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonLabel,
  IonInput,
  IonButton,
  IonIcon,
  IonSpinner,
  toastController,
} from '@ionic/vue';
import {
  eyeOutline,
  eyeOffOutline,
  lockClosedOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useSync } from '@/composables/useSync';

defineProps<{ isOpen: boolean }>();

const router = useRouter();
const authStore = useAuthStore();
const { sync } = useSync();

const newPassword = ref('');
const confirmPassword = ref('');
const showNew = ref(false);
const showConfirm = ref(false);
const isSaving = ref(false);

const displayName = computed(
  () => authStore.pendingSetupData?.contact.displayName ?? 'Your Account',
);
const userInitial = computed(() => displayName.value.charAt(0).toUpperCase());

const validationMsg = computed(() => {
  if (!newPassword.value && !confirmPassword.value) return '';
  if (newPassword.value.length < 6) return 'Password must be at least 6 characters.';
  if (confirmPassword.value && newPassword.value !== confirmPassword.value) return 'Passwords do not match.';
  if (newPassword.value && newPassword.value === confirmPassword.value) return 'Passwords match.';
  return '';
});

const isValid = computed(
  () => newPassword.value.length >= 6 && newPassword.value === confirmPassword.value,
);

async function submit() {
  if (!isValid.value || isSaving.value) return;
  isSaving.value = true;
  try {
    await authStore.completePasswordSetup(newPassword.value);
    sync(); // fire-and-forget — don't block navigation
    router.replace('/app/home');
  } catch {
    const t = await toastController.create({
      message: 'Failed to set password. Please try again.',
      duration: 2500,
      color: 'danger',
      position: 'bottom',
    });
    t.present();
  } finally {
    isSaving.value = false;
  }
}

function cancel() {
  newPassword.value = '';
  confirmPassword.value = '';
  authStore.clearPasswordSetup();
}
</script>

<style scoped>
.set-pw-page {
  --background: var(--app-dark);
}

.set-pw-content {
  --background: var(--app-dark);
}

.set-pw-container {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px 32px;
  gap: 20px;
  box-sizing: border-box;
  max-width: 480px;
  margin: 0 auto;
}

/* ── Header ── */
.set-pw-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  animation: fade-slide-up 0.45s var(--ease-out-expo) both;
}

.set-pw-avatar {
  width: 68px;
  height: 68px;
  border-radius: 50%;
  background: rgba(160, 115, 32, 0.15);
  border: 2px solid rgba(160, 115, 32, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26px;
  font-weight: 800;
  color: var(--app-gold);
  margin-bottom: 4px;
}

.set-pw-title {
  font-size: 22px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  letter-spacing: 0.3px;
}

.set-pw-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-gold-light);
  margin: 0;
  letter-spacing: 0.3px;
}

.set-pw-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  margin: 4px 0 0;
  line-height: 1.55;
  max-width: 280px;
}

/* ── Card ── */
.set-pw-card {
  width: 100%;
  max-width: 420px;
  --background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  animation: fade-slide-up 0.5s var(--ease-out-expo) 0.08s both;
}

/* ── Fields ── */
.pw-field {
  --background: transparent;
  --border-color: var(--app-border);
  --padding-start: 0;
  margin-bottom: 4px;
}

/* ── Validation message ── */
.val-msg {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  margin: 10px 0 0;
  background: var(--app-danger-bg);
  border: 1px solid var(--app-error-border);
  color: var(--ion-color-danger);
}

.val-msg--ok {
  background: rgba(var(--ion-color-success-rgb), 0.12);
  border-color: rgba(var(--ion-color-success-rgb), 0.3);
  color: var(--ion-color-success);
}

.val-fade-enter-active { transition: opacity 0.2s ease, transform 0.2s var(--ease-out-quart); }
.val-fade-leave-active { transition: opacity 0.14s ease; }
.val-fade-enter-from   { opacity: 0; transform: translateY(-4px); }
.val-fade-leave-to     { opacity: 0; }

/* ── Submit button ── */
.set-pw-btn {
  margin-top: 20px;
  --background: var(--app-gold);
  --background-activated: var(--app-gold-dark);
  --border-radius: 12px;
  height: 50px;
  font-size: 15px;
  font-weight: 700;
  box-shadow: var(--app-shadow-gold);
  transition: transform 0.12s var(--ease-out-expo);
}

.set-pw-btn:active { transform: scale(0.97); }

/* ── Cancel ── */
.cancel-btn {
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
  font-weight: 500;
}
</style>
