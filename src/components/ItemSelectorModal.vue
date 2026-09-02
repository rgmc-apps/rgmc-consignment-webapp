<template>
  <ion-modal :is-open="true" @did-dismiss="$emit('close')">
    <ion-page :class="{ 'item-selector--minimalist': isMinimalist }">
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
              v-for="cat in effectiveCategories"
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

          <!-- Online mode: item loading state -->
          <Transition name="price-bar-fade">
            <div v-if="isLoadingOnline" class="price-fetch-bar">
              <ion-spinner name="dots" class="price-fetch-spinner" />
              <span>{{ onlineItems.length > 0 ? 'Refreshing items…' : 'Loading items from server…' }}</span>
            </div>
          </Transition>

          <!-- Price-fetch bar -->
          <Transition name="price-bar-fade">
            <div v-if="isFetchingPrices" class="price-fetch-bar">
              <ion-spinner name="dots" class="price-fetch-spinner" />
              <span>Updating prices for {{ lookupDate }}…</span>
            </div>
          </Transition>

          <!-- Results header -->
          <p class="results-label">
            <template v-if="totalPages > 1">
              {{ (currentPage - 1) * PAGE_SIZE + 1 }}–{{ Math.min(currentPage * PAGE_SIZE, filteredItems.length) }}
              of {{ filteredItems.length }} items
            </template>
            <template v-else>{{ filteredItems.length }} items</template>
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
                <span
                  v-if="isFetchingPrices && livePrices[item.number] === undefined"
                  class="price-skeleton"
                />
                <template v-else>{{ formatCurrency(livePrices[item.number] ?? item.unitPriceIncVAT) }}</template>
              </ion-note>
            </ion-item>
          </ion-list>

          <!-- Pagination controls -->
          <div v-if="totalPages > 1" class="pagination-bar">
            <ion-button
              fill="clear"
              size="small"
              :disabled="currentPage <= 1"
              @click="currentPage--"
            >
              <ion-icon :icon="chevronBackOutline" slot="icon-only" />
            </ion-button>
            <span class="pagination-label">{{ currentPage }} / {{ totalPages }}</span>
            <ion-button
              fill="clear"
              size="small"
              :disabled="currentPage >= totalPages"
              @click="currentPage++"
            >
              <ion-icon :icon="chevronForwardOutline" slot="icon-only" />
            </ion-button>
          </div>

          <!-- BC search results — shown when a BC lookup returned items not already in local results -->
          <div v-if="dedupedBcResults.length" class="bc-results-wrap">
            <div class="bc-results-header">
              <ion-icon :icon="cloudDownloadOutline" class="bc-hdr-icon" />
              <span class="bc-hdr-label">Business Central results for "{{ bcSearchedQuery }}"</span>
              <ion-button fill="clear" size="small" class="bc-hdr-clear" @click="clearBcResults">
                <ion-icon :icon="closeOutline" slot="icon-only" />
              </ion-button>
            </div>
            <ion-list lines="full" class="item-list">
              <ion-item
                v-for="item in dedupedBcResults"
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
                  {{ formatCurrency(item.unitPriceIncVAT) }}
                </ion-note>
              </ion-item>
            </ion-list>
          </div>

          <!-- Empty state — only when no local results and no BC results -->
          <div v-if="!displayItems.length && !dedupedBcResults.length" class="empty-results">
            <ion-icon :icon="searchOutline" />
            <p v-if="!searchQuery.trim()">No items found.<br />Try a different search term or category.</p>
            <p v-else>No local items match "{{ searchQuery }}".</p>
          </div>

          <!-- BC search — always available when a query is typed and online -->
          <div v-if="searchQuery.trim() && props.isOnline" class="bc-search-area">
            <p class="bc-search-hint">
              {{ displayItems.length || dedupedBcResults.length ? 'Not finding it? Search Business Central directly:' : 'Not in local cache? Search Business Central directly:' }}
            </p>
            <ion-button
              v-if="!isBcSearching"
              expand="block"
              fill="outline"
              color="primary"
              class="bc-search-btn"
              @click="searchInBC"
            >
              <ion-icon :icon="cloudDownloadOutline" slot="start" />
              {{ bcSearchedQuery ? 'Search BC Again' : 'Search Business Central' }}
            </ion-button>
            <div v-else class="bc-searching">
              <ion-spinner name="dots" class="bc-spinner" />
              <span>Searching Business Central…</span>
            </div>
            <p v-if="bcSearchedQuery && !isBcSearching && !bcSearchError && !bcSearchResults.length" class="bc-no-results">
              No results found in Business Central for "{{ bcSearchedQuery }}".
            </p>
            <p v-if="bcSearchError" class="bc-search-error">{{ bcSearchError }}</p>
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

            <!-- Single barcode confirmation -->
            <div v-if="scanStatus === 'confirm'" class="single-confirm">
              <div class="single-confirm-header">
                <ion-icon :icon="checkmarkCircleOutline" class="single-confirm-icon" />
                <p class="single-confirm-title">Barcode detected</p>
              </div>
              <p class="single-confirm-value">{{ confirmedBarcode }}</p>
              <ion-button expand="block" color="primary" class="single-confirm-btn" @click="acceptBarcode">
                Use This Barcode
              </ion-button>
              <button class="multi-rescan-btn" @click="resumeScanning">
                <ion-icon :icon="refreshOutline" />
                Scan Again
              </button>
            </div>

            <!-- Multi-barcode picker (appears when >1 barcodes are in frame) -->
            <div v-if="scanStatus === 'multiple'" class="multi-picker">
              <p class="multi-picker-title">Multiple barcodes detected</p>
              <p class="multi-picker-sub">Code 128 listed first — tap one to use it:</p>
              <button
                v-for="(b, idx) in detectedBarcodes"
                :key="idx"
                class="multi-bc-btn"
                :class="{ 'multi-bc-btn--priority': b.format === 'code_128' }"
                @click="pickBarcode(b.rawValue)"
              >
                <span class="multi-bc-format">{{ formatLabel(b.format) }}</span>
                <span class="multi-bc-value">{{ b.rawValue }}</span>
              </button>
              <button class="multi-rescan-btn" @click="resumeScanning">
                <ion-icon :icon="refreshOutline" />
                Scan Again
              </button>
            </div>

            <!-- Not found in cache (online) — BC search prompt -->
            <div v-if="scanStatus === 'not-found'" class="not-found-wrap">
              <div class="not-found-header">
                <ion-icon :icon="alertCircleOutline" class="not-found-icon" />
                <p class="not-found-title">Item not in local cache</p>
              </div>
              <p class="not-found-code">{{ lastScannedBarcode }}</p>
              <ion-button
                expand="block"
                color="primary"
                class="not-found-bc-btn"
                :disabled="isBcSearching"
                @click="searchScannedInBC"
              >
                <ion-spinner v-if="isBcSearching" name="dots" slot="start" class="bc-spinner" />
                <ion-icon v-else :icon="cloudDownloadOutline" slot="start" />
                {{ isBcSearching ? 'Searching…' : 'Search Business Central' }}
              </ion-button>
              <button class="multi-rescan-btn" @click="resumeScanning">
                <ion-icon :icon="refreshOutline" />
                Scan Again
              </button>
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
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
  IonSpinner,
} from '@ionic/vue';
import {
  closeOutline,
  barcodeOutline,
  listOutline,
  searchOutline,
  alertCircleOutline,
  refreshOutline,
  checkmarkCircleOutline,
  chevronBackOutline,
  chevronForwardOutline,
  cloudDownloadOutline,
} from 'ionicons/icons';
import { ApiService } from '@/services/api.service';
import { StorageService } from '@/services/storage.service';
import { formatCurrency } from '@/utils/format';
import { useTheme } from '@/composables/useTheme';
import { useAuthStore } from '@/stores/auth.store';
import type { Item, ItemCategory } from '@/types';

