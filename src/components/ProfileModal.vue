<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('close')">
    <ion-page>
      <ion-header>
        <ion-toolbar>
          <ion-title>Profile</ion-title>
          <ion-buttons slot="start">
            <ion-button fill="clear" @click="emit('close')">
              <ion-icon :icon="closeOutline" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <!-- ── Hero ── -->
        <div class="profile-hero">
          <div class="hero-avatar-wrap" @click="triggerPhotoUpload">
            <user-avatar
              :src="authStore.photoUrl"
              :name="authStore.user?.displayName || ''"
              class="hero-avatar"
            />
            <div class="hero-avatar-badge">
              <ion-spinner v-if="isUploadingPhoto" name="crescent" class="badge-spinner" />
              <ion-icon v-else :icon="cameraOutline" />
            </div>
          </div>
          <input ref="photoInput" type="file" accept="image/*" style="display:none" @change="onPhotoSelected" />
          <p class="hero-name">{{ authStore.user?.displayName }}</p>
          <span class="hero-brand">{{ authStore.brand?.displayName }}</span>
        </div>

        <!-- ── Personal ── -->
        <p class="section-label">Personal</p>
        <ion-list lines="inset" class="field-list">
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Display Name</ion-label>
            <ion-input :value="authStore.user?.displayName || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Job Title</ion-label>
            <ion-input :value="authStore.user?.jobTitle || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
        </ion-list>

        <!-- ── Contact ── -->
        <p class="section-label">Contact</p>
        <ion-list lines="inset" class="field-list">
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Phone Number</ion-label>
            <ion-input :value="authStore.user?.phoneNumber || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Mobile Phone</ion-label>
            <ion-input :value="authStore.user?.mobilePhoneNumber || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Email</ion-label>
            <ion-input :value="authStore.user?.email || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
        </ion-list>

        <!-- ── Company ── -->
        <p class="section-label">Company</p>
        <ion-list lines="inset" class="field-list">
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Company Name</ion-label>
            <ion-input :value="authStore.user?.companyName || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Company No.</ion-label>
            <ion-input :value="authStore.user?.companyNumber || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
        </ion-list>

        <!-- ── Account ── -->
        <p class="section-label">Account</p>
        <ion-list lines="inset" class="field-list">
          <ion-item v-if="authStore.user?.username" class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Username</ion-label>
            <ion-input :value="authStore.user.username" readonly class="field-input field-input--readonly" />
          </ion-item>
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Contact No.</ion-label>
            <ion-input :value="authStore.user?.number || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
          <ion-item class="field-item field-item--readonly">
            <ion-label position="stacked" class="field-label">Type</ion-label>
            <ion-input :value="authStore.user?.type || '—'" readonly class="field-input field-input--readonly" />
          </ion-item>
          <ion-item class="field-item field-item--readonly" lines="none">
            <ion-label position="stacked" class="field-label">Last Modified</ion-label>
            <ion-input :value="lastModifiedLabel" readonly class="field-input field-input--readonly" />
          </ion-item>
        </ion-list>

        <!-- ── Security ── -->
        <p class="section-label">Security</p>
        <ion-list lines="inset" class="field-list">
          <ion-item class="field-item">
            <ion-label position="stacked" class="field-label">New Password</ion-label>
            <ion-input
              v-model="newPassword"
              :type="showNewPw ? 'text' : 'password'"
              placeholder="Min. 6 characters"
              autocomplete="new-password"
              :disabled="isSavingPw"
              class="field-input"
            />
            <ion-button slot="end" fill="clear" size="small" @click="showNewPw = !showNewPw">
              <ion-icon :icon="showNewPw ? eyeOffOutline : eyeOutline" slot="icon-only" />
            </ion-button>
          </ion-item>
          <ion-item class="field-item" lines="none">
            <ion-label position="stacked" class="field-label">Confirm Password</ion-label>
            <ion-input
              v-model="confirmPw"
              :type="showConfirmPw ? 'text' : 'password'"
              placeholder="Re-enter password"
              autocomplete="new-password"
              :disabled="isSavingPw"
              class="field-input"
            />
            <ion-button slot="end" fill="clear" size="small" @click="showConfirmPw = !showConfirmPw">
              <ion-icon :icon="showConfirmPw ? eyeOffOutline : eyeOutline" slot="icon-only" />
            </ion-button>
          </ion-item>
        </ion-list>

        <!-- Password validation hint -->
        <Transition name="pw-hint-fade">
          <div v-if="pwHintMsg" class="pw-hint" :class="{ 'pw-hint--ok': pwIsValid }">
            <ion-icon :icon="pwIsValid ? checkmarkCircleOutline : alertCircleOutline" />
            <span>{{ pwHintMsg }}</span>
          </div>
        </Transition>

        <div class="pw-action">
          <ion-button
            expand="block"
            class="pw-save-btn"
            :disabled="!pwIsValid || isSavingPw"
            @click="savePassword"
          >
            <ion-spinner v-if="isSavingPw" name="crescent" slot="start" />
            <ion-icon v-else :icon="lockClosedOutline" slot="start" />
            {{ isSavingPw ? 'Updating password…' : 'Update Password' }}
          </ion-button>
        </div>

        <div style="height: 32px;" />
      </ion-content>
    </ion-page>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  IonModal,
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonInput,
  IonSpinner,
  toastController,
} from '@ionic/vue';
import {
  closeOutline,
  eyeOutline,
  eyeOffOutline,
  lockClosedOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  cameraOutline,
} from 'ionicons/icons';
import bcrypt from 'bcryptjs';
import { useAuthStore } from '@/stores/auth.store';
import { ApiService } from '@/services/api.service';
import UserAvatar from '@/components/UserAvatar.vue';

defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ close: [] }>();

const authStore = useAuthStore();

const lastModifiedLabel = computed(() => {
  const dt = authStore.user?.lastModifiedDateTime;
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
});

/* ── Photo upload ── */
const photoInput = ref<HTMLInputElement | null>(null);
const isUploadingPhoto = ref(false);

function triggerPhotoUpload() {
  photoInput.value?.click();
}

async function onPhotoSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file || !authStore.user) return;
  isUploadingPhoto.value = true;
  const reader = new FileReader();
  reader.onload = (e) => { authStore.setPhotoUrl(e.target?.result as string); };
  reader.readAsDataURL(file);
  try {
    await ApiService.updateContactPicture(authStore.user.id, file);
    const toast = await toastController.create({ message: 'Photo updated.', duration: 1800, color: 'success', position: 'bottom' });
    toast.present();
  } catch {
    const toast = await toastController.create({ message: 'Failed to update photo.', duration: 2500, color: 'danger', position: 'bottom' });
    toast.present();
  } finally {
    isUploadingPhoto.value = false;
    if (photoInput.value) photoInput.value.value = '';
  }
}

const newPassword = ref('');
const confirmPw = ref('');
const showNewPw = ref(false);
const showConfirmPw = ref(false);
const isSavingPw = ref(false);

const pwHintMsg = computed(() => {
  if (!newPassword.value && !confirmPw.value) return '';
  if (newPassword.value.length < 6) return 'Password must be at least 6 characters.';
  if (confirmPw.value && newPassword.value !== confirmPw.value) return 'Passwords do not match.';
  if (newPassword.value && newPassword.value === confirmPw.value) return 'Passwords match.';
  return '';
});

const pwIsValid = computed(
  () => newPassword.value.length >= 6 && newPassword.value === confirmPw.value,
);

