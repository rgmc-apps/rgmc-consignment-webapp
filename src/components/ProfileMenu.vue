<template>
  <ion-button fill="clear" class="profile-trigger" @click="isOpen = true">
    <user-avatar :src="authStore.photoUrl" :name="authStore.user?.displayName || ''" class="avatar-sm" />
  </ion-button>

  <ion-popover
    :is-open="isOpen"
    @did-dismiss="isOpen = false"
    side="bottom"
    alignment="end"
    :arrow="false"
    class="profile-pop"
  >
    <ion-content class="pop-content">
      <!-- User info header -->
      <div class="pop-user">
        <user-avatar :src="authStore.photoUrl" :name="authStore.user?.displayName || ''" class="pop-avatar" />
        <div class="pop-info">
          <span class="pop-name">{{ authStore.user?.displayName }}</span>
          <span v-if="authStore.user?.username" class="pop-username">@{{ authStore.user.username }}</span>
          <span class="pop-brand">{{ authStore.brand?.displayName }}</span>
        </div>
      </div>

      <div class="pop-divider" />

      <!-- Edit Profile -->
      <button class="pop-item" @click="openProfile">
        <ion-icon :icon="personOutline" class="pop-icon" />
        <div class="pop-item-text">
          <span class="pop-item-label">Edit Profile</span>
          <span class="pop-item-sub">View and edit your details</span>
        </div>
        <ion-icon :icon="chevronForwardOutline" class="pop-chevron" />
      </button>

      <div class="pop-divider" />

      <!-- Sync -->
      <button
        class="pop-item"
        :class="{ 'pop-item--syncing': isSyncing, 'pop-item--disabled': !isSyncing && !isOnline }"
        :disabled="isSyncing || !isOnline"
        @click="onSync"
      >
        <ion-icon
          :icon="syncOutline"
          class="pop-icon"
          :class="{ 'pop-icon--spinning': isSyncing }"
        />
        <div class="pop-item-text">
          <span class="pop-item-label">
            {{ isSyncing ? `Syncing… ${syncProgress}%` : 'Sync Data' }}
          </span>
          <span class="pop-item-sub">{{ isSyncing ? 'Fetching latest data…' : lastSyncLabel }}</span>
        </div>
      </button>

      <!-- Inline per-table progress — slides in while sync is running -->
      <Transition name="sync-expand">
        <div v-if="isSyncing && syncSubTasks.length" class="pop-sync-panel">
          <div class="pop-progress-bar">
            <div class="pop-progress-fill" :style="{ width: syncProgress + '%' }" />
          </div>
          <div class="pop-sync-tasks">
            <div v-for="(task, i) in syncSubTasks" :key="task.label" class="pop-task-row">
              <ion-icon
                v-if="task.status === 'done'"
                :icon="checkmarkCircleOutline"
                class="pop-task-icon pop-task-icon--done"
              />
              <ion-icon
                v-else-if="task.status === 'error'"
                :icon="alertCircleOutline"
                class="pop-task-icon pop-task-icon--error"
              />
              <ion-spinner v-else name="crescent" class="pop-task-spinner" />
              <span
                class="pop-task-label"
                :class="{
                  'pop-task-label--done': task.status === 'done',
                  'pop-task-label--error': task.status === 'error',
                }"
              >{{ task.label }}</span>
              <span v-if="task.status === 'pending' && i === 4" class="pop-task-pct">{{ syncProgress }}%</span>
            </div>
          </div>
        </div>
      </Transition>

      <div class="pop-divider" />

      <!-- Theme selector -->
      <div class="theme-section">
        <span class="theme-section__label">Appearance</span>
        <div class="theme-pills">
          <button
            class="theme-pill"
            :class="{ 'theme-pill--active': theme === 'minimalist' }"
            @click="setTheme('minimalist')"
          >
            <ion-icon :icon="removeOutline" class="theme-pill__icon" />
            <span>Minimal</span>
          </button>
          <button
            class="theme-pill"
            :class="{ 'theme-pill--active': theme === 'light' }"
            @click="setTheme('light')"
          >
            <ion-icon :icon="sunnyOutline" class="theme-pill__icon" />
            <span>Light</span>
          </button>
          <button
            class="theme-pill"
            :class="{ 'theme-pill--active': theme === 'dark' }"
            @click="setTheme('dark')"
          >
            <ion-icon :icon="moonOutline" class="theme-pill__icon" />
            <span>Dark</span>
          </button>
        </div>
      </div>

      <div class="pop-divider" />

      <!-- Sign out -->
      <button class="pop-item pop-item--danger" @click="onLogout">
        <ion-icon :icon="logOutOutline" class="pop-icon" />
        <span class="pop-item-label">Sign Out</span>
      </button>
    </ion-content>
  </ion-popover>

  <!-- Profile modal -->
  <profile-modal :is-open="profileOpen" @close="profileOpen = false" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  IonButton,
  IonIcon,
  IonContent,
  IonPopover,
  IonSpinner,
  alertController,
} from '@ionic/vue';
import {
  syncOutline,
  logOutOutline,
  personOutline,
  chevronForwardOutline,
  sunnyOutline,
  moonOutline,
  removeOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';
import { useSync } from '@/composables/useSync';
import { useNetworkStatus } from '@/composables/useNetworkStatus';
import { useTheme } from '@/composables/useTheme';
import ProfileModal from '@/components/ProfileModal.vue';
import UserAvatar from '@/components/UserAvatar.vue';

const router = useRouter();
const authStore = useAuthStore();
const { isSyncing, syncProgress, syncSubTasks, lastSyncLabel, sync } = useSync();
const { isOnline } = useNetworkStatus();
const { theme, setTheme } = useTheme();

const isOpen = ref(false);
const profileOpen = ref(false);

function openProfile() {
  isOpen.value = false;
  // Small delay so popover finishes dismissing before modal opens
  setTimeout(() => { profileOpen.value = true; }, 100);
}

async function onSync() {
  if (isSyncing.value || !isOnline.value) return;
  await sync();
}

async function onLogout() {
  isOpen.value = false;
  await new Promise((r) => setTimeout(r, 150));
  const alert = await alertController.create({
    header: 'Sign Out',
    message: 'Are you sure you want to sign out?',
    buttons: [
      { text: 'Cancel', role: 'cancel' },
      {
        text: 'Sign Out',
        handler: () => {
          authStore.logout();
          router.replace('/login');
        },
      },
    ],
  });
  await alert.present();
}
</script>

<style scoped>
/* ── Trigger button ── */
.profile-trigger {
  --padding-start: 6px;
  --padding-end: 6px;
  margin-inline-end: 2px;
}

.avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-gold) 15%, transparent);
  border: 1.5px solid color-mix(in srgb, var(--app-gold) 45%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 800;
  color: var(--app-gold);
  letter-spacing: 0;
  flex-shrink: 0;
}

