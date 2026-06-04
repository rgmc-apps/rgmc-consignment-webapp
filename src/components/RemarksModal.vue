<template>
  <ion-modal :is-open="isOpen" @did-dismiss="onDismiss" class="remarks-modal">
    <div class="rm-sheet">

      <!-- Drag handle -->
      <div class="rm-handle" />

      <!-- Header: icon + titles -->
      <div class="rm-header">
        <div class="rm-header-icon" :class="`rm-header-icon--${type}`">
          <ion-icon :icon="type === 'sales' ? cartOutline : returnDownBackOutline" />
        </div>
        <div class="rm-header-text">
          <p class="rm-title">Add Remarks</p>
          <p class="rm-subtitle">{{ type === 'sales' ? 'Sales Orders' : 'Return Orders' }}</p>
        </div>
      </div>

      <!-- Remarks textarea -->
      <div class="rm-body">
        <label class="rm-label">
          Remarks
          <span class="rm-optional">Optional</span>
        </label>
        <textarea
          ref="textareaRef"
          v-model="remarks"
          class="rm-textarea"
          placeholder="Add any notes for this submission…"
          maxlength="250"
          rows="4"
        />
        <p class="rm-char-count">{{ remarks.length }}&thinsp;/&thinsp;250</p>
      </div>

      <!-- Action row -->
      <div class="rm-actions">
        <button class="rm-btn rm-btn--cancel" @click="emit('cancel')">Cancel</button>
        <button class="rm-btn rm-btn--submit" :class="`rm-btn--${type}`" @click="onConfirm">
          <ion-icon :icon="sendOutline" />
          Submit
        </button>
      </div>

      <div class="rm-safe-bottom" />
    </div>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { IonModal, IonIcon } from '@ionic/vue';
import { cartOutline, returnDownBackOutline, sendOutline } from 'ionicons/icons';

const props = defineProps<{
  isOpen: boolean;
  type: 'sales' | 'returns';
}>();

const emit = defineEmits<{
  confirm: [remarks: string];
  cancel: [];
}>();

const remarks = ref('');
const textareaRef = ref<HTMLTextAreaElement | null>(null);

watch(() => props.isOpen, (open) => {
  if (open) {
    remarks.value = '';
    nextTick(() => textareaRef.value?.focus());
  }
});

function onConfirm() {
  emit('confirm', remarks.value.trim());
}

function onDismiss() {
  emit('cancel');
}
</script>

<style scoped>
.rm-sheet {
  background: var(--app-dark, #1c1c1e);
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding: 0 20px 20px;
}

/* ── Drag handle ─────────────────────────────────────────────────────────── */
.rm-handle {
  width: 36px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.18);
  margin: 12px auto 22px;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.rm-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 22px;
}

.rm-header-icon {
  width: 46px;
  height: 46px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  flex-shrink: 0;
}

.rm-header-icon--sales {
  background: rgba(var(--ion-color-primary-rgb), 0.14);
  color: var(--ion-color-primary);
}

.rm-header-icon--returns {
  background: rgba(var(--ion-color-danger-rgb), 0.14);
  color: var(--ion-color-danger);
}

.rm-header-text { display: flex; flex-direction: column; gap: 2px; }

.rm-title {
  font-size: 18px;
  font-weight: 800;
  color: var(--app-fg, #fff);
  margin: 0;
  letter-spacing: -0.3px;
}

.rm-subtitle {
  font-size: 13px;
  color: var(--app-text-muted, rgba(255,255,255,0.45));
  margin: 0;
}

/* ── Body / textarea ─────────────────────────────────────────────────────── */
.rm-body { margin-bottom: 20px; }

.rm-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--app-text-muted, rgba(255,255,255,0.45));
  margin-bottom: 8px;
}

.rm-optional {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  color: rgba(160, 115, 32, 0.8);
  background: rgba(160, 115, 32, 0.1);
  border: 1px solid rgba(160, 115, 32, 0.22);
  border-radius: 8px;
  padding: 1px 6px;
}

.rm-textarea {
  width: 100%;
  background: var(--app-surface, rgba(255, 255, 255, 0.05));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: var(--app-fg, #fff);
  font-size: 15px;
  line-height: 1.55;
  padding: 12px 14px;
  resize: none;
  box-sizing: border-box;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  display: block;
}

.rm-textarea::placeholder { color: rgba(255, 255, 255, 0.22); }

.rm-textarea:focus {
  border-color: rgba(160, 115, 32, 0.5);
  box-shadow: 0 0 0 3px rgba(160, 115, 32, 0.08);
}

.rm-char-count {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.22);
  text-align: right;
  margin: 5px 0 0;
}

/* ── Action row ──────────────────────────────────────────────────────────── */
.rm-actions {
  display: flex;
  gap: 10px;
}

.rm-btn {
  flex: 1;
  height: 50px;
  border-radius: 12px;
  border: none;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  transition: all 0.2s;
  -webkit-appearance: none;
  appearance: none;
  outline: none;
}

.rm-btn:active { transform: scale(0.97); }

.rm-btn--cancel {
  flex: 0.65;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.5);
}

.rm-btn--cancel:hover {
  background: rgba(255, 255, 255, 0.09);
  color: rgba(255, 255, 255, 0.75);
}

.rm-btn--submit { color: #fff; }
.rm-btn--submit ion-icon { font-size: 17px; }

.rm-btn--submit.rm-btn--sales   { background: var(--ion-color-primary);  }
.rm-btn--submit.rm-btn--returns { background: var(--ion-color-danger);   }

.rm-safe-bottom { height: max(16px, env(safe-area-inset-bottom)); }
</style>

<!-- Bottom-sheet positioning — sheet anchors to the bottom of the screen -->
<style>
.remarks-modal {
  --width: 100%;
  --height: auto;
  --max-height: 80dvh;
  --border-radius: 24px 24px 0 0;
  --backdrop-opacity: 0.5;
  align-items: flex-end;
}
</style>