const { theme } = useTheme();
const isMinimalist = computed(() => theme.value === 'minimalist');
const authStore = useAuthStore();

const PAGE_SIZE = 100;
const currentPage = ref(1);

const onlineItems = ref<Item[]>([]);
const isLoadingOnline = ref(false);

const props = defineProps<{
  items: Item[];
  categories: ItemCategory[];
  initialCategoryCode?: string;
  isOnline?: boolean;
  onDate?: string;
  familyCode?: string;
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

// Cache-first: use props.items when available; fall back to API-fetched onlineItems for first use.
const effectiveItems = computed(() => props.items.length > 0 ? props.items : onlineItems.value);

const effectiveCategories = computed<ItemCategory[]>(() => {
  if (props.categories.length > 0) return props.categories;
  if (onlineItems.value.length > 0) {
    const seen = new Set<string>();
    return onlineItems.value
      .filter((i) => i.itemCategoryCode && !seen.has(i.itemCategoryCode) && seen.add(i.itemCategoryCode))
      .map((i) => ({ id: i.itemCategoryCode, code: i.itemCategoryCode, displayName: i.itemCategoryCode, lastModifiedDateTime: '' }));
  }
  return [];
});

const filteredItems = computed(() => {
  let src = effectiveItems.value;
  if (selectedCat.value) {
    src = src.filter((i) => i.itemCategoryCode === selectedCat.value);
  }
  const q = searchQuery.value.trim().toUpperCase();
  if (q) {
    src = src.filter(
      (i) =>
        (i.displayName ?? '').toUpperCase().includes(q) ||
        (i.number ?? '').toUpperCase().includes(q) ||
        (i.description ?? '').toUpperCase().includes(q),
    );
  }
  return src;
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredItems.value.length / PAGE_SIZE)));