/* ── Popover sizing ── */
.profile-pop {
  --width: 270px;
  --border-radius: 14px;
  --box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  --background: var(--app-surface);
}

.pop-content {
  --background: var(--app-surface);
}

/* ── User header ── */
.pop-user {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 16px 14px;
}

.pop-avatar {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--app-gold) 15%, transparent);
  border: 2px solid color-mix(in srgb, var(--app-gold) 40%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 800;
  color: var(--app-gold);
  flex-shrink: 0;
}

.pop-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
}

.pop-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--app-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pop-username {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pop-brand {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--app-gold);
  opacity: 0.8;
}

/* ── Divider ── */
.pop-divider {
  height: 1px;
  background: var(--app-border);
  margin: 0;
}

/* ── Action rows ── */
.pop-item {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 13px 16px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;
  color: var(--app-fg);
}

.pop-item:active {
  background: rgba(0, 0, 0, 0.04);
}

.pop-item--disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.pop-item--danger {
  color: var(--ion-color-danger);
}

.pop-icon {
  font-size: 18px;
  flex-shrink: 0;
  color: var(--app-text-muted);
}

.pop-item--danger .pop-icon {
  color: var(--ion-color-danger);
}

.pop-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.pop-item-label {
  font-size: 14px;
  font-weight: 600;
  color: inherit;
}

.pop-item-sub {
  font-size: 11px;
  font-weight: 400;
  color: var(--app-text-muted);
}

.pop-chevron {
  font-size: 14px;
  color: var(--app-text-muted);
  opacity: 0.5;
  flex-shrink: 0;
}

/* ── Sync active state ── */
.pop-item--syncing {
  cursor: default;
}

.pop-item--syncing .pop-item-label {
  color: var(--app-gold);
}

@keyframes icon-spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(-360deg); }
}

.pop-icon--spinning {
  color: var(--app-gold) !important;
  animation: icon-spin 1.4s linear infinite;
}

/* ── Inline sync progress panel ── */
.pop-sync-panel {
  padding: 0 16px 12px;
  overflow: hidden;
}

.pop-progress-bar {
  height: 3px;
  border-radius: 3px;
  background: var(--app-border);
  overflow: hidden;
  margin-bottom: 10px;
}

.pop-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: linear-gradient(90deg, var(--app-gold) 0%, color-mix(in srgb, var(--app-gold) 75%, white) 100%);
  transition: width 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.pop-sync-tasks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px 10px;
}

.pop-task-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.pop-task-icon--done {
  font-size: 11px;
  color: oklch(62% 0.15 145);
  flex-shrink: 0;
}

.pop-task-icon--error {
  font-size: 11px;
  color: var(--ion-color-danger);
  flex-shrink: 0;
}

.pop-task-spinner {
  width: 10px;
  height: 10px;
  color: var(--app-gold);
  flex-shrink: 0;
}

.pop-task-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--app-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pop-task-label--done {
  opacity: 0.4;
}

.pop-task-label--error {
  color: var(--ion-color-danger);
}

.pop-task-pct {
  font-size: 10px;
  font-weight: 700;
  color: var(--app-gold);
  flex-shrink: 0;
  margin-left: auto;
}

/* ── Slide-in / slide-out transition ── */
.sync-expand-enter-active {
  transition: opacity 0.22s ease, max-height 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}
.sync-expand-leave-active {
  transition: opacity 0.15s ease, max-height 0.2s ease;
  overflow: hidden;
}
.sync-expand-enter-from,
.sync-expand-leave-to {
  opacity: 0;
  max-height: 0 !important;
}
.sync-expand-enter-to,
.sync-expand-leave-from {
  opacity: 1;
  max-height: 160px;
}

/* ── Theme selector ── */
.theme-section {
  padding: 12px 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.theme-section__label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--app-text-muted);
}

.theme-pills {
  display: flex;
  gap: 6px;
}

.theme-pill {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  background: var(--app-surface-alt);
  border: 1.5px solid var(--app-border);
  border-radius: 10px;
  cursor: pointer;
  color: var(--app-text-muted);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.3px;
  transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}

.theme-pill--active {
  background: color-mix(in srgb, var(--app-gold) 12%, transparent);
  border-color: var(--app-gold);
  color: var(--app-gold);
}

.theme-pill__icon {
  font-size: 16px;
}
</style>
