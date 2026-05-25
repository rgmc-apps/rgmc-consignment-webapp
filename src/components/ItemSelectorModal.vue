<template>
  <ion-modal :is-open="true" @did-dismiss="$emit('close')">
    <ion-page>
      <!-- ── Header ── -->
      <ion-header>
        <ion-toolbar>
          <ion-buttons slot="start">
            <ion-button fill="clear" @click="$emit('close')">
              <ion-icon :icon="closeOutline" slot="icon-only" />
            </ion-button>
          </ion-buttons>
          <ion-title>{{ viewMode === 'scanner' ? 'Scan Barcode' : 'Select Item' }}</ion-title>
          <ion-buttons slot="end">
            <ion-button
              v-if="viewMode === 'list'"
              fill="clear"
              @click="openScanner"
              :disabled="!cameraAvailable"
            >
              <ion-icon :icon="barcodeOutline" slot="icon-only" />
            </ion-button>
            <ion-button v-if="viewMode === 'scanner'" fill="clear" @click="closeScanner">
              <ion-icon :icon="listOutline" slot="icon-only" />
            </ion-button>
          </ion-buttons>
        </ion-toolbar>

        <!-- Search bar — list mode only -->
        <ion-toolbar v-if="viewMode === 'list'">
          <ion-searchbar
            v-model="searchQuery"
            placeholder="Search name, code, description…"
            :debounce="220"
            :show-clear-button="'focus'"
          />
        </ion-toolbar>
      </ion-header>

      <ion-content>
        <!-- ══════════════ LIST MODE ══════════════ -->
        <template v-if="viewMode === 'list'">
          <!-- Category chips -->
          <div class="category-scroll">
            <ion-chip
              :color="!selectedCat ? 'primary' : 'medium'"
              @click="selectedCat = ''"
              class="cat-chip"
            >All</ion-chip>
            <ion-chip
              v-for="cat in categories"
              :key="cat.code"
              :color="selectedCat === cat.code ? 'primary' : 'medium'"
              @click="selectedCat = cat.code"
              class="cat-chip"
            >{{ cat.code }}</ion-chip>
          </div>

          <!-- Barcode not-found banner -->
          <div v-if="barcodeNotFound" class="barcode-miss">
            <ion-icon :icon="alertCircleOutline" color="warning" />
            <span>No item found for barcode <strong>{{ lastScannedBarcode }}</strong>. Showing search results.</span>
          </div>

          <!-- Results header -->
          <p class="results-label">
            {{ displayItems.length }} of {{ filteredItems.length }} items
            <span v-if="filteredItems.length > DISPLAY_LIMIT" class="more-hint">
              — refine your search to see more
            </span>
          </p>

          <!-- Item list -->
          <ion-list v-if="displayItems.length" lines="full" class="item-list">
            <ion-item
              v-for="item in displayItems"
              :key="item.id"
              button
              :detail="false"
              @click="handleSelect(item)"
            >
              <ion-label>
                <h3>{{ item.displayName }}</h3>
                <p>{{ item.number }} &bull; {{ item.itemCategoryCode }}</p>
                <p v-if="item.description && item.description !== item.displayName" class="item-desc">
                  {{ item.description }}
                </p>
              </ion-label>
              <ion-note slot="end" color="dark" class="item-price">
                {{ formatCurrency(item.unitPrice) }}
              </ion-note>
            </ion-item>
          </ion-list>

          <div v-else class="empty-results">
            <ion-icon :icon="searchOutline" />
            <p>No items found.<br />Try a different search term or category.</p>
          </div>
        </template>

        <!-- ══════════════ SCANNER MODE ══════════════ -->
        <template v-if="viewMode === 'scanner'">
          <div class="scanner-wrap">
            <!-- Video feed -->
            <video
              ref="videoEl"
              autoplay
              playsinline
              muted
              class="scanner-video"
            />

            <!-- Scan target overlay -->
            <div class="scanner-ui">
              <div class="scanner-frame">
                <div class="corner tl" />
                <div class="corner tr" />
                <div class="corner bl" />
                <div class="corner br" />
                <div v-if="scanStatus === 'scanning'" class="scan-line" />
              </div>
              <p class="scan-hint" :class="`scan-hint--${scanStatus}`">
                {{ scanHintText }}
              </p>
            </div>

            <!-- Manual input fallback -->
            <div class="manual-wrap">
              <p class="manual-label">Or enter barcode manually:</p>
              <div class="manual-row">
                <ion-input
                  v-model="manualBarcode"
                  placeholder="Item number / barcode"
                  class="manual-input"
                  @keyup.enter="submitManual"
                />
                <ion-button size="default" @click="submitManual">
                  <ion-icon :icon="searchOutline" slot="icon-only" />
                </ion-button>
              </div>
            </div>
          </div>
        </template>
      </ion-content>
    </ion-page>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue';