const displayItems = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredItems.value.slice(start, start + PAGE_SIZE);
});

// Reset to page 1 whenever the filtered set changes
watch([searchQuery, selectedCat], () => { currentPage.value = 1; });

/* ─── Live prices ─── */
// Keyed by item.number; seeded from the sync price-map, then filled on-demand.
const livePrices = ref<Record<string, number>>({});
const isFetchingPrices = ref(false);

const lookupDate = computed(() => props.onDate ?? new Date().toISOString().split('T')[0]);

onMounted(async () => {
  if (props.items.length > 0) {
    // Seed from whatever cached prices exist — date match not required.
    // fetchMissingPrices will only hit the network for items with no price at all.
    const cached = StorageService.getCachedItemPrices();
    if (cached?.prices) {
      livePrices.value = { ...cached.prices };
    }
    if (priceTimer) clearTimeout(priceTimer);
    priceTimer = setTimeout(() => fetchMissingPrices(displayItems.value), 100);
    return;
  }

  // No local cache yet — fetch from API (first-use path).
  isLoadingOnline.value = true;
  try {
    const result = await ApiService.getItemsPage(lookupDate.value, props.familyCode);
    onlineItems.value = result.items;
    livePrices.value = result.priceMap;

    // Persist so a full sync can pick these up (and so re-opens are instant).
    // Pass familyCode so setCachedItems uses the brand-isolated path and keeps other brands intact.
    StorageService.setCachedItems(result.items, props.familyCode || undefined);

    const existingPrices = StorageService.getCachedItemPrices();
    StorageService.setCachedItemPrices(
      lookupDate.value,
      existingPrices?.date === lookupDate.value
        ? { ...existingPrices.prices, ...result.priceMap }
        : result.priceMap,
    );
  } catch {
    // Nothing to show — caller (ScanningPage) will surface an error state.
  } finally {
    isLoadingOnline.value = false;
  }
});

let priceTimer: ReturnType<typeof setTimeout> | null = null;

async function fetchMissingPrices(items: typeof displayItems.value) {
  if (!props.isOnline) return;
  const missing = items.filter((i) => livePrices.value[i.number] === undefined);
  if (!missing.length) return;
  isFetchingPrices.value = true;
  try {
    const { priceMap } = await ApiService.getAllItemPricesForDate(
      lookupDate.value,
      missing.map((i) => i.number),
      undefined,
      undefined,
      props.familyCode,
    );
    for (const item of missing) {
      const price = priceMap[item.number] ?? null;
      if (price !== null) {
        livePrices.value[item.number] = price;
        StorageService.patchCachedItemPrice(item.number, price);
      }
    }
  } finally {
    isFetchingPrices.value = false;
  }
}

watch(displayItems, (items) => {
  if (priceTimer) clearTimeout(priceTimer);
  priceTimer = setTimeout(() => fetchMissingPrices(items), 300);
});

