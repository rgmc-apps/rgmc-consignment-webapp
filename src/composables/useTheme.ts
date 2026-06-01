import { ref } from 'vue';

const STORAGE_KEY = 'rgmc_theme';

function getStored(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === 'dark'; }
  catch { return false; }
}

// Module-level singleton — shared across all components
const isDark = ref(getStored());

// Apply immediately at module load to prevent flash-of-wrong-theme
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
}

export function useTheme() {
  function toggleTheme() {
    isDark.value = !isDark.value;
    try { localStorage.setItem(STORAGE_KEY, isDark.value ? 'dark' : 'light'); }
    catch { /* storage unavailable */ }
    document.documentElement.setAttribute('data-theme', isDark.value ? 'dark' : 'light');
  }

  return { isDark, toggleTheme };
}