import {
  IonModal,
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonContent,
  IonSearchbar,
  IonList,
  IonItem,
  IonLabel,
  IonNote,
  IonChip,
  IonInput,
} from '@ionic/vue';
import {
  closeOutline,
  barcodeOutline,
  listOutline,
  searchOutline,
  alertCircleOutline,
} from 'ionicons/icons';
import { formatCurrency } from '@/utils/format';
import type { Item, ItemCategory } from '@/types';

const DISPLAY_LIMIT = 100;

const props = defineProps<{
  items: Item[];
  categories: ItemCategory[];
  initialCategoryCode?: string;
}>();

const emit = defineEmits<{
  select: [item: Item];
  close: [];
}>();

/* ─── List state ─── */
const searchQuery = ref('');
const selectedCat = ref(props.initialCategoryCode ?? '');
const barcodeNotFound = ref(false);
const lastScannedBarcode = ref('');

const filteredItems = computed(() => {
  let src = props.items;
  if (selectedCat.value) {
    src = src.filter((i) => i.itemCategoryCode === selectedCat.value);
  }
  const q = searchQuery.value.trim().toUpperCase();
  if (q) {
    src = src.filter(
      (i) =>
        i.displayName.toUpperCase().includes(q) ||
        i.number.toUpperCase().includes(q) ||
        (i.description ?? '').toUpperCase().includes(q),
    );
  }
  return src;
});

const displayItems = computed(() => filteredItems.value.slice(0, DISPLAY_LIMIT));

watch(
  () => props.initialCategoryCode,
  (v) => { if (v) selectedCat.value = v; },
);

function handleSelect(item: Item) {
  emit('select', item);
}

/* ─── Scanner state ─── */
type ViewMode = 'list' | 'scanner';
type ScanStatus = 'starting' | 'scanning' | 'detected' | 'error';

const viewMode = ref<ViewMode>('list');
const videoEl = ref<HTMLVideoElement | null>(null);
const videoStream = ref<MediaStream | null>(null);
const scanStatus = ref<ScanStatus>('starting');
const manualBarcode = ref('');
const cameraAvailable = ref('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices);
let detectionInterval: ReturnType<typeof setInterval> | null = null;

const scanHintText = computed(() => {
  switch (scanStatus.value) {
    case 'starting': return 'Starting camera…';
    case 'scanning': return 'Point camera at barcode';
    case 'detected': return 'Barcode detected!';
    case 'error': return 'Camera unavailable — use manual input';
    default: return '';
  }
});

async function openScanner() {
  viewMode.value = 'scanner';
  barcodeNotFound.value = false;
  manualBarcode.value = '';
  scanStatus.value = 'starting';

  await new Promise((r) => setTimeout(r, 80)); // let DOM render video element

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    });
    videoStream.value = stream;
    if (videoEl.value) {
      videoEl.value.srcObject = stream;
      await videoEl.value.play();
    }
    scanStatus.value = 'scanning';
    if ('BarcodeDetector' in window) {
      startAutoDetection();
    }
  } catch {
    scanStatus.value = 'error';
  }
}

function startAutoDetection() {
  const detector = new (window as unknown as { BarcodeDetector: new (opts: object) => { detect: (el: HTMLVideoElement) => Promise<Array<{ rawValue: string }>> } }).BarcodeDetector({
    formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
  });

  detectionInterval = setInterval(async () => {
    if (!videoEl.value || scanStatus.value === 'detected') return;
    try {
      const results = await detector.detect(videoEl.value);
      if (results.length > 0) {
        const code = results[0].rawValue;
        scanStatus.value = 'detected';
        stopCamera();
        setTimeout(() => resolveBarcode(code), 250);
      }
    } catch {
      /* per-frame errors are normal when video isn't ready */
    }
  }, 250);
}

