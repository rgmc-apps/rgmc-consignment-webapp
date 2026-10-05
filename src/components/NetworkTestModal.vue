<template>
  <ion-modal :is-open="isOpen" @did-dismiss="emit('close')" @did-present="onPresent">
    <ion-page :class="{ 'nettest--minimalist': isMinimalist }">
      <ion-header>
        <ion-toolbar>
          <ion-title>Network Test</ion-title>
          <ion-buttons slot="start">
            <ion-button fill="clear" @click="emit('close')">
              <ion-icon :icon="closeOutline" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <div class="nt-hero">
          <ion-icon :icon="speedometerOutline" class="nt-hero-icon" />
          <p class="nt-hero-title">Check your connection</p>
          <p class="nt-hero-sub">Pings the app server 4 times from this device and reads what your browser knows about your network.</p>
        </div>

        <div class="nt-action">
          <ion-button expand="block" class="nt-run-btn" :disabled="isTesting" @click="run">
            <ion-spinner v-if="isTesting" name="crescent" slot="start" />
            <ion-icon v-else :icon="refreshOutline" slot="start" />
            {{ isTesting ? 'Testing…' : (lastResult ? 'Run Test Again' : 'Run Test') }}
          </ion-button>
        </div>

        <template v-if="lastResult">
          <!-- ── Verdict ── -->
          <div class="nt-verdict" :class="verdictClass">
            <ion-icon :icon="verdictIcon" class="nt-verdict-icon" />
            <div>
              <p class="nt-verdict-title">{{ verdict.title }}</p>
              <p class="nt-verdict-body">{{ verdict.body }}</p>
            </div>
          </div>

          <!-- ── Latency ── -->
          <p class="section-label">Latency (this device → server)</p>
          <ion-list lines="inset" class="field-list">
            <ion-item class="field-item field-item--readonly">
              <ion-label position="stacked" class="field-label">First Response</ion-label>
              <ion-input :value="msLabel(lastResult.firstMs)" readonly class="field-input field-input--readonly" />
            </ion-item>
            <ion-item class="field-item field-item--readonly" lines="none">
              <ion-label position="stacked" class="field-label">Steady-State Average</ion-label>
              <ion-input :value="msLabel(lastResult.steadyAvgMs)" readonly class="field-input field-input--readonly" />
            </ion-item>
          </ion-list>
          <div class="nt-samples">
            <span v-for="(s, i) in lastResult.samples" :key="i" class="nt-sample-chip" :class="{ 'nt-sample-chip--slow': s.ms > 1500 }">
              {{ i + 1 }}: {{ s.ms }}ms
            </span>
          </div>

          <!-- ── Server ── -->
          <p class="section-label">Server Status</p>
          <ion-list lines="inset" class="field-list">
            <ion-item class="field-item field-item--readonly">
              <ion-label position="stacked" class="field-label">State</ion-label>
              <ion-input :value="serverStateLabel" readonly class="field-input field-input--readonly" />
            </ion-item>
            <ion-item class="field-item field-item--readonly" lines="none">
              <ion-label position="stacked" class="field-label">Active Requests In-Flight</ion-label>
              <ion-input :value="String(lastResult.activeBcRequests)" readonly class="field-input field-input--readonly" />
            </ion-item>
          </ion-list>

          <!-- ── Device network ── -->
          <p class="section-label">This Device</p>
          <ion-list lines="inset" class="field-list">
            <ion-item class="field-item field-item--readonly">
              <ion-label position="stacked" class="field-label">Status</ion-label>
              <ion-input :value="lastResult.online ? 'Online' : 'Offline'" readonly class="field-input field-input--readonly" />
            </ion-item>
            <ion-item class="field-item field-item--readonly">
              <ion-label position="stacked" class="field-label">Connection Type</ion-label>
              <ion-input :value="lastResult.connectionType?.toUpperCase() || 'Unknown'" readonly class="field-input field-input--readonly" />
            </ion-item>
            <ion-item v-if="lastResult.downlinkMbps != null" class="field-item field-item--readonly">
              <ion-label position="stacked" class="field-label">Estimated Downlink</ion-label>
              <ion-input :value="`${lastResult.downlinkMbps} Mbps`" readonly class="field-input field-input--readonly" />
            </ion-item>
            <ion-item v-if="lastResult.rttMs != null" class="field-item field-item--readonly" lines="none">
              <ion-label position="stacked" class="field-label">Browser-Reported RTT</ion-label>
              <ion-input :value="`${lastResult.rttMs} ms`" readonly class="field-input field-input--readonly" />
            </ion-item>
          </ion-list>

          <p class="nt-timestamp">Last run: {{ lastResult.ranAt.toLocaleTimeString('en-PH') }}</p>

          <div class="nt-report-action">
            <ion-button expand="block" fill="outline" class="nt-report-btn" @click="reportResults">
              <ion-icon :icon="paperPlaneOutline" slot="start" />
              Report These Results
            </ion-button>
          </div>
        </template>

        <div style="height: 32px;" />
      </ion-content>
    </ion-page>
  </ion-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue';
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
} from '@ionic/vue';
import {
  closeOutline,
  speedometerOutline,
  refreshOutline,
  paperPlaneOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  warningOutline,
} from 'ionicons/icons';
import { useNetworkTest } from '@/composables/useNetworkTest';
import { useErrorReporter } from '@/composables/useErrorReporter';
import { useTheme } from '@/composables/useTheme';

