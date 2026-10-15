// Loads shared animation timings from the backend (GET /api/ui/motion) and applies them as CSS variables.
export let motion = {
  durations: { instant: 80, fast: 150, base: 250, slow: 400, page: 450 },
  stagger: { movieCards: 60, showtimes: 40, seatRows: 50 },
  hero: { autoplayMs: 7000, slideDistancePx: 28, slideDuration: 650, bulbsOnMs: 1400 },
  seatHold: { seconds: 300, warnAtSeconds: 60 },
  payment: { processingMinMs: 1200, successHoldMs: 900 },
  easing: { smooth: 'cubic-bezier(0.22, 1, 0.36, 1)', enter: 'cubic-bezier(0, 0, 0.2, 1)' },
};

export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function loadMotion() {
  try {
    const res = await fetch('/api/ui/motion');
    if (res.ok) motion = await res.json();
  } catch (_) { /* keep defaults */ }
  const root = document.documentElement.style;
  const d = motion.durations;
  const ms = (v) => (reducedMotion ? '0ms' : `${v}ms`);
  root.setProperty('--d-instant', ms(d.instant));
  root.setProperty('--d-fast', ms(d.fast));
  root.setProperty('--d-base', ms(d.base));
  root.setProperty('--d-slow', ms(d.slow));
  root.setProperty('--d-page', ms(d.page));
  root.setProperty('--ease', motion.easing.smooth);
  root.setProperty('--ease-enter', motion.easing.enter);
  root.setProperty('--stagger-cards', ms(motion.stagger.movieCards));
  root.setProperty('--stagger-showtimes', ms(motion.stagger.showtimes));
  root.setProperty('--stagger-rows', ms(motion.stagger.seatRows));
  const hero = motion.hero || {};
  root.setProperty('--hero-slide', ms(hero.slideDuration || 650));
  root.setProperty('--hero-distance', `${hero.slideDistancePx || 28}px`);
  root.setProperty('--bulbs-on', ms(hero.bulbsOnMs || 1400));
}
