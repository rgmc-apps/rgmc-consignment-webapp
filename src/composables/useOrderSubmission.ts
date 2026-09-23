import { reactive, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { useSessionStore } from '@/stores/session.store';
import type { ScanSession, SalesOrderPayload, SalesReturnOrderPayload } from '@/types';

export type SubmitPhase = 'pending' | 'submitting' | 'done' | 'failed';

interface TrackedEntry {
  session: ScanSession;
  salesStatus: SubmitPhase;
  returnsStatus: SubmitPhase;
  salesSeriesNo: string;
  returnsSeriesNo: string;
  salesError: string;
  returnsError: string;
  salesErrorObj: Error | null;
  returnsErrorObj: Error | null;
  finalized: boolean;
}

/* Module-level map, keyed by session id — deliberately NOT component-local state.
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
 * any) happens to be mounted at that moment.
 *
 * This used to be a single shared set of refs (one "current" session) rather than a
 * map. SubmitPage's onBeforeRouteLeave deliberately lets a rep leave Submit while a
 * submission is still polling and start a brand-new session right away (see that
 * handler) — so two submissions can genuinely be in flight at once, e.g. rep A's
 * still-polling submission and rep B's brand-new one on a shared device, or even the
 * same rep moving on to a second customer before BC responds to the first. With a
 * single shared set of refs, starting the second submission's track() call reset the
 * tracked session AND the result fields out from under the first submission's still-
 * running poll. Whichever task happened to resolve last then wrote its own result
 * number onto whatever session was "current" at that moment — silently attributing
 * one rep's real BC order number to a completely unrelated session (confirmed in
 * production: a "No Sales" order for one customer got attached to a different rep's
 * real order for an unrelated customer), while the other result was dropped entirely.
 * Keying by session id gives every submission its own entry so two in-flight
 * submissions can never clobber each other. */
const tracked = reactive(new Map<string, TrackedEntry>());

function newEntry(session: ScanSession): TrackedEntry {
  return {
    session,
    salesStatus: 'pending',
    returnsStatus: 'pending',
    salesSeriesNo: '',
    returnsSeriesNo: '',
    salesError: '',
    returnsError: '',
    salesErrorObj: null,
    returnsErrorObj: null,
    finalized: false,
  };
}

function hasSalesLines(s: ScanSession): boolean {
  return s.salesOrders.length > 0 || !!s.noSales;
}
function hasReturnLines(s: ScanSession): boolean {
  return s.returnOrders.length > 0;
}

/** True once every order type the entry's session actually has lines for has reached
 *  a terminal state. A type with zero lines (e.g. no returns at all) never blocks this —
 *  there is nothing to wait for. */
function isEntryComplete(e: TrackedEntry): boolean {
  const salesOk   = !hasSalesLines(e.session)  || e.salesStatus   === 'done' || e.salesStatus   === 'failed';
  const returnsOk = !hasReturnLines(e.session) || e.returnsStatus === 'done' || e.returnsStatus === 'failed';
  return salesOk && returnsOk;
}

/** Start (or resume) tracking a session's submission. Idempotent per session id, so
 *  calling this again for the same session — e.g. re-opening Submit while it's still
 *  processing in the background — never resets progress already made. Never touches
 *  any other session's entry. */
function track(session: ScanSession): TrackedEntry {
  let e = tracked.get(session.id);
  if (!e) {
    e = newEntry(session);
    tracked.set(session.id, e);
  }
  return e;
}

/** Writes an entry's session to history (local storage + Firestore) using whatever
 *  resolved so far, and stops tracking it. Safe to call more than once — only the
 *  first call has any effect. Combining rule: any failed part fails the whole session. */
function doFinalize(sessionId: string): void {
  const e = tracked.get(sessionId);
  if (!e || e.finalized) return;
  e.finalized = true;
  const sessionStore = useSessionStore();
  if (e.salesStatus === 'failed' || e.returnsStatus === 'failed') {
    const combined = [e.salesError, e.returnsError].filter(Boolean).join('; ');
    sessionStore.markFailed(combined || 'Partial submission failure', e.session);
  } else {
    sessionStore.markSubmitted(e.salesSeriesNo || undefined, e.returnsSeriesNo || undefined, e.session);
  }
  tracked.delete(sessionId);
}

/** Auto-finalize the instant every relevant part of THIS entry resolves — called right
 *  after submitSales/submitReturns reach a terminal state for their own session, so it
 *  can never be tripped by a different session's status changing. */
function maybeAutoFinalize(sessionId: string): void {
  const e = tracked.get(sessionId);
  if (e && isEntryComplete(e)) doFinalize(sessionId);
}

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
  const e = track(session);
  e.salesStatus = 'submitting';
  try {
    const { taskId } = await ApiService.submitSalesOrderAsync(payload);
    const task = await pollUntilDone(taskId);
    if (task.status === 'done') {
      // BC's create response uses "number" for the document number — there is no
      // "no" field. Reading .no here silently produced an empty series on every
      // successful submission (confirmed in production: 0 of the last 1000
      // submitted sessions have a series number). See HistoryPage's matchOrder for
      // the same bug in the manual "Fetch BC Order Number" fallback.
      e.salesSeriesNo = (task.result as Record<string, string>)?.number ?? '';
      e.salesStatus = 'done';
    } else {
      throw new Error(task.error ?? 'Order processing failed');
    }
  } catch (err) {
    e.salesErrorObj = err instanceof Error ? err : new Error(String(err));
    e.salesError = e.salesErrorObj.message;
    e.salesStatus = 'failed';
  }
  maybeAutoFinalize(session.id);
}

