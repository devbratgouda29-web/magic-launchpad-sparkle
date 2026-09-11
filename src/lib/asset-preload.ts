// Warms the browser cache for the app's static art + sounds so badges, shields
// and the splash logo render instantly on later screens. All assets are served
// from /public — no external network URLs.

const IMAGE_ASSETS: string[] = [
  "/splash-logo.png",
  "/home-banner.jpg",
  "/favicon.png",
  ...Array.from({ length: 15 }, (_, i) => `/shields/shield-${i + 1}.png`),
  ...Array.from({ length: 15 }, (_, i) => `/shields/title-${i + 1}.png`),
  ...Array.from({ length: 5 }, (_, i) => `/cores/tier-${i + 1}.png`),
  "/badges/novice-scholar.png",
  "/badges/focus-vanguard.png",
  "/badges/iron-mind.png",
  "/badges/expert-scholar.png",
  "/badges/apex-mastery.png",
];

export const AUDIO_ASSETS: string[] = [
  "/audio/coffin-dance.mp3",
  "/audio/godzilla.mp3",
  "/audio/gta-san-andreas.mp3",
  "/audio/john-cena.mp3",
  "/audio/man-of-steel.mp3",
  "/audio/mortal-kombat.mp3",
  "/audio/mario-bros.mp3",
  "/audio/the-batman.mp3",
  "/audio/transformers-prime.mp3",
  "/audio/Transformers.mp3",
  "/audio/wonder-woman.mp3",
];

/** Decoded images stay referenced here so the browser keeps them in memory. */
const imageCache = new Map<string, HTMLImageElement>();
let started = false;

function whenIdle(run: () => void, timeout = 3000) {
  const ric = (window as unknown as {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
  }).requestIdleCallback;
  if (typeof ric === "function") ric(run, { timeout });
  else window.setTimeout(run, 400);
}

function preloadImage(src: string) {
  if (imageCache.has(src)) return;
  const img = new Image();
  img.decoding = "async";
  img.src = src;
  imageCache.set(src, img);
}

/** Fetch audio into the HTTP cache without instantiating 11 media elements. */
async function warmAudio(src: string) {
  try {
    await fetch(src, { cache: "force-cache" });
  } catch {
    /* offline or blocked — the service worker will fill in later */
  }
}

/** Idempotent: call once from the app shell after hydration. */
export function preloadStaticAssets() {
  if (started || typeof window === "undefined") return;
  started = true;

  // Images first — they are what the user sees.
  IMAGE_ASSETS.forEach(preloadImage);

  // Sounds afterwards, sequentially, so they never contend with rendering.
  whenIdle(() => {
    void AUDIO_ASSETS.reduce<Promise<void>>(
      (chain, src) => chain.then(() => warmAudio(src)),
      Promise.resolve(),
    );
  });
}