defineProps<{ isOpen: boolean }>();
const emit = defineEmits<{ close: [] }>();

const { theme } = useTheme();
const isMinimalist = computed(() => theme.value === 'minimalist');

const { isTesting, lastResult, runNetworkTest } = useNetworkTest();
const { openReport } = useErrorReporter();

async function run() {
  await runNetworkTest();
}

// Run automatically the first time the modal is opened, so there's something
// to look at without an extra tap — subsequent opens keep the last result.
function onPresent() {
  if (!lastResult.value && !isTesting.value) run();
}

function msLabel(ms: number | null): string {
  return ms == null ? '—' : `${ms} ms`;
}

// A cold Cloud Run instance shows up as a slow first ping followed by fast ones —
// that gap is the signal this test exists to surface, separate from an actually
// slow/overloaded connection where every ping stays slow.
const COLD_START_GAP_MS = 1200;
const SLOW_STEADY_MS = 800;

const verdict = computed(() => {
  const r = lastResult.value;
  if (!r) return { title: '', body: '' };
  if (!r.online) {
    return { title: 'Offline', body: 'This device has no network connection right now.' };
  }
  const gap = (r.firstMs ?? 0) - (r.steadyAvgMs ?? 0);
  if (r.warmingUp || gap > COLD_START_GAP_MS) {
    return {
      title: 'Server was waking up',
      body: 'The first request was slow but the rest were fast — the server had scaled down and needed to start back up. This is not your connection.',
    };
  }
  if ((r.steadyAvgMs ?? 0) > SLOW_STEADY_MS || r.busy) {
    return {
      title: 'Server or connection is under load',
      body: r.busy
        ? 'The server reports it is busy with other requests right now — this affects everyone, not just this device.'
        : 'Every ping came back slow, not just the first one — this looks like a real connection issue on this device or network.',
    };
  }
  return {
    title: 'Looks healthy',
    body: 'Latency is normal and the server is not under load. If the app still feels slow, it may be a specific screen or a one-off.',
  };
});

const verdictClass = computed(() => {
  const r = lastResult.value;
  if (!r) return '';
  if (!r.online) return 'nt-verdict--bad';
  const gap = (r.firstMs ?? 0) - (r.steadyAvgMs ?? 0);
  if (r.warmingUp || gap > COLD_START_GAP_MS) return 'nt-verdict--warn';
  if ((r.steadyAvgMs ?? 0) > SLOW_STEADY_MS || r.busy) return 'nt-verdict--bad';
  return 'nt-verdict--good';
});

const verdictIcon = computed(() => {
  const cls = verdictClass.value;
  if (cls === 'nt-verdict--good') return checkmarkCircleOutline;
  if (cls === 'nt-verdict--warn') return warningOutline;
  return alertCircleOutline;
});

const serverStateLabel = computed(() => {
  const r = lastResult.value;
  if (!r) return '—';
  if (r.busy) return 'Busy';
  if (r.warmingUp) return 'Warming Up';
  return 'Normal';
});

function reportResults() {
  const r = lastResult.value;
  if (!r) return;
  openReport({
    title: 'Network Test Results',
    context: `${verdict.value.title} — first response ${msLabel(r.firstMs)}, steady-state avg ${msLabel(r.steadyAvgMs)}, server ${serverStateLabel.value.toLowerCase()}.`,
    payload: {
      ranAt: r.ranAt.toISOString(),
      samplesMs: r.samples.map((s) => s.ms),
      firstMs: r.firstMs,
      steadyAvgMs: r.steadyAvgMs,
      serverWarmingUp: r.warmingUp,
      serverBusy: r.busy,
      activeBcRequests: r.activeBcRequests,
      connectionType: r.connectionType,
      downlinkMbps: r.downlinkMbps,
      rttMs: r.rttMs,
      saveData: r.saveData,
      online: r.online,
    },
  });
}
</script>