async function savePassword() {
  if (!pwIsValid.value || isSavingPw.value) return;
  isSavingPw.value = true;
  try {
    const hash = await bcrypt.hash(newPassword.value, 10);
    authStore.updateUser({ passwordHash: hash });
    newPassword.value = '';
    confirmPw.value = '';
    const toast = await toastController.create({
      message: 'Password updated successfully.',
      duration: 2000,
      color: 'success',
      position: 'bottom',
    });
    toast.present();
  } finally {
    isSavingPw.value = false;
  }
}
</script>

<style scoped>
/* ── Hero ── */
.profile-hero {
  background: var(--app-dark);
  padding: 28px 20px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  position: relative;
  overflow: hidden;
}

.profile-hero::after {
  content: '';
  position: absolute;
  bottom: 0; left: 8%; right: 8%;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(160, 115, 32, 0.4), transparent);
}

.hero-avatar-wrap {
  position: relative;
  cursor: pointer;
  display: inline-flex;
  margin-bottom: 4px;
}

.hero-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: rgba(160, 115, 32, 0.15);
  border: 2px solid rgba(160, 115, 32, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  font-weight: 800;
  color: var(--app-gold);
}

/* Camera badge — always visible in bottom-right corner */
.hero-avatar-badge {
  position: absolute;
  bottom: 1px;
  right: 1px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--app-gold);
  border: 2px solid var(--app-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 11px;
  pointer-events: none;
}

.badge-spinner {
  width: 11px;
  height: 11px;
  color: #fff;
}

.hero-name {
  font-size: var(--text-lg);
  font-weight: 800;
  color: #ffffff;
  margin: 0;
  letter-spacing: var(--tracking-tight);
  text-align: center;
}

.hero-brand {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--app-gold);
  opacity: 0.8;
}

/* ── Section labels ── */
.section-label {
  font-size: var(--text-2xs);
  font-weight: 700;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--app-gold);
  margin: 20px 16px 6px;
}

/* ── Field list ── */
.field-list {
  background: var(--app-surface);
  margin: 0;
  border-radius: 0;
}

.field-item {
  --background: var(--app-surface);
  --padding-start: 16px;
  --inner-padding-end: 16px;
  --min-height: 60px;
}

.field-item--readonly {
  --background: var(--app-surface-alt, rgba(255, 255, 255, 0.03));
}

.field-label {
  font-size: 11px !important;
  font-weight: 700 !important;
  letter-spacing: 0.5px !important;
  text-transform: uppercase !important;
  color: var(--app-text-muted) !important;
  margin-bottom: 2px !important;
}

.field-input {
  font-size: 15px;
  font-weight: 500;
  color: var(--app-fg);
  --padding-top: 2px;
  --padding-bottom: 6px;
}

.field-input--readonly {
  color: var(--app-text-muted);
  opacity: 0.7;
}

/* ── Password hint ── */
.pw-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 8px 16px 0;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  background: var(--app-danger-bg);
  border: 1px solid var(--app-error-border);
  color: var(--ion-color-danger);
}

.pw-hint--ok {
  background: rgba(var(--ion-color-success-rgb), 0.12);
  border-color: rgba(var(--ion-color-success-rgb), 0.3);
  color: var(--ion-color-success);
}

.pw-hint-fade-enter-active { transition: opacity 0.2s ease, transform 0.2s var(--ease-out-quart); }
.pw-hint-fade-leave-active { transition: opacity 0.14s ease; }
.pw-hint-fade-enter-from   { opacity: 0; transform: translateY(-4px); }
.pw-hint-fade-leave-to     { opacity: 0; }

/* ── Password action button ── */
.pw-action {
  padding: 16px 16px 0;
}

.pw-save-btn {
  --background: var(--app-surface-alt, rgba(160, 115, 32, 0.12));
  --background-activated: rgba(160, 115, 32, 0.2);
  --border-radius: 12px;
  --color: var(--app-gold);
  height: 50px;
  font-size: 15px;
  font-weight: 700;
  border: 1px solid rgba(160, 115, 32, 0.35);
}
</style>
