<template>
  <ion-modal :is-open="isVisible" @did-dismiss="onDismissed" class="welcome-modal">
    <ion-page class="wm-page">

      <!-- Gold progress line -->
      <div class="wm-progress">
        <div class="wm-progress-fill" :style="{ width: progressPct + '%' }" />
      </div>

      <!-- Skip button (all slides except last) -->
      <Transition name="wm-skip">
        <button v-if="current < slides.length - 1" class="wm-skip-btn" @click="finish">
          Skip
        </button>
      </Transition>

      <!-- Slide viewport -->
      <div class="wm-viewport" @touchstart.passive="onTouchStart" @touchend.passive="onTouchEnd">
        <div class="wm-track" :style="{ transform: `translateX(-${current * 100}%)` }">

          <!-- Slide 0: Intro -->
          <div class="wm-slide wm-slide--intro">
            <div class="wm-intro-inner">
              <img src="/static/cons-logo-splash.png" alt="RGMC Consignment" class="wm-intro-logo" />
              <div class="wm-intro-text">
                <h1 class="wm-intro-heading">Welcome,<br /><span class="wm-intro-name">{{ firstName }}</span></h1>
                <p class="wm-intro-sub">{{ slides[0].desc }}</p>
              </div>
            </div>
          </div>

          <!-- Slides 1-4: Feature slides -->
          <div
            v-for="(slide, i) in slides.slice(1)"
            :key="i + 1"
            class="wm-slide wm-slide--feature"
          >
            <div class="wm-phone-wrap">
              <div class="wm-phone">
                <div class="wm-phone-notch" />
                <img :src="slide.img!" :alt="slide.title" class="wm-phone-screen" />
              </div>
              <!-- Floating label tag -->
              <div class="wm-phone-tag" :class="`wm-phone-tag--${i + 1}`">
                <ion-icon :icon="slide.icon" />
                {{ slide.label }}
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- Bottom panel -->
      <div class="wm-panel">

        <!-- Step badge (hidden on intro) -->
        <div class="wm-step-row">
          <span v-if="current > 0" class="wm-step-chip">
            Step {{ current }}&thinsp;/&thinsp;{{ slides.length - 1 }}
          </span>
        </div>

        <!-- Title + description (feature slides) -->
        <div v-if="current > 0" class="wm-panel-text">
          <h2 class="wm-panel-title">{{ slides[current].title }}</h2>
          <p class="wm-panel-desc">{{ slides[current].desc }}</p>
        </div>

        <!-- Nav row: prev | dots | next -->
        <div class="wm-nav">
          <button
            class="wm-nav-btn"
            :disabled="current === 0"
            :aria-label="'Previous'"
            @click="prev"
          >
            <ion-icon :icon="chevronBackOutline" />
          </button>

          <div class="wm-dots" role="tablist">
            <button
              v-for="(_, i) in slides"
              :key="i"
              class="wm-dot"
              :class="{ 'wm-dot--active': i === current }"
              :aria-label="`Slide ${i + 1}`"
              @click="goTo(i)"
            />
          </div>

          <button
            class="wm-nav-btn"
            :class="{ 'wm-nav-btn--gold': current === slides.length - 1 }"
            :aria-label="current === slides.length - 1 ? 'Finish' : 'Next'"
            @click="current === slides.length - 1 ? finish() : next()"
          >
            <ion-icon :icon="current === slides.length - 1 ? checkmarkOutline : chevronForwardOutline" />
          </button>
        </div>

        <!-- Get Started CTA (last slide only) -->
        <Transition name="wm-cta">
          <ion-button
            v-if="current === slides.length - 1"
            expand="block"
            class="wm-cta-btn"
            @click="finish"
          >
            Get Started
            <ion-icon :icon="arrowForwardOutline" slot="end" />
          </ion-button>
        </Transition>

      </div>

    </ion-page>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue';
import { IonModal, IonPage, IonButton, IonIcon } from '@ionic/vue';
import {
  chevronBackOutline,
  chevronForwardOutline,
  checkmarkOutline,
  arrowForwardOutline,
  homeOutline,
  scanOutline,
  timeOutline,
  cloudUploadOutline,
} from 'ionicons/icons';
import { useAuthStore } from '@/stores/auth.store';

const landingImg  = '/static/screenshots/03-landing.png';
const scanImg     = '/static/screenshots/04-scanning-form.png';
const historyImg  = '/static/screenshots/06-history.png';
const submitImg   = '/static/screenshots/08-submit.png';

const props = defineProps<{ isOpen: boolean }>();
const emit  = defineEmits<{ done: [] }>();

