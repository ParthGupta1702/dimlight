import { h, svg, toast, money, fmtDateTime } from '../dom.js';
import { api, session } from '../api.js';
import { motion, reducedMotion } from '../motion.js';

const METHODS = [['upi', 'UPI'], ['card', 'Card'], ['netbanking', 'Net banking'], ['wallet', 'Wallet']];
const R = 42;
const CIRC = 2 * Math.PI * R;

export default async function checkout({ params, onLeave, go }) {
  if (!session.isUser) return go(`/login?next=${encodeURIComponent('/checkout/' + params.id)}`) || h('div');
  const b = (await api('GET', `/bookings/${params.id}`));

  if (b.status === 'Paid') return go(`/ticket/${b.booking_id}`) || h('div');
  if (b.status !== 'Pending') {
    return h('section', { class: 'empty' },
      h('h2', {}, b.status === 'Expired' ? 'Your seat hold ran out' : 'This booking was cancelled'),
      h('p', {}, 'The seats were released. Pick them again to continue.'),
      h('a', { class: 'btn', href: `#/showtime/${b.showtime.showtime_id}` }, 'Choose seats again')
    );
  }

  const total = motion.seatHold.seconds;
  let left = b.hold_seconds_left;
  let method = 'upi';
  let busy = false;

  const prog = svg('circle', { class: 'prog', cx: 48, cy: 48, r: R, fill: 'none', 'stroke-width': 8, 'stroke-dasharray': CIRC, 'stroke-dashoffset': 0 });
  const clock = h('b', {});
  const ring = h('div', { class: 'ring', role: 'timer', 'aria-label': 'Time left to pay' },
    svg('svg', { width: 96, height: 96, viewBox: '0 0 96 96' }, svg('circle', { class: 'track', cx: 48, cy: 48, r: R, fill: 'none', 'stroke-width': 8 }), prog),
    clock
  );
  const payBtn = h('button', { class: 'btn', style: { width: '100%' }, onclick: pay }, `Pay ${money(b.total_amount)}`);
  const cancelBtn = h('button', { class: 'btn ghost', style: { width: '100%', marginTop: '10px' }, onclick: cancel }, 'Release seats');
  const note = h('p', { class: 'hint' }, 'Demo payment. No real money moves.');
  const timerText = h('div', {}, h('h2', {}, 'Complete your payment'), h('p', { class: 'hint', style: { margin: '4px 0 0' } }, 'Your seats are held while the timer runs.'));

  function tick() {
    const mm = String(Math.floor(left / 60)).padStart(2, '0');
    const ss = String(left % 60).padStart(2, '0');
    clock.textContent = `${mm}:${ss}`;
    prog.setAttribute('stroke-dashoffset', String(CIRC * (1 - Math.max(0, left) / total)));
    ring.classList.toggle('warn', left <= motion.seatHold.warnAtSeconds && left > 0);
    if (left <= 0 && !busy) expired();
  }
  function expired() {
    clearInterval(timer);
    payBtn.disabled = true;
    cancelBtn.replaceWith(h('a', { class: 'btn', style: { width: '100%', marginTop: '10px' }, href: `#/showtime/${b.showtime.showtime_id}` }, 'Choose seats again'));
    timerText.replaceChildren(h('h2', {}, 'Your seat hold ran out'), h('p', { class: 'hint' }, 'The seats were released for other people.'));
  }
  const timer = setInterval(() => { left = Math.max(0, left - 1); tick(); }, 1000);
  onLeave(() => clearInterval(timer));
  tick();

  async function pay() {
    if (busy) return;
    busy = true;
    payBtn.disabled = true;
    payBtn.replaceChildren(h('span', { class: 'spinner' }), 'Processing payment');
    const started = performance.now();
    try {
      const r = await api('POST', `/bookings/${b.booking_id}/pay`, { method });
      const wait = Math.max(0, motion.payment.processingMinMs - (performance.now() - started));
      await new Promise((res) => setTimeout(res, wait));
      clearInterval(timer);
      success(r.booking.booking_id);
    } catch (err) {
      busy = false;
      payBtn.disabled = false;
      payBtn.textContent = `Pay ${money(b.total_amount)}`;
      toast(err.message, 'error');
      if (err.status === 410) setTimeout(() => go(`/showtime/${b.showtime.showtime_id}`), 1200);
    }
  }

  function success(bookingId) {
    const box = h('div', { class: 'box' },
      svg('svg', { viewBox: '0 0 110 110', 'aria-hidden': 'true' }, svg('circle', { class: 'ring-ok', cx: 55, cy: 55, r: 50 }), svg('path', { class: 'tick', d: 'M32 57 L48 72 L79 38' })),
      h('h2', { style: { marginTop: '10px' } }, 'Payment received'),
      h('p', { class: 'hint' }, 'Getting your ticket ready')
    );
    if (!reducedMotion) {
      for (let i = 0; i < 14; i++) {
        const a = (Math.PI * 2 * i) / 14;
        const dist = 90 + Math.random() * 50;
        box.append(h('span', { class: 'kernel', style: { '--dx': `${Math.cos(a) * dist}px`, '--dy': `${Math.sin(a) * dist}px`, '--r': `${Math.random() * 360}deg` } }));
      }
    }
    const overlay = h('div', { class: 'done', role: 'status' }, box);
    document.body.append(overlay);
    setTimeout(() => { overlay.remove(); go(`/ticket/${bookingId}`); }, motion.payment.successHoldMs + 400);
  }

  async function cancel() {
    cancelBtn.disabled = true;
    try {
      await api('POST', `/bookings/${b.booking_id}/cancel`);
      toast('Seats released', 'ok');
      go(`/showtime/${b.showtime.showtime_id}`);
    } catch (err) { toast(err.message, 'error'); cancelBtn.disabled = false; }
  }

  return h('section', {},
    h('div', { class: 'checkout' },
      h('div', { class: 'panel' },
        h('div', { class: 'timer' }, ring, timerText),
        h('fieldset', { class: 'methods' },
          h('legend', { class: 'vh' }, 'Payment method'),
          METHODS.map(([v, label]) =>
            h('label', { class: 'method' },
              h('input', { type: 'radio', name: 'method', value: v, checked: v === method, onchange: () => { method = v; } }),
              h('span', {}, label)
            )
          )
        ),
        payBtn, cancelBtn, h('div', { style: { marginTop: '12px' } }, note)
      ),
      h('aside', { class: 'card awn sum' },
        h('div', { class: 'pad' },
          h('h3', { style: { marginBottom: '12px' } }, b.movie.title),
          h('dl', {},
            h('dt', {}, 'When'), h('dd', {}, fmtDateTime(b.showtime.start_at)),
            h('dt', {}, 'Where'), h('dd', {}, `${b.theatre.name}, ${b.screen}`),
            h('dt', {}, 'Seats'), h('dd', {}, b.seats.join(', ')),
            h('dt', {}, 'Price'), h('dd', {}, `${money(b.showtime.price)} each`)
          ),
          h('div', { class: 'big' }, money(b.total_amount))
        )
      )
    )
  );
}
