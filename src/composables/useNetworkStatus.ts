import { ref, onMounted, onUnmounted } from 'vue';

interface NetworkInformation extends EventTarget {
  effectiveType: 'slow-2g' | '2g' | '3g' | '4g';
}

export function useNetworkStatus() {
  const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const isSlowConnection = ref(false);

  function checkQuality() {
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (!conn) return;
    isSlowConnection.value = conn.effectiveType === 'slow-2g' || conn.effectiveType === '2g';
  }

  function handleOnline()  { isOnline.value = true; }
  function handleOffline() { isOnline.value = false; }
  function handleChange()  { checkQuality(); }

  onMounted(() => {
    window.addEventListener('online',  handleOnline);
    window.addEventListener('offline', handleOffline);
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (conn) conn.addEventListener('change', handleChange);
    checkQuality();
  });

  onUnmounted(() => {
    window.removeEventListener('online',  handleOnline);
    window.removeEventListener('offline', handleOffline);
    const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
    if (conn) conn.removeEventListener('change', handleChange);
  });

  return { isOnline, isSlowConnection };
}
