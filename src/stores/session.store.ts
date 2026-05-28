import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Brand, Contact, Customer, OrderLine, ScanSession, DiscountType } from '@/types';
import { StorageService } from '@/services/storage.service';

function generateId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).substring(2) + Date.now().toString(36);
}

function computeTotal(srp: number, quantity: number, discountType: DiscountType, discountValue: number): number {
  const gross = srp * quantity;
  if (discountType === 'percent') {
    return gross * (1 - discountValue / 100);
  }
  return Math.max(0, gross - discountValue);
}

function buildSession(brand: Brand, user: Contact): ScanSession {
  return {
    id: generateId(),
    brand: { id: brand.id, code: brand.code, displayName: brand.displayName },
    user: { displayName: user.displayName },
    customer: null,
    salesOrders: [],
    returnOrders: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'draft',
  };
}

export const useSessionStore = defineStore('session', () => {
  const currentSession = ref<ScanSession | null>(null);
  const drafts = ref<ScanSession[]>([]);
  const completedSessions = ref<ScanSession[]>([]);

  const salesOrders = computed(() => currentSession.value?.salesOrders ?? []);
  const returnOrders = computed(() => currentSession.value?.returnOrders ?? []);

  const salesTotal = computed(() =>
    salesOrders.value.reduce((sum, l) => sum + l.totalAmount, 0),
  );
  const returnTotal = computed(() =>
    returnOrders.value.reduce((sum, l) => sum + l.totalAmount, 0),
  );
  const salesQty = computed(() =>
    salesOrders.value.reduce((sum, l) => sum + l.quantity, 0),
  );
  const returnQty = computed(() =>
    returnOrders.value.reduce((sum, l) => sum + l.quantity, 0),
  );

  const hasDrafts = computed(() => drafts.value.length > 0);
  const hasLines = computed(
    () => salesOrders.value.length > 0 || returnOrders.value.length > 0,
  );

  function loadFromStorage(): void {
    drafts.value = StorageService.getDrafts();
    completedSessions.value = StorageService.getSessions();
  }

  function startNewSession(brand: Brand, user: Contact): void {
    currentSession.value = buildSession(brand, user);
    _saveDraft();
  }

  function resumeDraft(session: ScanSession): void {
    currentSession.value = { ...session };
  }

  function setCustomer(customer: Customer): void {
    if (!currentSession.value) return;
    currentSession.value.customer = customer;
    _touch();
    _saveDraft();
  }

  function addSalesOrder(line: Omit<OrderLine, 'id' | 'totalAmount'>): void {
    if (!currentSession.value) return;
    const total = computeTotal(line.srp, line.quantity, line.discountType, line.discountValue);
    currentSession.value.salesOrders.push({ ...line, id: generateId(), totalAmount: total });
    _touch();
    _saveDraft();
  }

  function addReturnOrder(line: Omit<OrderLine, 'id' | 'totalAmount'>): void {
    if (!currentSession.value) return;
    const total = computeTotal(line.srp, line.quantity, line.discountType, line.discountValue);
    currentSession.value.returnOrders.push({ ...line, id: generateId(), totalAmount: total });
    _touch();
    _saveDraft();
  }

  function removeSalesOrder(lineId: string): void {
    if (!currentSession.value) return;
    currentSession.value.salesOrders = currentSession.value.salesOrders.filter(
      (l) => l.id !== lineId,
    );
    _touch();
    _saveDraft();
  }

  function removeReturnOrder(lineId: string): void {
    if (!currentSession.value) return;
    currentSession.value.returnOrders = currentSession.value.returnOrders.filter(
      (l) => l.id !== lineId,
    );
    _touch();
    _saveDraft();
  }

  /** Called by "Save as Draft & Go Back" — keeps the session in drafts,
   *  does NOT move it to history, and clears it as the active session. */
  function saveAsDraftAndExit(): void {
    if (!currentSession.value) return;
    currentSession.value.status = 'draft';
    _touch();
    StorageService.saveDraft({ ...currentSession.value });
    drafts.value = StorageService.getDrafts();
    currentSession.value = null;
  }

  function markSubmitted(salesSeries?: string, returnSeries?: string): void {
    if (!currentSession.value) return;
    currentSession.value.status = 'submitted';
    currentSession.value.submittedAt = new Date().toISOString();
    if (salesSeries) currentSession.value.salesOrderSeries = salesSeries;
    if (returnSeries) currentSession.value.returnOrderSeries = returnSeries;
    StorageService.saveSession({ ...currentSession.value });
    StorageService.removeDraft(currentSession.value.id);
    completedSessions.value = StorageService.getSessions();
    drafts.value = StorageService.getDrafts();
    currentSession.value = null;
  }

  function markFailed(errorMessage: string): void {
    if (!currentSession.value) return;
    currentSession.value.status = 'failed';
    currentSession.value.errorMessage = errorMessage;
    StorageService.saveSession({ ...currentSession.value });
    StorageService.removeDraft(currentSession.value.id);
    completedSessions.value = StorageService.getSessions();
    drafts.value = StorageService.getDrafts();
  }

  function retryFailedSession(session: ScanSession): void {
    StorageService.removeSession(session.id);
    completedSessions.value = StorageService.getSessions();
    const restored: ScanSession = {
      ...session,
      status: 'draft',
      errorMessage: undefined,
    };
    currentSession.value = restored;
    StorageService.saveDraft(restored);
    drafts.value = StorageService.getDrafts();
  }

  function deleteDraft(sessionId: string): void {
    StorageService.removeDraft(sessionId);
    drafts.value = StorageService.getDrafts();
    if (currentSession.value?.id === sessionId) {
      currentSession.value = null;
    }
  }

  function clearCurrentSession(): void {
    currentSession.value = null;
  }

  function _touch(): void {
    if (currentSession.value) {
      currentSession.value.updatedAt = new Date().toISOString();
    }
  }

  function _saveDraft(): void {
    if (currentSession.value) {
      StorageService.saveDraft({ ...currentSession.value });
      drafts.value = StorageService.getDrafts();
    }
  }

  return {
    currentSession,
    drafts,
    completedSessions,
    salesOrders,
    returnOrders,
    salesTotal,
    returnTotal,
    salesQty,
    returnQty,
    hasDrafts,
    hasLines,
    loadFromStorage,
    startNewSession,
    resumeDraft,
    setCustomer,
    addSalesOrder,
    addReturnOrder,
    removeSalesOrder,
    removeReturnOrder,
    saveAsDraftAndExit,
    markSubmitted,
    markFailed,
    retryFailedSession,
    deleteDraft,
    clearCurrentSession,
    computeTotal,
  };
});

export { computeTotal };