const isVisible = ref(props.isOpen);

const authStore = useAuthStore();

const firstName = computed(() => {
  const name = authStore.user?.displayName ?? '';
  return name.split(' ')[0] || 'there';
});

const slides = [
  {
    title: '',
    desc: "Here's a quick tour of everything you can do with the RGMC Consignment Web App.",
    img: null,
    icon: null,
    label: '',
  },
  {
    title: 'Home Dashboard',
    desc: 'Start a new scanning session, manage pending drafts, and see an overview of your consignment work.',
    img: landingImg,
    icon: homeOutline,
    label: 'Home',
  },
  {
    title: 'Scan & Record',
    desc: 'Select a customer, filter items by category, and record sales or returns by scanning barcodes or searching items.',
    img: scanImg,
    icon: scanOutline,
    label: 'Scan',
  },
  {
    title: 'Order History',
    desc: 'Track all submitted orders, filter by status, and export records for your reporting needs.',
    img: historyImg,
    icon: timeOutline,
    label: 'History',
  },
  {
    title: 'Review & Submit',
    desc: "Review your session's line items and submit directly to Business Central when you're ready.",
    img: submitImg,
    icon: cloudUploadOutline,
    label: 'Submit',
  },
] as const;

const current     = ref(0);
const progressPct = computed(() => ((current.value + 1) / slides.length) * 100);

// ── Auto-advance timer ──────────────────────────────────────────────────────
const SLIDE_MS = 5_000;
let timer: ReturnType<typeof setInterval> | null = null;

function startTimer() {
  stopTimer();
  if (current.value < slides.length - 1) {
    timer = setInterval(() => {
      if (current.value < slides.length - 1) current.value++;
      else stopTimer();
    }, SLIDE_MS);
  }
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null; }
}

function next()      { if (current.value < slides.length - 1) current.value++; startTimer(); }
function prev()      { if (current.value > 0) current.value--; startTimer(); }
function goTo(i: number) { current.value = i; startTimer(); }
function finish()    { stopTimer(); isVisible.value = false; }
function onDismissed() { emit('done'); }

let touchStartX = 0;

function onTouchStart(e: TouchEvent) {
  touchStartX = e.touches[0].clientX;
  stopTimer();
}

function onTouchEnd(e: TouchEvent) {
  const delta = e.changedTouches[0].clientX - touchStartX;
  if (Math.abs(delta) > 50) {
    if (delta < 0) next();
    else prev();
  } else {
    startTimer();
  }
}

watch(() => props.isOpen, (open) => {
  isVisible.value = open;
  if (open) { current.value = 0; startTimer(); }
  else stopTimer();
});

onMounted(() => { if (props.isOpen) startTimer(); });
onUnmounted(() => stopTimer());
</script>

<style scoped>
/* ── Modal shell ─────────────────────────────────────────────────────────── */
.wm-page {
  --background: #111;
  background: #111;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Progress bar ────────────────────────────────────────────────────────── */
.wm-progress {
  height: 3px;
  background: rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}
.wm-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #a07320, #c4972e);
  transition: width 0.45s ease;
}

/* ── Skip button ─────────────────────────────────────────────────────────── */
.wm-skip-btn {
  position: absolute;
  top: 18px;
  right: 18px;
  z-index: 20;
  background: rgba(255, 255, 255, 0.07);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 20px;
  color: rgba(255, 255, 255, 0.45);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  padding: 6px 14px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.wm-skip-btn:hover { background: rgba(255,255,255,0.12); color: rgba(255,255,255,0.7); }

.wm-skip-enter-active, .wm-skip-leave-active { transition: opacity 0.18s ease; }
.wm-skip-enter-from, .wm-skip-leave-to       { opacity: 0; }

/* ── Slide viewport ──────────────────────────────────────────────────────── */
.wm-viewport {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0;
}

.wm-track {
  display: flex;
  height: 100%;
  transition: transform 0.38s cubic-bezier(0.4, 0, 0.2, 1);
  will-change: transform;
}

/* ── Individual slides ───────────────────────────────────────────────────── */
.wm-slide {
  min-width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 52px 20px 12px;
  box-sizing: border-box;
}

/* Intro slide */
.wm-slide--intro {
  flex-direction: column;
  gap: 0;
  background: radial-gradient(ellipse at 60% 30%, rgba(160, 115, 32, 0.12) 0%, transparent 65%);
}

.wm-intro-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  max-width: 300px;
  text-align: center;
  animation: wm-fade-up 0.5s ease both;
}

