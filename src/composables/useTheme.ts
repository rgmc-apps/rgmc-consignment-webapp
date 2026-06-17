import { ref } from 'vue';

export type Theme = 'minimalist' | 'light' | 'dark';

const STORAGE_KEY = 'rgmc_theme_v2';

function getStored(): Theme {
  try {
    const val = localStorage.getItem(STORAGE_KEY);
    if (val === 'light' || val === 'dark' || val === 'minimalist') return val;
  } catch { /* storage unavailable */ }
  return 'minimalist';
}

function applyTheme(t: Theme) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', t);
  const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (favicon) {
    favicon.href = t === 'minimalist' ? '/static/logo-bnw.png' : '/static/cons-logo.png';
  }
}

// Module-level singleton — shared across all components
const theme = ref<Theme>(getStored());
applyTheme(theme.value);

export function useTheme() {
  function setTheme(t: Theme) {
    theme.value = t;
    try { localStorage.setItem(STORAGE_KEY, t); }
    catch { /* storage unavailable */ }
    applyTheme(t);
  }

  return { theme, setTheme };
}
