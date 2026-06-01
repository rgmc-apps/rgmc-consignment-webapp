import { ref } from 'vue';

const headerPulseActive = ref(false);
const submitFlashActive = ref(false);
const sweepActive = ref(false);

export function useGoldAccent() {
  function triggerHeaderPulse() {
    headerPulseActive.value = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      headerPulseActive.value = true;
      setTimeout(() => { headerPulseActive.value = false; }, 2000);
    }));
  }

  function triggerSubmitFlash() {
    submitFlashActive.value = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      submitFlashActive.value = true;
      setTimeout(() => { submitFlashActive.value = false; }, 1100);
    }));
  }

  function triggerSweep() {
    sweepActive.value = false;
    requestAnimationFrame(() => requestAnimationFrame(() => {
      sweepActive.value = true;
      setTimeout(() => { sweepActive.value = false; }, 1200);
    }));
  }

  return {
    headerPulseActive,
    submitFlashActive,
    sweepActive,
    triggerHeaderPulse,
    triggerSubmitFlash,
    triggerSweep,
  };
}
