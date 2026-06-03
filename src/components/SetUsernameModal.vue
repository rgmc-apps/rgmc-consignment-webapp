<template>
  <ion-modal :is-open="isOpen" :can-dismiss="false">
    <ion-page class="set-un-page">
      <ion-content :fullscreen="true" class="set-un-content">
        <div class="set-un-container">

          <!-- Header -->
          <div class="set-un-header">
            <div class="set-un-avatar">{{ userInitial }}</div>
            <h1 class="set-un-title">Set Your Username</h1>
            <p class="set-un-name">{{ displayName }}</p>
            <p class="set-un-desc">
              Your account doesn't have a username yet.
              Choose one to sign in with next time.
            </p>
          </div>

          <!-- Form -->
          <ion-card class="set-un-card">
            <ion-card-content>

              <ion-item lines="full" class="un-field">
                <ion-label position="stacked">Username</ion-label>
                <ion-input
                  v-model="newUsername"
                  type="text"
                  placeholder="Choose a username"
                  autocomplete="username"
                  :disabled="isSaving"
                  @keyup.enter="submit"
                />
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
                class="set-un-btn"
                :disabled="!isValid || isSaving"
                @click="submit"
              >
                <ion-spinner v-if="isSaving" name="crescent" slot="start" />
                <ion-icon v-else :icon="personOutline" slot="start" />
                {{ isSaving ? 'Saving…' : 'Set Username & Continue' }}
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
  personOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useSync } from '@/composables/useSync';

defineProps<{ isOpen: boolean }>();

const router = useRouter();
const authStore = useAuthStore();
const { sync } = useSync();

const newUsername = ref('');
const isSaving = ref(false);

const displayName = computed(
  () => authStore.pendingUsernameData?.contact.displayName ?? 'Your Account',
);
const userInitial = computed(() => displayName.value.charAt(0).toUpperCase());

const validationMsg = computed(() => {
  if (!newUsername.value) return '';
  if (newUsername.value.trim().length < 2) return 'Username must be at least 2 characters.';
  return 'Looks good!';
});

const isValid = computed(() => newUsername.value.trim().length >= 2);

async function submit() {
  if (!isValid.value || isSaving.value) return;
  isSaving.value = true;
  try {
    const loginComplete = await authStore.completeUsernameSetup(newUsername.value.trim());
    if (loginComplete) {
      await sync();
      router.replace('/app/home');
    }
    // if not complete, SetPasswordModal will chain in automatically
  } catch {
    const t = await toastController.create({
      message: 'Failed to save username. Please try again.',
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
  newUsername.value = '';
  authStore.clearUsernameSetup();
}
</script>

<style scoped>
.set-un-page {
  --background: var(--app-dark);
}

.set-un-content {
  --background: var(--app-dark);
}

.set-un-container {
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
.set-un-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  animation: fade-slide-up 0.45s var(--ease-out-expo) both;
}

.set-un-avatar {
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

.set-un-title {
  font-size: 22px;
  font-weight: 700;
  color: #ffffff;
  margin: 0;
  letter-spacing: 0.3px;
}

.set-un-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-gold-light);
  margin: 0;
  letter-spacing: 0.3px;
}

.set-un-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  margin: 4px 0 0;
  line-height: 1.55;
  max-width: 280px;
}

/* ── Card ── */
.set-un-card {
  width: 100%;
  max-width: 420px;
  --background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  animation: fade-slide-up 0.5s var(--ease-out-expo) 0.08s both;
}

/* ── Field ── */
.un-field {
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
.set-un-btn {
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

.set-un-btn:active { transform: scale(0.97); }

/* ── Cancel ── */
.cancel-btn {
  color: rgba(255, 255, 255, 0.3);
  font-size: 13px;
  font-weight: 500;
}
</style>
