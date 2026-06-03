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
          <ion-buttons slot="end">
            <ion-button
              fill="clear"
              :disabled="!isDirty"
              class="save-btn"
              @click="save"
            >
              Save
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <!-- ── Hero ── -->
        <div class="profile-hero">
          <div class="hero-avatar">{{ userInitial }}</div>
          <p class="hero-name">{{ form.displayName || authStore.user?.displayName }}</p>
          <span class="hero-brand">{{ authStore.brand?.displayName }}</span>
        </div>

        <!-- ── Personal ── -->
        <p class="section-label">Personal</p>
        <ion-list lines="inset" class="field-list">
          <ion-item class="field-item">
            <ion-label position="stacked" class="field-label">Display Name</ion-label>
            <ion-input v-model="form.displayName" placeholder="Enter display name" class="field-input" />
          </ion-item>
          <ion-item class="field-item">
            <ion-label position="stacked" class="field-label">Job Title</ion-label>
            <ion-input v-model="form.jobTitle" placeholder="Enter job title" class="field-input" />
          </ion-item>
        </ion-list>

        <!-- ── Contact ── -->
        <p class="section-label">Contact</p>
        <ion-list lines="inset" class="field-list">
          <ion-item class="field-item">
            <ion-label position="stacked" class="field-label">Phone Number</ion-label>
            <ion-input v-model="form.phoneNumber" type="tel" placeholder="Enter phone number" class="field-input" />
          </ion-item>
          <ion-item class="field-item">
            <ion-label position="stacked" class="field-label">Mobile Phone</ion-label>
            <ion-input v-model="form.mobilePhoneNumber" type="tel" placeholder="Enter mobile number" class="field-input" />
          </ion-item>
          <ion-item class="field-item">
            <ion-label position="stacked" class="field-label">Email</ion-label>
            <ion-input v-model="form.email" type="email" placeholder="Enter email address" class="field-input" />
          </ion-item>
        </ion-list>

        <!-- ── Company ── -->
        <p class="section-label">Company</p>
        <ion-list lines="inset" class="field-list">
          <ion-item class="field-item">
            <ion-label position="stacked" class="field-label">Company Name</ion-label>
            <ion-input v-model="form.companyName" placeholder="Enter company name" class="field-input" />
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

        <!-- ── Save footer ── -->
        <div v-if="isDirty" class="save-footer">
          <ion-button expand="block" class="save-footer-btn" @click="save">
            Save Changes
          </ion-button>
          <ion-button expand="block" fill="clear" color="medium" @click="resetForm">
            Discard
          </ion-button>
        </div>

        <div style="height: 32px;" />
      </ion-content>
    </ion-page>
  </ion-modal>
</template>

<script setup lang="ts">
import { reactive, computed, watch } from 'vue';
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
  toastController,
} from '@ionic/vue';
import { closeOutline } from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';

const props = defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ close: [] }>();

const authStore = useAuthStore();

const form = reactive({
  displayName: '',
  jobTitle: '',
  companyName: '',
  phoneNumber: '',
  mobilePhoneNumber: '',
  email: '',
});

function resetForm() {
  const u = authStore.user;
  if (!u) return;
  form.displayName = u.displayName ?? '';
  form.jobTitle = u.jobTitle ?? '';
  form.companyName = u.companyName ?? '';
  form.phoneNumber = u.phoneNumber ?? '';
  form.mobilePhoneNumber = u.mobilePhoneNumber ?? '';
  form.email = u.email ?? '';
}

watch(() => props.isOpen, (open) => {
  if (open) resetForm();
});

const userInitial = computed(
  () => (form.displayName || authStore.user?.displayName)?.charAt(0)?.toUpperCase() ?? '?',
);

const isDirty = computed(() => {
  const u = authStore.user;
  if (!u) return false;
  return (
    form.displayName !== (u.displayName ?? '') ||
    form.jobTitle !== (u.jobTitle ?? '') ||
    form.companyName !== (u.companyName ?? '') ||
    form.phoneNumber !== (u.phoneNumber ?? '') ||
    form.mobilePhoneNumber !== (u.mobilePhoneNumber ?? '') ||
    form.email !== (u.email ?? '')
  );
});

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

async function save() {
  authStore.updateUser({ ...form });
  const toast = await toastController.create({
    message: 'Profile updated.',
    duration: 1800,
    color: 'success',
    position: 'bottom',
  });
  toast.present();
  emit('close');
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
  margin-bottom: 4px;
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

/* ── Save footer ── */
.save-footer {
  padding: 20px 16px 0;
  animation: fade-slide-up 0.2s var(--ease-out-quart) both;
}

.save-footer-btn {
  --background: var(--app-gold);
  --background-activated: var(--app-gold-dark);
  --border-radius: 12px;
  height: 50px;
  font-size: 15px;
  font-weight: 700;
  box-shadow: var(--app-shadow-gold);
  margin-bottom: 4px;
}

/* ── Header save button ── */
.save-btn {
  font-weight: 700;
  color: var(--app-gold);
  font-size: 15px;
}
</style>
