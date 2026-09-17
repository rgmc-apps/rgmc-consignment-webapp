import { ref, computed, watch } from 'vue';
import { ApiService } from '@/services/api.service';
import { useSessionStore } from '@/stores/session.store';
import type { ScanSession, SalesOrderPayload, SalesReturnOrderPayload } from '@/types';

export type SubmitPhase = 'pending' | 'submitting' | 'done' | 'failed';

/* Module-level singleton — deliberately NOT component-local state.
 *
 * BC order submission polls for up to 5 minutes. It used to live in SubmitPage.vue's
 * local refs, which meant leaving that page (in-app nav, or the phone's hardware back
 * button — Vue Router intercepts both the same way) orphaned the result: the async
 * function kept running, but its eventual status write landed on refs owned by an
 * unmounted component that nothing was watching. A confirmed BC order could vanish
 * from the app entirely.
 *
 * Keeping this state here instead — same pattern as useSync/useServerStatus — means
 * it survives navigation, HistoryPage can show it as a live "pending" entry, and it
 * finalizes into session history the instant it resolves, regardless of which page (if
 * any) happens to be mounted at that moment. */
const pendingSession  = ref<ScanSession | null>(null);
const salesStatus     = ref<SubmitPhase>('pending');
const returnsStatus   = ref<SubmitPhase>('pending');
const salesSeriesNo   = ref('');
const returnsSeriesNo = ref('');
const salesError      = ref('');
const returnsError    = ref('');
const salesErrorObj   = ref<Error | null>(null);
const returnsErrorObj = ref<Error | null>(null);

// True once the currently-tracked session has been written to history — guards against
// the auto-finalize watcher and an explicit finalizeNow() call (e.g. the user taps
// "Finish Session" right as the watcher fires) both trying to finalize the same session.
let finalized = true;

function hasSalesLines(s: ScanSession): boolean {
  return s.salesOrders.length > 0 || !!s.noSales;
}
function hasReturnLines(s: ScanSession): boolean {
  return s.returnOrders.length > 0;
}

const isPending = computed(() => pendingSession.value !== null);
const anyDone   = computed(() => salesStatus.value === 'done'   || returnsStatus.value === 'done');
const anyFailed = computed(() => salesStatus.value === 'failed' || returnsStatus.value === 'failed');

/** True once every order type the tracked session actually has lines for has reached
 *  a terminal state. A type with zero lines (e.g. no returns at all) never blocks this —
 *  there is nothing to wait for. */
const isComplete = computed(() => {
  const s = pendingSession.value;
  if (!s) return true;
  const salesOk   = !hasSalesLines(s)  || salesStatus.value   === 'done' || salesStatus.value   === 'failed';
  const returnsOk = !hasReturnLines(s) || returnsStatus.value === 'done' || returnsStatus.value === 'failed';
  return salesOk && returnsOk;
});

/** Start (or resume) tracking a session's submission. Idempotent per session id, so
 *  calling this again for the same session — e.g. re-opening Submit while it's still
 *  processing in the background — never resets progress already made. */
function track(session: ScanSession): void {
  if (pendingSession.value?.id === session.id) return;
  pendingSession.value = { ...session };
  salesStatus.value = 'pending';
  returnsStatus.value = 'pending';
  salesSeriesNo.value = '';
  returnsSeriesNo.value = '';
  salesError.value = '';
  returnsError.value = '';
  salesErrorObj.value = null;
  returnsErrorObj.value = null;
  finalized = false;
}

/** Clears leftover terminal status ('done'/'failed') from a previously finalized
 *  session so a newly viewed session doesn't inherit it.
 *
 *  finalize() only nulls out pendingSession — it never resets salesStatus/
 *  returnsStatus themselves, and track() (the only place that does) never ran
 *  because it only fires when the user clicks Submit. Since SubmitPage renders the
 *  submit button vs. the 'done'/'failed' badge straight off these shared refs, a
 *  brand-new session opened after a previous one finished would show as already
 *  submitted (or failed) — with nothing actually sent — and there'd be no submit
 *  button visible to click to fix it (see track()'s status !== 'pending' guard in
 *  SubmitPage's template). Confirmed against production logs: real BC submissions
 *  correctly end in 'done'/'failed', but that terminal state was never being
 *  cleared for the next customer's session.
 *
 *  Safe to call freely on every session view/change — it's a no-op whenever a
 *  submission is actively tracked (pendingSession !== null), so it can never
 *  disturb a still-in-flight or not-yet-finalized submission, including one
 *  belonging to a *different* session than the one being viewed. */