watch(lookupDate, (newDate) => {
  const cached = StorageService.getCachedItemPrices();
  // Only seed from cache when the cached date matches the new lookup date.
  // A date mismatch means prices are stale — wipe so fetchMissingPrices re-fetches all.
  livePrices.value = cached?.date === newDate && cached.prices ? { ...cached.prices } : {};
  if (priceTimer) clearTimeout(priceTimer);
  priceTimer = setTimeout(() => fetchMissingPrices(displayItems.value), 300);
});

function handleSelect(item: Item) {
  emit('select', item);
}

/* ─── Business Central search ─── */
const bcSearchResults = ref<Item[]>([]);
const isBcSearching = ref(false);
const bcSearchError = ref('');
const bcSearchedQuery = ref('');
let _bcSearchId = 0;

// Exclude items already visible in local results so BC results don't repeat them.
const dedupedBcResults = computed(() => {
  if (!bcSearchResults.value.length) return [];
  const localNos = new Set(filteredItems.value.map((i) => i.number));
  return bcSearchResults.value.filter((i) => !localNos.has(i.number));
});

// Sync category filter from parent — but not while BC results are showing, because
// the parent updates initialCategoryCode when an item is selected, which would
// change selectedCat and immediately wipe the BC results the user is still browsing.
watch(
  () => props.initialCategoryCode,
  (v) => { if (v && !bcSearchResults.value.length) selectedCat.value = v; },
);

// Clear BC results whenever the local search query or category changes
watch([searchQuery, selectedCat], () => {
  clearBcResults();
});

// Auto-trigger BC search when the scanner finds no local match
watch(barcodeNotFound, (found) => {
  if (found && props.isOnline && searchQuery.value.trim()) {
    searchInBC();
  }
});

async function searchInBC() {
  const q = searchQuery.value.trim();
  if (!q || !props.isOnline) return;
  const id = ++_bcSearchId;
  isBcSearching.value = true;
  bcSearchError.value = '';
  bcSearchedQuery.value = q;
  try {
    const results = await ApiService.searchItemsByNumber(q, lookupDate.value, props.familyCode);
    if (id !== _bcSearchId) return;
    bcSearchResults.value = results;
    for (const item of results) {
      if (item.unitPriceIncVAT) livePrices.value[item.number] = item.unitPriceIncVAT;
    }
    if (results.length) {
      StorageService.mergeCachedItems(results, props.familyCode || undefined);
      const priceMap: Record<string, number> = {};
      for (const item of results) {
        if (item.unitPriceIncVAT) priceMap[item.number] = item.unitPriceIncVAT;
      }
      if (Object.keys(priceMap).length) {
        const existing = StorageService.getCachedItemPrices();
        StorageService.setCachedItemPrices(lookupDate.value, { ...(existing?.prices ?? {}), ...priceMap });
        StorageService.applyPriceMapToItems(priceMap, props.familyCode || undefined);
      }
    }
  } catch {
    if (id !== _bcSearchId) return;
    bcSearchError.value = 'Failed to search Business Central. Please try again.';
  } finally {
    if (id === _bcSearchId) isBcSearching.value = false;
  }
}

function clearBcResults() {
  _bcSearchId++;
  bcSearchResults.value = [];
  bcSearchError.value = '';
  bcSearchedQuery.value = '';
  isBcSearching.value = false;
}

/* ─── Scanner state ─── */
type ViewMode = 'list' | 'scanner';
type ScanStatus = 'starting' | 'scanning' | 'detected' | 'error' | 'multiple' | 'confirm' | 'not-found';

interface DetectedBarcode { rawValue: string; format: string; }

const FORMAT_PRIORITY: Record<string, number> = {
  code_128: 0, code_39: 1, ean_13: 2, ean_8: 3, upc_a: 4, upc_e: 5, qr_code: 6,
};
const FORMAT_LABELS: Record<string, string> = {
  code_128: 'Code 128', code_39: 'Code 39', ean_13: 'EAN-13',
  ean_8: 'EAN-8', upc_a: 'UPC-A', upc_e: 'UPC-E', qr_code: 'QR Code',
};
function formatLabel(fmt: string) { return FORMAT_LABELS[fmt] ?? fmt; }

