import { ref, computed } from 'vue';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { useAuthStore } from '@/stores/auth.store';
import type { Item } from '@/types';

// Module-level singleton so all components share the same sync state
const isSyncing = ref(false);
const syncPhase = ref('');
const syncProgress = ref(0);
const syncSubTasks = ref<{ label: string; status: 'pending' | 'done' | 'error'; detail?: string }[]>([]);
const syncError = ref<string | null>(null);
const syncWarning = ref<string | null>(null);
const lastSyncDate = ref<Date | null>(StorageService.getLastSync());
const syncItemsLoaded = ref(0);
const syncItemsTotal = ref(0);

export function useSync() {

  const lastSyncLabel = computed(() => {
    if (!lastSyncDate.value) return 'Never synced';
    const d = lastSyncDate.value;
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

    // Claim the lock synchronously before the first await so no second caller
    // can slip through the isSyncing guard during the checkStatus round-trip.
    isSyncing.value = true;
    syncPhase.value = 'Syncing…';
    syncProgress.value = 0;
    syncError.value = null;
    syncWarning.value = null;
    syncItemsLoaded.value = 0;
    syncItemsTotal.value = 0;

    try {
      // Generous timeout for all sync calls — BC list endpoints can take 60-120 s.
      const SYNC_MS = 180_000;

      // All tables shown up-front so the user sees every task from the moment sync starts.
      syncSubTasks.value = [
        { label: 'Customers',       status: 'pending' },
        { label: 'Item Categories', status: 'pending' },
        { label: 'Items & Prices',  status: 'pending' },
        { label: 'Contacts',        status: 'pending' },
      ];

      const authStore = useAuthStore();
      const brandCode = authStore.brand?.code ?? StorageService.getAuth()?.brand?.code;
      const today = new Date().toISOString().split('T')[0];

      // Phase 1 — customers + categories in parallel (0 → 30%). Abort on failure.
      const bump1 = () => { syncProgress.value = Math.min(30, syncProgress.value + 15); };
      const [customers, categories] = await Promise.all([
        ApiService.getCustomers(brandCode, SYNC_MS)
          .then((r) => { bump1(); syncSubTasks.value[0].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[0].status = 'error'; throw e; }),
        ApiService.getItemCategories(SYNC_MS)
          .then((r) => { bump1(); syncSubTasks.value[1].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[1].status = 'error'; throw e; }),
      ]);

      StorageService.setCachedCustomers(customers);
      StorageService.setCachedItemCategories(categories);
      StorageService.setSyncTimestamp('customers');
      StorageService.setSyncTimestamp('itemCategories');

      // Phase 2 — items + prices (30 → 85%).
      // Uses BC-native pagination: first fetches the total count so we can show
      // accurate per-item progress, then fetches pages in parallel pairs.
      // Falls back to a single full-catalog call if the count endpoint fails.
      const PAGE_SIZE = 500;
      const PAGE_CONCURRENCY = 2;

      // Quick count call — tells us total items expected and fills progress denominator.
      const totalCount = await ApiService.getItemPriceCount(today, brandCode).catch(() => 0);
      syncItemsTotal.value = totalCount;

      let itemResult: { items: Item[]; priceMap: Record<string, number> } | null = null;

      if (totalCount > 0) {
        // Paginated path — progress updates after each batch of pages.
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        const accItems: Item[] = [];
        const accPriceMap: Record<string, number> = {};
        const seenNos = new Set<string>();

        try {
          for (let i = 0; i < totalPages; i += PAGE_CONCURRENCY) {
            const batch = Array.from(
              { length: Math.min(PAGE_CONCURRENCY, totalPages - i) },
              (_, j) => i + j,
            );
            await Promise.all(batch.map(async (pageIdx) => {
              const res = await ApiService.getItemsPage(
                today, brandCode, pageIdx * PAGE_SIZE, PAGE_SIZE, undefined, SYNC_MS,
              );
              for (const item of res.items) {
                if (!seenNos.has(item.number)) {
                  seenNos.add(item.number);
                  accItems.push(item);
                  accPriceMap[item.number] = item.unitPriceIncVAT;
                }
              }
              syncItemsLoaded.value = Math.min(seenNos.size, totalCount);
              syncProgress.value = Math.round(30 + Math.min(syncItemsLoaded.value / totalCount, 1) * 55);
              syncSubTasks.value[2] = {
                ...syncSubTasks.value[2],
                detail: `${syncItemsLoaded.value.toLocaleString()} / ${totalCount.toLocaleString()}`,
              };
            }));
          }
          if (seenNos.size > 0) {
            itemResult = { items: accItems, priceMap: accPriceMap };
            syncSubTasks.value[2].status = 'done';
          } else {
            syncSubTasks.value[2].status = 'error';
          }
        } catch (e) {
          syncSubTasks.value[2].status = 'error';
          const hasCached = StorageService.getCachedItems().length > 0;
          if (!hasCached) throw e;
        }
      } else {
        // Count endpoint unavailable — fall back to single full-catalog call.
        await ApiService.getItemsForDate(today, brandCode, undefined, SYNC_MS)
          .then((r) => {
            itemResult = r;
            syncItemsLoaded.value = r.items.length;
            syncItemsTotal.value = r.items.length;
            syncProgress.value = 85;
            syncSubTasks.value[2].status = 'done';
            syncSubTasks.value[2] = { ...syncSubTasks.value[2], detail: `${r.items.length.toLocaleString()}` };
          })
          .catch((e) => {
            syncSubTasks.value[2].status = 'error';
            const hasCached = StorageService.getCachedItems().length > 0;
            const is503 = e instanceof Error && (e as { status?: number }).status === 503;
            if (!hasCached && !is503) throw e;
            syncProgress.value = 85;
          });
      }

      if (itemResult !== null) {
        StorageService.setCachedItems(itemResult.items);
        StorageService.setSyncTimestamp('items');
        StorageService.setCachedItemPrices(today, itemResult.priceMap);
        StorageService.applyPriceMapToItems(itemResult.priceMap);
      }

      // Phase 3 — contacts (85 → 100%). Non-critical: failure falls back to cached data
      // and surfaces a warning banner. Item families are fetched live by LoginPage/SplashPage.
      const [contactsResult] = await Promise.allSettled([
        ApiService.getContacts(SYNC_MS)
          .then((r) => { syncSubTasks.value[3].status = 'done'; return r; })
          .catch((e) => { syncSubTasks.value[3].status = 'error'; throw e; }),
      ]);

      const failedTasks = syncSubTasks.value
        .filter((t) => t.status === 'error')
        .map((t) => t.label);
      if (failedTasks.length) {
        const itemsFailed = itemResult === null;
        const hasCachedItems = StorageService.getCachedItems().length > 0;
        syncWarning.value = itemsFailed
          ? hasCachedItems
            ? `Item prices couldn't be refreshed — showing last synced prices.${failedTasks.length > 1 ? ` Also failed: ${failedTasks.filter((l) => l !== 'Items & Prices').join(', ')}.` : ''} Tap sync to retry.`
            : 'The server is still loading item prices. Please wait a moment and tap sync to retry.'
          : `Some data failed to load: ${failedTasks.join(', ')}. Please sync again when ready.`;
      }

      const contacts = contactsResult.status === 'fulfilled'
        ? contactsResult.value
        : StorageService.getCachedContacts();
      StorageService.setCachedContacts(contacts);

      // Re-apply credentials so login lookups always have the latest username/passwordHash.
      const authUser = authStore.user ?? StorageService.getAuth()?.user;
      if (authUser) {
        const patch: Record<string, string> = {};
        if (authUser.username)     patch['username']     = authUser.username;
        if (authUser.passwordHash) patch['passwordHash'] = authUser.passwordHash;
        if (Object.keys(patch).length) StorageService.patchContact(authUser.id, patch);
      }

      syncProgress.value = 100;
      lastSyncDate.value = new Date();
    } catch (err) {
      syncError.value = err instanceof Error ? err.message : 'Sync failed. Check your connection.';
    } finally {
      syncPhase.value = '';
      syncSubTasks.value = [];
      isSyncing.value = false;
    }
  }

  async function syncIfStale(maxAgeHours = 24): Promise<void> {
    if (!lastSyncDate.value) {
      await sync();
      return;
    }
    const ageMs = Date.now() - lastSyncDate.value.getTime();
    if (ageMs > maxAgeHours * 60 * 60 * 1000) {
      await sync();
    }
  }

  function clearSyncWarning(): void {
    syncWarning.value = null;
    syncError.value = null;
  }

  return {
    isSyncing,
    syncPhase,
    syncProgress,
    syncSubTasks,
    syncError,
    syncWarning,
    lastSyncDate,
    lastSyncLabel,
    syncItemsLoaded,
    syncItemsTotal,
    sync,
    syncIfStale,
    clearSyncWarning,
  };
}