async function submitReturns(session: ScanSession, payload: SalesReturnOrderPayload): Promise<void> {
  const e = track(session);
  e.returnsStatus = 'submitting';
  try {
    const { taskId } = await ApiService.submitSalesReturnOrderAsync(payload);
    const task = await pollUntilDone(taskId);
    if (task.status === 'done') {
      e.returnsSeriesNo = (task.result as Record<string, string>)?.number ?? '';
      e.returnsStatus = 'done';
    } else {
      throw new Error(task.error ?? 'Order processing failed');
    }
  } catch (err) {
    e.returnsErrorObj = err instanceof Error ? err : new Error(String(err));
    e.returnsError = e.returnsErrorObj.message;
    e.returnsStatus = 'failed';
  }
  maybeAutoFinalize(session.id);
}

export function useOrderSubmission() {
  const sessionStore = useSessionStore();

  // Scoped to whichever session SubmitPage currently has open — this is what drives
  // that page's own live status display and its Submit/Finish buttons.
  const activeEntry = computed(() => {
    const id = sessionStore.currentSession?.id;
    return id ? tracked.get(id) : undefined;
  });

  const pendingSession  = computed(() => activeEntry.value?.session ?? null);
  const isPending       = computed(() => activeEntry.value !== undefined);
  const salesStatus     = computed(() => activeEntry.value?.salesStatus   ?? 'pending');
  const returnsStatus   = computed(() => activeEntry.value?.returnsStatus ?? 'pending');
  const salesSeriesNo   = computed(() => activeEntry.value?.salesSeriesNo   ?? '');
  const returnsSeriesNo = computed(() => activeEntry.value?.returnsSeriesNo ?? '');
  const salesError      = computed(() => activeEntry.value?.salesError   ?? '');
  const returnsError    = computed(() => activeEntry.value?.returnsError ?? '');
  const salesErrorObj   = computed(() => activeEntry.value?.salesErrorObj   ?? null);
  const returnsErrorObj = computed(() => activeEntry.value?.returnsErrorObj ?? null);
  const anyDone         = computed(() => salesStatus.value === 'done'   || returnsStatus.value === 'done');
  const anyFailed       = computed(() => salesStatus.value === 'failed' || returnsStatus.value === 'failed');
  const isComplete      = computed(() => !activeEntry.value || isEntryComplete(activeEntry.value));

  // Every submission still in flight or not yet finalized, regardless of which session
  // (if any) is currently open on Submit — this is what HistoryPage uses to show live
  // "still processing" cards for the logged-in user, since leaving Submit mid-poll
  // clears sessionStore.currentSession while the submission keeps running in the
  // background (see SubmitPage's onBeforeRouteLeave).
  const pendingEntries = computed(() =>
    Array.from(tracked.values()).map((e) => ({
      session: e.session,
      salesStatus: e.salesStatus,
      returnsStatus: e.returnsStatus,
      salesSeriesNo: e.salesSeriesNo,
      returnsSeriesNo: e.returnsSeriesNo,
    })),
  );

  /** Manual override for the "Finish Session" button: combines whatever has resolved so
   *  far right now for the currently open session, even if a type that has lines was
   *  never attempted (matches the original button behavior — it never required both
   *  types to be attempted, only that at least one resolved). Auto-finalize (above)
   *  only fires once every type that HAS lines is resolved; this lets the user close
   *  out sooner if they choose to. */
  function finalizeNow(): void {
    const id = sessionStore.currentSession?.id;
    if (id) doFinalize(id);
  }

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
    pendingEntries,
    submitSales,
    submitReturns,
    finalizeNow,
  };
}