const viewMode = ref<ViewMode>('list');
const videoEl = ref<HTMLVideoElement | null>(null);
const videoStream = ref<MediaStream | null>(null);
const scanStatus = ref<ScanStatus>('starting');
const manualBarcode = ref('');
const detectedBarcodes = ref<DetectedBarcode[]>([]);
const confirmedBarcode = ref('');
const cameraAvailable = ref('mediaDevices' in navigator && 'getUserMedia' in navigator.mediaDevices);
let detectionInterval: ReturnType<typeof setInterval> | null = null;
let audioCtx: AudioContext | null = null;

const scanHintText = computed(() => {
  switch (scanStatus.value) {
    case 'starting':  return 'Starting camera…';
    case 'scanning':  return 'Point camera at barcode';
    case 'detected':  return 'Barcode detected!';
    case 'confirm':   return 'Barcode detected — confirm to use it';
    case 'multiple':   return 'Multiple barcodes found — select one below';
    case 'not-found':  return 'Item not found in local cache';
    case 'error':      return 'Camera unavailable — use manual input';
    default: return '';
  }
});

async function openScanner() {
  viewMode.value = 'scanner';
  barcodeNotFound.value = false;
  manualBarcode.value = '';
  scanStatus.value = 'starting';

  // Unlock AudioContext while still in the tap gesture — required by iOS Safari
  try {
    audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch { audioCtx = null; }

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

function beepAndHaptic() {
  navigator.vibrate?.(60);
  if (!audioCtx) return;
  try {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.type = 'square';
    osc.frequency.setValueAtTime(1800, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.25, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    osc.start(audioCtx.currentTime);
    osc.stop(audioCtx.currentTime + 0.08);
  } catch { /* ignore */ }
}

function startAutoDetection() {
  type RawDetector = { detect: (el: HTMLVideoElement) => Promise<DetectedBarcode[]> };
  const detector = new (window as unknown as { BarcodeDetector: new (opts: object) => RawDetector }).BarcodeDetector({
    // code_128 listed first to signal priority intent; actual sort happens on results
    formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e', 'qr_code'],
  });

  detectionInterval = setInterval(async () => {
    if (!videoEl.value || scanStatus.value === 'detected' || scanStatus.value === 'multiple' || scanStatus.value === 'confirm') return;
    try {
      const raw = await detector.detect(videoEl.value);
      if (raw.length === 0) return;

      beepAndHaptic();

      if (raw.length === 1) {
        stopDetectionOnly();
        confirmedBarcode.value = raw[0].rawValue;
        scanStatus.value = 'confirm';
        return;
      }

      // Multiple barcodes — sort by format priority (code_128 first) then show picker
      const sorted = [...raw].sort(
        (a, b) => (FORMAT_PRIORITY[a.format] ?? 99) - (FORMAT_PRIORITY[b.format] ?? 99),
      );
      stopDetectionOnly();
      detectedBarcodes.value = sorted;
      scanStatus.value = 'multiple';
    } catch {
      /* per-frame errors are normal while video is still buffering */
    }
  }, 250);
}

function stopDetectionOnly() {
  if (detectionInterval) { clearInterval(detectionInterval); detectionInterval = null; }
}

function acceptBarcode() {
  const code = confirmedBarcode.value;
  confirmedBarcode.value = '';
  scanStatus.value = 'detected';
  stopCamera();
  setTimeout(() => resolveBarcode(code), 150);
}

function pickBarcode(code: string) {
  detectedBarcodes.value = [];
  scanStatus.value = 'detected';
  stopCamera();
  setTimeout(() => resolveBarcode(code), 200);
}

function resumeScanning() {
  detectedBarcodes.value = [];
  confirmedBarcode.value = '';
  // Camera was fully stopped (e.g. after resolveBarcode in not-found path) — restart it.
  // In confirm/multiple states the stream is still active; only detection was paused.
  if (!videoStream.value) {
    void openScanner();
    return;
  }
  scanStatus.value = 'scanning';
  if ('BarcodeDetector' in window) startAutoDetection();
}

function closeScanner() {
  stopCamera();
  viewMode.value = 'list';
}

function stopCamera() {
  stopDetectionOnly();
  videoStream.value?.getTracks().forEach((t) => t.stop());
  videoStream.value = null;
  audioCtx?.close();
  audioCtx = null;
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
  /* No match — if online, show BC search prompt on the scanner page;
     if offline, fall back to list view so the user can see the miss banner. */
  lastScannedBarcode.value = code;
  if (props.isOnline) {
    scanStatus.value = 'not-found';
  } else {
    searchQuery.value = code;
    barcodeNotFound.value = true;
    viewMode.value = 'list';
  }
}

function searchScannedInBC() {
  const code = lastScannedBarcode.value;
  if (!code || !props.isOnline) return;
  searchQuery.value = code;
  barcodeNotFound.value = true;
  viewMode.value = 'list';
  // barcodeNotFound watcher auto-triggers searchInBC()
}

onUnmounted(() => {
  stopCamera();
  if (priceTimer) clearTimeout(priceTimer);
  isFetchingPrices.value = false;
});
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

/* ── Pagination ── */
.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--app-border);
}

.pagination-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--app-text-muted);
  min-width: 56px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