function closeScanner() {
  stopCamera();
  viewMode.value = 'list';
}

function stopCamera() {
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
  videoStream.value?.getTracks().forEach((t) => t.stop());
  videoStream.value = null;
}

function submitManual() {
  const code = manualBarcode.value.trim();
  if (!code) return;
  stopCamera();
  resolveBarcode(code);
}

function resolveBarcode(code: string) {
  /* Try to find exact item number match first, then partial */
  const exactMatch = props.items.find(
    (i) => i.number.toUpperCase() === code.toUpperCase(),
  );
  if (exactMatch) {
    emit('select', exactMatch);
    return;
  }
  const partialMatch = props.items.find(
    (i) => i.number.toUpperCase().includes(code.toUpperCase()) || code.toUpperCase().includes(i.number.toUpperCase()),
  );
  if (partialMatch) {
    emit('select', partialMatch);
    return;
  }
  /* No match — switch to list mode with barcode as search query */
  lastScannedBarcode.value = code;
  searchQuery.value = code;
  barcodeNotFound.value = true;
  viewMode.value = 'list';
}

onUnmounted(() => stopCamera());
</script>

<style scoped>
/* ── Category chips ── */
.category-scroll {
  display: flex;
  flex-wrap: nowrap;
  overflow-x: auto;
  gap: 6px;
  padding: 10px 12px;
  scrollbar-width: none;
}
.category-scroll::-webkit-scrollbar { display: none; }

.cat-chip {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  height: 28px;
  margin: 0;
}

/* ── Barcode miss banner ── */
.barcode-miss {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: #fff8e1;
  border-bottom: 1px solid #ffe082;
  font-size: 13px;
  color: #555;
}

/* ── Results label ── */
.results-label {
  padding: 4px 16px;
  font-size: 11px;
  color: var(--app-text-muted);
  margin: 0;
}
.more-hint { color: var(--ion-color-warning); }

/* ── Item list ── */
.item-list { background: var(--app-surface); }

.item-desc {
  color: var(--app-text-muted);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-price {
  font-size: 14px;
  font-weight: 700;
}

/* ── Empty state ── */
.empty-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
  gap: 12px;
  text-align: center;
  color: var(--app-text-muted);
}
.empty-results ion-icon { font-size: 48px; }
.empty-results p { font-size: 14px; line-height: 1.6; margin: 0; }

/* ── Scanner ── */
.scanner-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #000;
}

.scanner-video {
  width: 100%;
  flex: 1;
  object-fit: cover;
  min-height: 260px;
}

.scanner-ui {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.scanner-frame {
  width: 280px;
  height: 160px;
  position: relative;
  overflow: hidden;
}

.corner {
  position: absolute;
  width: 24px;
  height: 24px;
  border-color: var(--app-gold);
  border-style: solid;
}
.tl { top: 0; left: 0; border-width: 3px 0 0 3px; }
.tr { top: 0; right: 0; border-width: 3px 3px 0 0; }
.bl { bottom: 0; left: 0; border-width: 0 0 3px 3px; }
.br { bottom: 0; right: 0; border-width: 0 3px 3px 0; }

.scan-line {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(160, 115, 32, 0.85);
  animation: scan-sweep 1.8s ease-in-out infinite;
}

@keyframes scan-sweep {
  0%   { top: 0; }
  50%  { top: calc(100% - 2px); }
  100% { top: 0; }
}

.scan-hint {
  margin-top: 16px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.3px;
  pointer-events: none;
}
.scan-hint--scanning  { color: rgba(255,255,255,0.85); }
.scan-hint--starting  { color: rgba(255,255,255,0.6); }
.scan-hint--detected  { color: var(--ion-color-success); }
.scan-hint--error     { color: var(--ion-color-danger); }

/* ── Manual input ── */
.manual-wrap {
  background: #111;
  padding: 16px;
  flex-shrink: 0;
}
.manual-label {
  font-size: 12px;
  color: #888;
  margin: 0 0 8px;
}
.manual-row {
  display: flex;
  gap: 8px;
  align-items: center;
}
.manual-input {
  flex: 1;
  --background: #222;
  --color: #fff;
  --placeholder-color: #666;
  --border-radius: 8px;
  border: 1px solid #333;
  border-radius: 8px;
}
</style>
