import { ref, watch, onUnmounted } from 'vue';
import type { Ref, ComputedRef } from 'vue';

export function useLoadingText(
  messages: string[],
  loading: Ref<boolean> | ComputedRef<boolean>,
  intervalMs = 2500,
): Ref<string> {
  const text = ref(messages[0] ?? '');
  let idx = 0;
  let timer: ReturnType<typeof setInterval> | null = null;

  function start() {
    idx = 0;
    text.value = messages[0] ?? '';
    timer = setInterval(() => {
      idx = (idx + 1) % messages.length;
      text.value = messages[idx] ?? '';
    }, intervalMs);
  }

  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  watch(loading as Ref<boolean>, (active) => {
    if (active) start();
    else stop();
  }, { immediate: true });

  onUnmounted(stop);

  return text;
}