/* ── Empty state ── */
.empty-results {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 36px 24px 28px;
  gap: 12px;
  text-align: center;
  color: var(--app-text-muted);
}
.empty-results ion-icon { font-size: 48px; }
.empty-results p { font-size: 14px; line-height: 1.6; margin: 0; }

/* ── BC search area (inside empty state) ── */
.bc-search-area {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  border-top: 1px solid var(--app-border);
  padding: 12px 16px 8px;
  margin-top: 4px;
}

.bc-search-hint {
  font-size: 12px;
  color: var(--app-text-muted);
  margin: 0;
  text-align: center;
}

.bc-search-btn {
  --border-radius: 10px;
}

.bc-searching {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  font-size: 13px;
  color: var(--ion-color-primary);
}

.bc-spinner { width: 16px; height: 16px; }

.bc-no-results {
  font-size: 12px;
  color: var(--app-text-muted);
  margin: 0;
  text-align: center;
}

.bc-search-error {
  font-size: 12px;
  color: var(--ion-color-danger);
  margin: 0;
  text-align: center;
}

/* ── BC results section ── */
.bc-results-wrap {
  border-top: 2px solid color-mix(in srgb, var(--ion-color-primary) 30%, transparent);
  margin-top: 4px;
}

.bc-results-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 6px;
  background: color-mix(in srgb, var(--ion-color-primary) 8%, transparent);
}

.bc-hdr-icon {
  font-size: 16px;
  color: var(--ion-color-primary);
  flex-shrink: 0;
}

.bc-hdr-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ion-color-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bc-hdr-clear {
  flex-shrink: 0;
  --padding-start: 4px;
  --padding-end: 4px;
}

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

/* ── Multi-barcode picker ── */
.multi-picker {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  background: rgba(10, 10, 10, 0.96);
  border-top: 1px solid #2a2a2a;
  padding: 16px 16px 8px;
  max-height: 62%;
  overflow-y: auto;
  pointer-events: all;
}

.multi-picker-title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 2px;
}

.multi-picker-sub {
  font-size: 11px;
  color: #666;
  margin: 0 0 12px;
}

.multi-bc-btn {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 11px 14px;
  margin-bottom: 8px;
  background: #1a1a1a;
  border: 1px solid #2e2e2e;
  border-radius: 10px;
  cursor: pointer;
  gap: 12px;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}

.multi-bc-btn:active {
  background: #252525;
}

.multi-bc-btn--priority {
  border-color: var(--app-gold);
  background: rgba(160, 115, 32, 0.1);
}

.multi-bc-format {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #555;
  flex-shrink: 0;
  min-width: 64px;
}

.multi-bc-btn--priority .multi-bc-format {
  color: var(--app-gold);
}

.multi-bc-value {
  font-size: 15px;
  font-weight: 600;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  text-align: right;
  font-family: monospace;
}

.multi-rescan-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 10px;
  margin-top: 2px;
  background: transparent;
  border: 1px solid #333;
  border-radius: 8px;
  color: #777;
  font-size: 13px;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.scan-hint--multiple   { color: var(--app-gold); }
