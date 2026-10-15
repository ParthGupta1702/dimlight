// Single source of truth for animation timing. The frontend fetches GET /api/ui/motion
// and uses these values for CSS variables / framer-motion, so every screen moves the same way.
// The backend values below are the ones that actually depend on server behaviour
// (seat hold length, payment delay), so they are pulled from the same env settings.

const holdMinutes = Number(process.env.HOLD_MINUTES) || 5;
const paymentDelay = Number(process.env.MOCK_PAYMENT_DELAY_MS ?? 1200);

module.exports = () => ({
  durations: { instant: 80, fast: 150, base: 250, slow: 400, page: 450 }, // ms
  easing: {
    smooth: 'cubic-bezier(0.22, 1, 0.36, 1)', // default for most movement
    enter: 'cubic-bezier(0, 0, 0.2, 1)',
    exit: 'cubic-bezier(0.4, 0, 1, 1)',
    spring: { stiffness: 260, damping: 24 },
  },
  stagger: { movieCards: 60, showtimes: 40, seatRows: 50 }, // delay between siblings (ms)
  transitions: {
    page: { type: 'fade-slide-up', distancePx: 16, duration: 450 },
    movieCard: { type: 'fade-scale-in', fromScale: 0.96, duration: 250, hover: { scale: 1.03, duration: 150 } },
    seat: { select: { scale: 1.12, duration: 150 }, release: { duration: 150 }, taken: { duration: 250 } },
    seatLiveUpdate: { type: 'pulse', duration: 400 }, // when SSE says another user took a seat
    bookingConfirm: { type: 'check-draw', duration: 600 },
  },
  hero: { autoplayMs: 7000, slideDistancePx: 28, slideDuration: 650, bulbsOnMs: 1400 }, // featured-movies marquee
  seatHold: { seconds: holdMinutes * 60, warnAtSeconds: 60 }, // drive the countdown ring
  payment: { processingMinMs: paymentDelay, successHoldMs: 900 }, // show spinner at least this long
  reducedMotion: 'Respect prefers-reduced-motion: set all durations to 0 and drop transforms.',
});
