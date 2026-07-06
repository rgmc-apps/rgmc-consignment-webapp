<template>
  <div class="brb-wrap">
    <ion-button fill="clear" class="brb-btn" @click="handleClick" aria-label="Report a bug">
      <ion-icon :icon="bugOutline" slot="icon-only" class="brb-icon" />
      <span v-if="showBadge" class="brb-badge" aria-hidden="true" />
    </ion-button>

    <Transition name="brb-tip">
      <div v-if="showTip" class="brb-tip" role="dialog" aria-live="polite">
        <div class="brb-tip-arrow" />
        <div class="brb-tip-row">
          <div class="brb-tip-icon-wrap">
            <ion-icon :icon="bugOutline" class="brb-tip-icon" />
          </div>
          <div class="brb-tip-text">
            <p class="brb-tip-title">Report a Bug</p>
            <p class="brb-tip-body">Tap this icon anytime to send errors directly to IT/MIS.</p>
          </div>
        </div>
        <button class="brb-tip-dismiss" @click.stop="dismiss">Got it</button>
        <div class="brb-tip-progress">
          <div class="brb-tip-progress-bar" />
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { IonButton, IonIcon } from '@ionic/vue';
import { bugOutline } from 'ionicons/icons';
import { APP_VERSION } from '@/version';
import { useErrorReporter } from '@/composables/useErrorReporter';

const SEEN_KEY = 'rgmc_seen_version';
const TIP_DURATION = 9000;

const showBadge = ref(false);
const showTip   = ref(false);
let showTimer:    ReturnType<typeof setTimeout> | null = null;
let dismissTimer: ReturnType<typeof setTimeout> | null = null;

const { openReport } = useErrorReporter();

onMounted(() => {
  try {
    const seen = localStorage.getItem(SEEN_KEY);
    if (seen !== APP_VERSION) {
      showBadge.value = true;
      showTimer = setTimeout(() => {
        showTip.value = true;
        dismissTimer = setTimeout(dismiss, TIP_DURATION);
      }, 1000);
    }
  } catch { /* localStorage unavailable */ }
});

onUnmounted(() => {
  if (showTimer)    clearTimeout(showTimer);
  if (dismissTimer) clearTimeout(dismissTimer);
});

function dismiss() {
  if (dismissTimer) { clearTimeout(dismissTimer); dismissTimer = null; }
  showTip.value   = false;
  showBadge.value = false;
  try { localStorage.setItem(SEEN_KEY, APP_VERSION); } catch {}
}

function handleClick() {
  dismiss();
  openReport({ context: `Manual bug report from ${window.location.pathname}` });
}
</script>

<style scoped>
.brb-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.brb-btn {
  --padding-start: 6px;
  --padding-end: 6px;
  position: relative;
}

.brb-icon {
  font-size: 19px;
  color: var(--app-header-color, #ffffff);
  opacity: 0.65;
  transition: opacity 0.15s;
}
.brb-btn:hover .brb-icon,
.brb-btn:active .brb-icon { opacity: 1; }

/* Red pulsing notification dot */
.brb-badge {
  position: absolute;
  top: 6px;
  right: 5px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #ff4444;
  border: 1.5px solid var(--app-header-bg, #1a1a1a);
  animation: brb-pulse 1.8s ease infinite;
}

@keyframes brb-pulse {
  0%, 100% { transform: scale(1);    opacity: 1; }
  50%       { transform: scale(1.35); opacity: 0.75; }
}

/* ── Tooltip card ── */
.brb-tip {
  position: absolute;
  top: calc(100% + 10px);
  right: -4px;
  width: 230px;
  background: #1e1e1e;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 14px;
  padding: 12px 14px 10px;
  z-index: 9999;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  overflow: hidden;
}

/* Arrow pointing up */
.brb-tip-arrow {
  position: absolute;
  top: -7px;
  right: 18px;
  width: 13px;
  height: 13px;
  background: #1e1e1e;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  transform: rotate(45deg);
  border-radius: 2px 0 0 0;
}

.brb-tip-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
}

.brb-tip-icon-wrap {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: rgba(255, 68, 68, 0.14);
  border: 1px solid rgba(255, 68, 68, 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brb-tip-icon { font-size: 16px; color: #ff6b6b; }

.brb-tip-text { flex: 1; }

.brb-tip-title {
  font-size: 13px;
  font-weight: 800;
  color: #ffffff;
  margin: 0 0 3px;
  letter-spacing: -0.2px;
}

.brb-tip-body {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  margin: 0;
  line-height: 1.45;
}

.brb-tip-dismiss {
  display: block;
  width: 100%;
  padding: 6px 0;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.75);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  text-align: center;
  transition: background 0.15s;
}
.brb-tip-dismiss:hover { background: rgba(255, 255, 255, 0.13); }

/* Countdown progress strip at the bottom */
.brb-tip-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(255, 255, 255, 0.07);
}
.brb-tip-progress-bar {
  height: 100%;
  background: rgba(255, 255, 255, 0.25);
  animation: brb-countdown 9s linear forwards;
}
@keyframes brb-countdown {
  from { width: 100%; }
  to   { width: 0%; }
}

/* ── Minimalist mode overrides ── */
:global([data-theme="minimalist"]) .brb-icon { color: #555555; opacity: 0.8; }
:global([data-theme="minimalist"]) .brb-badge { border-color: #ffffff; }

/* ── Tip transition ── */
.brb-tip-enter-active { transition: opacity 0.22s ease, transform 0.22s var(--ease-out-quart, cubic-bezier(0.25,1,0.5,1)); }
.brb-tip-leave-active { transition: opacity 0.15s ease; }
.brb-tip-enter-from   { opacity: 0; transform: translateY(-6px) scale(0.97); }
.brb-tip-leave-to     { opacity: 0; }
</style>
