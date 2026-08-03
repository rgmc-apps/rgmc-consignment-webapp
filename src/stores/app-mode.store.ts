import { ref, computed } from 'vue';
import { StorageService } from '@/services/storage.service';

const MODE_KEY = 'rgmc_app_mode';
export type AppMode = 'online' | 'offline';

const mode = ref<AppMode>((localStorage.getItem(MODE_KEY) as AppMode | null) ?? 'offline');

const offlineReady = computed(
  () => StorageService.getCachedItems().length > 0 && StorageService.getCachedCustomers().length > 0,
);

export function useAppModeStore() {
  function setMode(m: AppMode) {
    mode.value = m;
    localStorage.setItem(MODE_KEY, m);
  }

  return { mode, offlineReady, setMode };
}