.scan-hint--confirm    { color: var(--ion-color-success); }
.scan-hint--not-found  { color: var(--ion-color-warning); }

/* ── Not found panel (scanner view, online) ── */
.not-found-wrap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  background: rgba(10, 10, 10, 0.96);
  border-top: 1px solid #2a2a2a;
  padding: 20px 16px 12px;
  pointer-events: all;
}

.not-found-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.not-found-icon {
  font-size: 22px;
  color: var(--ion-color-warning);
  flex-shrink: 0;
}

.not-found-title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.not-found-code {
  font-size: 13px;
  font-family: monospace;
  color: #888;
  margin: 0 0 16px;
  padding-left: 32px;
  word-break: break-all;
}

.not-found-bc-btn {
  --border-radius: 10px;
  margin-bottom: 10px;
}

/* ── Single barcode confirm panel ── */
.single-confirm {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  background: rgba(10, 10, 10, 0.96);
  border-top: 1px solid #1e3a2a;
  padding: 16px 16px 8px;
  pointer-events: all;
}

.single-confirm-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.single-confirm-icon {
  font-size: 20px;
  color: var(--ion-color-success);
}

.single-confirm-title {
  font-size: 14px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.single-confirm-value {
  font-size: 20px;
  font-weight: 800;
  color: #fff;
  font-family: monospace;
  letter-spacing: 2px;
  text-align: center;
  padding: 14px 12px;
  margin: 0 0 14px;
  background: #111;
  border: 1px solid #1e3a2a;
  border-radius: 10px;
  word-break: break-all;
}

.single-confirm-btn {
  margin-bottom: 8px;
}

/* ── Price fetch bar ── */
.price-fetch-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 16px;
  background: color-mix(in srgb, var(--ion-color-primary) 10%, transparent);
  border-bottom: 1px solid color-mix(in srgb, var(--ion-color-primary) 22%, transparent);
  font-size: 12px;
  color: var(--ion-color-primary);
  font-weight: 500;
}
.price-fetch-spinner { width: 14px; height: 14px; flex-shrink: 0; }

.price-bar-fade-enter-active,
.price-bar-fade-leave-active {
  transition: opacity 0.2s ease, max-height 0.25s ease;
  overflow: hidden;
  max-height: 40px;
}
.price-bar-fade-enter-from,
.price-bar-fade-leave-to { opacity: 0; max-height: 0; }

/* ── Price skeleton shimmer ── */
.price-skeleton {
  display: inline-block;
  width: 54px;
  height: 13px;
  border-radius: 4px;
  background: linear-gradient(
    90deg,
    var(--app-border) 25%,
    var(--app-surface-alt) 50%,
    var(--app-border) 75%
  );
  background-size: 200% 100%;
  animation: price-shimmer 1.4s ease-in-out infinite;
  vertical-align: middle;
}

@keyframes price-shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .price-skeleton {
    animation: none;
    background: var(--app-border);
  }
}

/* ── Minimalist theme overrides ── */
.item-selector--minimalist .manual-wrap {
  background: #f4f4f4;
  border-top: 1px solid #e4e4e4;
}
.item-selector--minimalist .manual-label { color: #777; }
.item-selector--minimalist .manual-input {
  --background: #ffffff;
  --color: #333;
  --placeholder-color: #aaa;
  border-color: #e0e0e0;
}
.item-selector--minimalist .multi-picker {
  background: rgba(248, 248, 248, 0.98);
  border-top-color: #e4e4e4;
}
.item-selector--minimalist .multi-picker-title { color: #2a2a2a; }
.item-selector--minimalist .multi-picker-sub   { color: #888; }
.item-selector--minimalist .multi-bc-btn {
  background: #ffffff;
  border-color: #e0e0e0;
}
.item-selector--minimalist .multi-bc-btn:active { background: #f0f0f0; }
.item-selector--minimalist .scan-hint--scanning { color: rgba(0, 0, 0, 0.8); }
.item-selector--minimalist .scan-hint--starting  { color: rgba(0, 0, 0, 0.5); }
.item-selector--minimalist .single-confirm-value {
  background: #f4f4f4;
  border-color: #e0e0e0;
  color: #2a2a2a;
}
</style>
