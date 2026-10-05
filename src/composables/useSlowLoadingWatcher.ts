import { ref } from 'vue';

/* Module-level singleton — same pattern as useSync/useServerStatus. Wired into every
 * API call via axios interceptors in api.service.ts, so it applies app-wide without
 * needing every page's own loading state to be instrumented individually.
 *
 * Tracks continuous API activity, not a single request's duration: most individual
 * axios calls already time out well under 5 minutes (the apiClient default is 2 min;
 * the longest explicit override is 5 min), so a single request almost never actually
 * stays in flight that long — it fails first. What actually eats 5 minutes in this app
 * is a RETRYING sequence (rate-limit backoff can reach 60s between attempts) or order
 * submission polling (3s between polls for up to 5 min). So instead of "is one request
 * old", this tracks "how long has API activity been continuous" — a burst of requests
 * with gaps under IDLE_RESET_MS counts as one ongoing incident; a real gap resets it. */

const SLOW_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const CHECK_INTERVAL_MS = 15_000;
// Longer than the longest inter-retry backoff seen in api.service.ts (up to 60s for
// 429 handling), so a retrying-but-still-working sequence isn't mistaken for "done".
const IDLE_RESET_MS = 90_000;

const isSlow = ref(false);
const slowUrl = ref<string | null>(null);

let activeCount = 0;
let firstActivityAt: number | null = null;
let lastUrl: string | null = null;
let checkTimer: ReturnType<typeof setInterval> | null = null;
let idleResetTimer: ReturnType<typeof setTimeout> | null = null;
let dismissedForIncident = false;

function resetIncident(): void {
  firstActivityAt = null;
  isSlow.value = false;
  slowUrl.value = null;
  dismissedForIncident = false;
  if (checkTimer) { clearInterval(checkTimer); checkTimer = null; }
}

function check(): void {
  if (firstActivityAt === null || dismissedForIncident) return;
  if (Date.now() - firstActivityAt >= SLOW_THRESHOLD_MS) {
    isSlow.value = true;
    slowUrl.value = lastUrl;
  }
}

function onRequestStart(url: string): void {
  activeCount++;
  lastUrl = url;
  if (idleResetTimer) { clearTimeout(idleResetTimer); idleResetTimer = null; }
  if (firstActivityAt === null) {
    firstActivityAt = Date.now();
    checkTimer = setInterval(check, CHECK_INTERVAL_MS);
  }
}

function onRequestEnd(): void {
  activeCount = Math.max(0, activeCount - 1);
  if (activeCount === 0) {
    // Grace window before declaring the incident over — a retry/backoff gap (up to
    // 60s observed in this codebase) must not look like "finished".
    idleResetTimer = setTimeout(resetIncident, IDLE_RESET_MS);
  }
}

/** Call when the user acts on the prompt (report or dismiss) so it doesn't re-fire
 *  every check interval while the same slow sequence is still running. */
function dismissIncident(): void {
  isSlow.value = false;
  dismissedForIncident = true;
}

export function useSlowLoadingWatcher() {
  return { isSlow, slowUrl, onRequestStart, onRequestEnd, dismissIncident };
}