function clearStaleStatus(): void {
  if (pendingSession.value !== null) return;
  if (salesStatus.value === 'pending' && returnsStatus.value === 'pending') return;
  salesStatus.value = 'pending';
  returnsStatus.value = 'pending';
  salesSeriesNo.value = '';
  returnsSeriesNo.value = '';
  salesError.value = '';
  returnsError.value = '';
  salesErrorObj.value = null;
  returnsErrorObj.value = null;
}

/** Writes the tracked session to history (local storage + Firestore) using whatever
 *  resolved so far, and stops tracking it. Safe to call more than once — only the
 *  first call after track() has any effect. Combining rule matches the original
 *  explicit "Finish Session" behavior: any failed part fails the whole session. */
function finalize(): void {
  if (finalized || !pendingSession.value) return;
  finalized = true;
  const session = pendingSession.value;
  const sessionStore = useSessionStore();
  if (anyFailed.value) {
    const combined = [salesError.value, returnsError.value].filter(Boolean).join('; ');
    sessionStore.markFailed(combined || 'Partial submission failure', session);
  } else {
    sessionStore.markSubmitted(salesSeriesNo.value || undefined, returnsSeriesNo.value || undefined, session);
  }
  pendingSession.value = null;
}

// Auto-finalize the instant every relevant part resolves — independent of navigation,
// so leaving Submit mid-poll (now allowed; see SubmitPage's onBeforeRouteLeave) never
// loses a confirmed order. Declared once at module scope: these are module-level refs,
// so the watcher needs no component lifecycle to own it.
watch([salesStatus, returnsStatus], () => {
  if (isComplete.value) finalize();
});

async function pollUntilDone(taskId: string, timeoutMs = 300_000): Promise<{ status: string; result?: unknown; error?: string }> {
  const deadline = Date.now() + timeoutMs;
  let consecutiveErrors = 0;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3_000));
    try {
      const task = await ApiService.pollTask(taskId);
      consecutiveErrors = 0;
      if (task.status === 'done' || task.status === 'failed') return task;
    } catch {
      consecutiveErrors++;
      // Swallow transient bc-api errors (network blip, brief 503) and keep polling.
      // Only give up after 10 consecutive failures (~30 s of silence).
      if (consecutiveErrors >= 10) throw new Error('Order status unavailable — check History or contact IT/MIS.');
    }
  }
  throw new Error('Order is taking too long — check History or contact IT/MIS.');
}

async function submitSales(session: ScanSession, payload: SalesOrderPayload): Promise<void> {
  track(session);
  salesStatus.value = 'submitting';
  try {
    const { taskId } = await ApiService.submitSalesOrderAsync(payload);
    const task = await pollUntilDone(taskId);
    if (task.status === 'done') {
      // BC's create response uses "number" for the document number — there is no
      // "no" field. Reading .no here silently produced an empty series on every
      // successful submission (confirmed in production: 0 of the last 1000
      // submitted sessions have a series number). See HistoryPage's matchOrder for
      // the same bug in the manual "Fetch BC Order Number" fallback.
      salesSeriesNo.value = (task.result as Record<string, string>)?.number ?? '';
      salesStatus.value = 'done';
    } else {
      throw new Error(task.error ?? 'Order processing failed');
    }
  } catch (err) {
    salesErrorObj.value = err instanceof Error ? err : new Error(String(err));
    salesError.value = salesErrorObj.value.message;
    salesStatus.value = 'failed';
  }
}

async function submitReturns(session: ScanSession, payload: SalesReturnOrderPayload): Promise<void> {
  track(session);
  returnsStatus.value = 'submitting';
  try {
    const { taskId } = await ApiService.submitSalesReturnOrderAsync(payload);
    const task = await pollUntilDone(taskId);
    if (task.status === 'done') {
      returnsSeriesNo.value = (task.result as Record<string, string>)?.number ?? '';
      returnsStatus.value = 'done';
    } else {
      throw new Error(task.error ?? 'Order processing failed');
    }
  } catch (err) {
    returnsErrorObj.value = err instanceof Error ? err : new Error(String(err));
    returnsError.value = returnsErrorObj.value.message;
    returnsStatus.value = 'failed';
  }
}

/** Manual override for the "Finish Session" button: combines whatever has resolved so
 *  far right now, even if a type that has lines was never attempted (matches the
 *  original button behavior — it never required both types to be attempted, only that
 *  at least one resolved). The auto-finalize watcher above only fires once every type
 *  that HAS lines is resolved; this lets the user close out sooner if they choose to. */
function finalizeNow(): void {
  finalize();
}

export function useOrderSubmission() {
  return {
    pendingSession,
    isPending,
    salesStatus,
    returnsStatus,
    salesSeriesNo,
    returnsSeriesNo,
    salesError,
    returnsError,
    salesErrorObj,
    returnsErrorObj,
    anyDone,
    anyFailed,
    isComplete,
    submitSales,
    submitReturns,
    finalizeNow,
    clearStaleStatus,
  };
}