.wm-intro-logo {
  width: 190px;
  height: 190px;
  object-fit: contain;
  filter: drop-shadow(0 12px 32px rgba(160, 115, 32, 0.3));
  animation: wm-logo-enter 0.65s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.wm-intro-text { display: flex; flex-direction: column; gap: 10px; }

.wm-intro-heading {
  font-size: 30px;
  font-weight: 800;
  color: #fff;
  line-height: 1.15;
  margin: 0;
  letter-spacing: -0.5px;
}

.wm-intro-name {
  color: #c4972e;
  display: inline;
}

.wm-intro-sub {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
  margin: 0;
}

/* Feature slide */
.wm-slide--feature { padding-top: 40px; }

.wm-phone-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.wm-phone {
  width: 172px;
  height: 312px;
  border-radius: 28px;
  border: 2px solid rgba(255, 255, 255, 0.12);
  background: #000;
  overflow: hidden;
  position: relative;
  box-shadow:
    0 32px 64px rgba(0, 0, 0, 0.75),
    0 4px 16px rgba(0, 0, 0, 0.4),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
  animation: wm-phone-enter 0.5s cubic-bezier(0.34, 1.3, 0.64, 1) both;
}

.wm-phone-notch {
  position: absolute;
  top: 9px;
  left: 50%;
  transform: translateX(-50%);
  width: 60px;
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.15);
  z-index: 2;
}

.wm-phone-screen {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: top center;
  display: block;
}

/* Floating feature tag */
.wm-phone-tag {
  position: absolute;
  bottom: -12px;
  right: -16px;
  background: #a07320;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  padding: 5px 10px 5px 8px;
  border-radius: 20px;
  display: flex;
  align-items: center;
  gap: 5px;
  box-shadow: 0 4px 14px rgba(160, 115, 32, 0.45);
  white-space: nowrap;
}
.wm-phone-tag ion-icon { font-size: 13px; }

/* ── Bottom panel ────────────────────────────────────────────────────────── */
.wm-panel {
  flex-shrink: 0;
  padding: 14px 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #111;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.wm-step-row { min-height: 18px; }

.wm-step-chip {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: #a07320;
}

.wm-panel-text { display: flex; flex-direction: column; gap: 5px; }

.wm-panel-title {
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0;
  line-height: 1.25;
  letter-spacing: -0.2px;
}

.wm-panel-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  line-height: 1.6;
  margin: 0;
}

/* ── Nav row ─────────────────────────────────────────────────────────────── */
.wm-nav {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.wm-nav-btn {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  font-size: 18px;
  transition: border-color 0.2s, background 0.2s, color 0.2s, transform 0.1s;
}
.wm-nav-btn:hover:not(:disabled) { background: rgba(255,255,255,0.09); color: #fff; }
.wm-nav-btn:active:not(:disabled) { transform: scale(0.93); }
.wm-nav-btn:disabled { opacity: 0.22; cursor: default; }
.wm-nav-btn--gold { border-color: #a07320; background: rgba(160, 115, 32, 0.12); color: #c4972e; }
.wm-nav-btn--gold:hover { background: rgba(160, 115, 32, 0.22); }

/* Dots */
.wm-dots {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
}

.wm-dot {
  width: 7px;
  height: 7px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.18);
  border: none;
  padding: 0;
  cursor: pointer;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1), background 0.25s;
}
.wm-dot--active {
  width: 22px;
  background: #a07320;
}

/* ── CTA button ──────────────────────────────────────────────────────────── */
.wm-cta-btn {
  --background: #a07320;
  --background-activated: #7a5418;
  --background-hover: #b88526;
  --border-radius: 12px;
  height: 50px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.2px;
  box-shadow: 0 6px 20px rgba(160, 115, 32, 0.35);
  margin-top: 2px;
}

.wm-cta-enter-active { transition: opacity 0.3s ease, transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1); }
.wm-cta-leave-active { transition: opacity 0.15s ease; }
.wm-cta-enter-from   { opacity: 0; transform: translateY(10px); }
.wm-cta-leave-to     { opacity: 0; }

/* ── Keyframes ───────────────────────────────────────────────────────────── */
@keyframes wm-fade-up {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0);    }
}

@keyframes wm-logo-enter {
  from { opacity: 0; transform: scale(0.7) rotate(-6deg); }
  to   { opacity: 1; transform: scale(1)   rotate(0deg);  }
}

@keyframes wm-phone-enter {
  from { opacity: 0; transform: translateY(24px) scale(0.92); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}
</style>

<!-- Force full-screen on all breakpoints -->
<style>
.welcome-modal {
  --height: 100%;
  --width: 100%;
  --max-height: 100%;
  --border-radius: 0;
}
</style>
