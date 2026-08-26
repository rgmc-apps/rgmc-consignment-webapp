import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';

// Module-level singleton so all components share the same sync state
const isSyncing = ref(false);
const isSyncDelta = ref(false); // true when this run is a delta (modified_since) sync, false for full
const syncPhase = ref('');
const syncProgress = ref(0);
const syncSubTasks = ref<{ label: string; status: 'pending' | 'done' | 'error'; detail?: string }[]>([]);
const syncError = ref<string | null>(null);
const syncWarning = ref<string | null>(null);
// lastSyncDate is a reactive trigger — set to new Date() after each sync so that
// lastSyncLabel (and any other computed) re-evaluates. The authoritative timestamp is
// always read per-company-brand from StorageService.getLastSync().
const lastSyncDate = ref<Date | null>(null);
const syncItemsLoaded = ref(0);
const syncItemsTotal = ref(0);
const isCatalogEmpty = ref(false);
const isTriggering = ref(false);
const triggerMessage = ref<string | null>(null);
const syncDataAge = ref<number>(StorageService.getSyncDataAge());

export function useSync() {
  const authStore = useAuthStore();

  // lastSyncLabel reads the stored timestamp for the current company+brand.
  // lastSyncDate.value is touched so the computed re-evaluates after a sync.
  const lastSyncLabel = computed(() => {
    void lastSyncDate.value; // reactive dependency — re-runs after sync completes
    const company = authStore.company?.code;
    const brand = authStore.brand?.code;
    if (!company || !brand) return 'Never synced';
    const d = StorageService.getLastSync(company, brand);
    if (!d) return 'Never synced';
    return d.toLocaleDateString('en-PH', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  });

  async function sync(): Promise<void> {
    if (isSyncing.value) return;
    if (!navigator.onLine) return;

    isSyncing.value = true;
    syncPhase.value = 'Syncing…';
    syncProgress.value = 0;
    syncError.value = null;
    syncWarning.value = null;
    syncItemsLoaded.value = 0;
    syncItemsTotal.value = 0;

    syncSubTasks.value = [
      { label: 'Customers',       status: 'pending' },
      { label: 'Item Categories', status: 'pending' },
      { label: 'Items & Prices',  status: 'pending' },
      { label: 'Contacts',        status: 'pending' },
    ];

    try {
      const TIMEOUT = 180_000;
      const company  = authStore.company?.code ?? '';
      const brand    = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code ?? '';
      const today = new Date().toISOString().split('T')[0];

      // Abort early — an empty company or brand would corrupt brand-isolated caches.
      if (!company || !brand) {
        syncError.value = 'No company or brand selected. Please log in again.';
        return;
      }

      // Snapshot existing cache state and timestamps *before* the sync starts.
      // If a type has cached data, fetch only records modified since that timestamp
      // (incremental). If the cache is empty, fetch everything (full).
      const ts = StorageService.getSyncTimestamps(company, brand);
      const hasCustomers  = StorageService.getCachedCustomers(company, brand).length > 0;
      const hasCategories = StorageService.getCachedItemCategories().length > 0;
      const hasContacts   = StorageService.getCachedContacts().length > 0;
      const hasItems      = StorageService.getCachedItems().length > 0;

      let done = 0;
      const bump = () => { syncProgress.value = Math.round((++done / 4) * 100); };
      const settle = <T>(p: Promise<T>): Promise<PromiseSettledResult<T>> =>
        p.then((value) => ({ status: 'fulfilled' as const, value }), (reason) => ({ status: 'rejected' as const, reason }));

      const customersResult = await settle(
        ApiService.getCustomers(brand, TIMEOUT, hasCustomers ? ts.customers : undefined)
          .then((r) => { syncSubTasks.value[0].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[0].status = 'error'; bump(); throw e; }),
      );

      const categoriesResult = await settle(
        ApiService.getItemCategories(TIMEOUT, hasCategories ? ts.itemCategories : undefined)
          .then((r) => { syncSubTasks.value[1].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[1].status = 'error'; bump(); throw e; }),
      );

      // Delta sync when we have cached items and a prior timestamp — only fetch records
      // modified since the last sync. Full fetch when the cache is empty.
      const itemsModifiedSince = hasItems && ts.items ? ts.items : undefined;
      isSyncDelta.value = !!itemsModifiedSince;
      const itemsResult = await settle(
        ApiService.getItemsForDate(today, brand, undefined, TIMEOUT, itemsModifiedSince)
          .then((r) => {
            syncItemsLoaded.value = r.items.length;
            syncItemsTotal.value = r.items.length;
            const detail = itemsModifiedSince
              ? `${r.items.length.toLocaleString()} updated`
              : r.items.length.toLocaleString();
            syncSubTasks.value[2] = { ...syncSubTasks.value[2], detail };
            return r;
          })
          .then((r) => {
            syncSubTasks.value[2].status = 'done';
            bump();
            return r;
          })
          .catch((e) => { syncSubTasks.value[2].status = 'error'; bump(); throw e; }),
      );

      const contactsResult = await settle(
        ApiService.getContacts(TIMEOUT, hasContacts ? ts.contacts : undefined)
          .then((r) => { syncSubTasks.value[3].status = 'done'; bump(); return r; })
          .catch((e) => { syncSubTasks.value[3].status = 'error'; bump(); throw e; }),
      );

      // ── Persist ──
      if (customersResult.status === 'fulfilled') {
        if (hasCustomers) {
          StorageService.mergeCachedCustomers(customersResult.value, company, brand);
        } else {
          StorageService.setCachedCustomers(customersResult.value, company, brand);
        }
        StorageService.setSyncTimestamp('customers', company, brand);
      }

      if (categoriesResult.status === 'fulfilled') {
        if (hasCategories) {
          StorageService.mergeCachedItemCategories(categoriesResult.value);
        } else {
          StorageService.setCachedItemCategories(categoriesResult.value);
        }
        StorageService.setSyncTimestamp('itemCategories', company, brand);
      }

      if (itemsResult.status === 'fulfilled') {
        const { items, priceMap } = itemsResult.value;
        if (itemsModifiedSince) {
          // Delta: upsert only the changed items; merge prices so unchanged items keep
          // their cached prices and only the refreshed ones are overwritten.
          StorageService.mergeCachedItems(items, brand);
          const existingPrices = StorageService.getCachedItemPrices();
          StorageService.setCachedItemPrices(today, { ...(existingPrices?.prices ?? {}), ...priceMap });
        } else {
          // Full: replace the entire brand slice and the whole price cache.
          StorageService.setCachedItems(items, brand);
          StorageService.setCachedItemPrices(today, priceMap);
        }
        StorageService.setSyncTimestamp('items', company, brand);
        StorageService.applyPriceMapToItems(priceMap, brand);
        isCatalogEmpty.value = false;
        triggerMessage.value = null;
      } else {
        const reason = (itemsResult as PromiseRejectedResult).reason;
        const msg: string = reason instanceof Error ? reason.message : '';
        if (msg.toLowerCase().includes('catalog is empty')) {
          isCatalogEmpty.value = true;
        }
      }

      if (contactsResult.status === 'fulfilled') {
        if (hasContacts) {
          StorageService.mergeCachedContacts(contactsResult.value);
        } else {
          StorageService.setCachedContacts(contactsResult.value);
        }
        StorageService.setSyncTimestamp('contacts', company, brand);
        const authUser = authStore.user ?? StorageService.getAuth()?.user;
        if (authUser) {
          const patch: Record<string, string> = {};
          if (authUser.username)     patch['username']     = authUser.username;
          if (authUser.passwordHash) patch['passwordHash'] = authUser.passwordHash;
          if (Object.keys(patch).length) StorageService.patchContact(authUser.id, patch);
        }
      }

      const failedTasks = syncSubTasks.value.filter((t) => t.status === 'error').map((t) => t.label);
      if (failedTasks.length) {
        const itemsFailed = itemsResult.status === 'rejected';
        const hasCachedItems = StorageService.getCachedItems().length > 0;
        syncWarning.value = itemsFailed
          ? hasCachedItems
            ? `Item prices couldn't be refreshed — showing last synced prices. Tap sync to retry.`
            : 'The server is still loading item prices. Please wait a moment and tap sync to retry.'
          : `Some data failed to load: ${failedTasks.join(', ')}. Please sync again when ready.`;
      }

      if (itemsResult.status === 'rejected' && StorageService.getCachedItems().length === 0) {
        throw (itemsResult as PromiseRejectedResult).reason;
      }

      syncProgress.value = 100;
      lastSyncDate.value = new Date(); // reactive trigger so lastSyncLabel re-evaluates
    } catch (err) {
      syncError.value = err instanceof Error ? err.message : 'Sync failed. Check your connection.';
    } finally {
      syncPhase.value = '';
      syncSubTasks.value = [];
      isSyncing.value = false;
      isSyncDelta.value = false;
    }
  }

  async function triggerRemoteSync(company: string): Promise<void> {
    if (isTriggering.value) return;
    isTriggering.value = true;
    triggerMessage.value = null;
    try {
      await ApiService.triggerItemPricesSync(company);
      triggerMessage.value = 'Server sync started. Wait 2–3 minutes, then tap Sync Now.';
    } catch (err) {
      triggerMessage.value = err instanceof Error ? `Failed to trigger: ${err.message}` : 'Failed to trigger server sync.';
    } finally {
      isTriggering.value = false;
    }
  }

  async function syncIfStale(maxAgeHours?: number): Promise<void> {
    const age = maxAgeHours ?? syncDataAge.value;
    const company = authStore.company?.code;
    const brand   = authStore.brand?.code;
    if (!company || !brand) {
      await sync();
      return;
    }
    const lastSync = StorageService.getLastSync(company, brand);
    if (!lastSync || (Date.now() - lastSync.getTime()) > age * 3_600_000) {
      await sync();
    }
  }

  function setSyncDataAge(hours: number): void {
    const clamped = Math.max(1, Math.round(hours));
    syncDataAge.value = clamped;
    StorageService.setSyncDataAge(clamped);
  }

  function clearSyncWarning(): void {
    syncWarning.value = null;
    syncError.value = null;
  }

  return {
    isSyncing,
    isSyncDelta,
    syncPhase,
    syncProgress,
    syncSubTasks,
    syncError,
    syncWarning,
    lastSyncDate,
    lastSyncLabel,
    syncItemsLoaded,
    syncItemsTotal,
    isCatalogEmpty,
    isTriggering,
    triggerMessage,
    syncDataAge,
    sync,
    syncIfStale,
    setSyncDataAge,
    clearSyncWarning,
    triggerRemoteSync,
  };
}