<style scoped>
.nt-hero {
  background: var(--app-dark);
  padding: 32px 24px 26px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
  position: relative;
}

.nettest--minimalist .nt-hero {
  background: #f4f4f4;
  border-bottom: 1px solid #e4e4e4;
}

.nt-hero-icon {
  font-size: 34px;
  color: var(--app-gold);
  margin-bottom: 4px;
}

.nt-hero-title {
  font-size: 19px;
  font-weight: 800;
  color: #ffffff;
  margin: 0;
}

.nettest--minimalist .nt-hero-title { color: #2a2a2a; }

.nt-hero-sub {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--app-text-muted);
  margin: 0;
  max-width: 280px;
  line-height: 1.4;
}

.nt-action {
  padding: 18px 18px 0;
}

.nt-run-btn {
  --background: var(--app-surface-alt, rgba(160, 115, 32, 0.12));
  --background-activated: rgba(160, 115, 32, 0.2);
  --border-radius: 14px;
  --color: var(--app-gold);
  height: 52px;
  font-size: 15px;
  font-weight: 700;
  border: 1px solid rgba(160, 115, 32, 0.35);
}

/* ── Verdict banner ── */
.nt-verdict {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin: 20px 18px 0;
  padding: 13px 14px;
  border-radius: 12px;
}

.nt-verdict-icon {
  font-size: 19px;
  flex-shrink: 0;
  margin-top: 1px;
}

.nt-verdict-title {
  font-size: 13.5px;
  font-weight: 700;
  margin: 0 0 2px;
  color: var(--app-fg);
}

.nt-verdict-body {
  font-size: 12px;
  font-weight: 500;
  margin: 0;
  color: var(--app-text-muted);
  line-height: 1.4;
}

.nt-verdict--good {
  background: rgba(var(--ion-color-success-rgb), 0.1);
  border: 1px solid rgba(var(--ion-color-success-rgb), 0.28);
}
.nt-verdict--good .nt-verdict-icon { color: var(--ion-color-success); }

.nt-verdict--warn {
  background: rgba(var(--ion-color-warning-rgb), 0.1);
  border: 1px solid rgba(var(--ion-color-warning-rgb), 0.28);
}
.nt-verdict--warn .nt-verdict-icon { color: var(--ion-color-warning-shade); }

.nt-verdict--bad {
  background: rgba(var(--ion-color-danger-rgb), 0.1);
  border: 1px solid rgba(var(--ion-color-danger-rgb), 0.28);
}
.nt-verdict--bad .nt-verdict-icon { color: var(--ion-color-danger); }

/* ── Sections (matches ProfileModal) ── */
.section-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: var(--tracking-wider);
  text-transform: uppercase;
  color: var(--app-gold);
  margin: 24px 18px 8px;
}

.field-list {
  background: var(--app-surface);
  margin: 0;
  border-radius: 0;
}

.field-item {
  --background: var(--app-surface);
  --padding-start: 18px;
  --inner-padding-end: 18px;
  --min-height: 62px;
}

.field-item--readonly {
  --background: var(--app-surface-alt, rgba(255, 255, 255, 0.03));
}

.field-label {
  font-size: 12px !important;
  font-weight: 700 !important;
  letter-spacing: 0.5px !important;
  text-transform: uppercase !important;
  color: var(--app-text-muted) !important;
  margin-bottom: 3px !important;
}

.field-input {
  font-size: 15px;
  font-weight: 600;
  color: var(--app-fg);
  --padding-top: 2px;
  --padding-bottom: 8px;
}

.field-input--readonly {
  color: var(--app-text-muted);
  opacity: 0.85;
}

/* ── Per-ping chips ── */
.nt-samples {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 10px 18px 0;
}

.nt-sample-chip {
  font-size: 11px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  padding: 4px 9px;
  border-radius: 20px;
  background: var(--app-surface-alt, rgba(255, 255, 255, 0.05));
  border: 1px solid var(--app-border);
  color: var(--app-text-muted);
}

.nt-sample-chip--slow {
  color: var(--ion-color-warning-shade);
  border-color: rgba(var(--ion-color-warning-rgb), 0.4);
  background: rgba(var(--ion-color-warning-rgb), 0.1);
}

.nt-timestamp {
  font-size: 11px;
  font-weight: 500;
  color: var(--app-text-muted);
  opacity: 0.7;
  margin: 14px 18px 0;
}

.nt-report-action {
  padding: 16px 18px 0;
}

.nt-report-btn {
  --border-radius: 14px;
  --border-color: var(--app-border);
  --color: var(--app-fg);
  height: 48px;
  font-size: 14px;
  font-weight: 600;
}
</style>
