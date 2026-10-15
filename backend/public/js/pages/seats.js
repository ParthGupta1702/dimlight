import { h, toast, money, fmtDateTime } from '../dom.js';
import { api, session } from '../api.js';
import { popBurst, bucket } from '../snacks.js';
import { reducedMotion } from '../motion.js';

export default async function seatsPage({ params, onLeave, go }) {
  const id = params.id;
  let data = await api('GET', `/showtimes/${id}/seats`);
  const st = data.showtime;
  const price = st.price;
  const max = data.max_seats_per_booking;

  const nodes = new Map(); // seat_id -> button
  const info = new Map(); // seat_id -> { label, status }   status: available | held | booked
  const selected = new Set();

  const grid = h('div', { class: 'seats', role: 'group', 'aria-label': 'Seats' });
  const picked = h('div', { class: 'picked' });
  const total = h('div', { class: 'total' });
  const cta = h('button', { class: 'btn', onclick: hold }, 'Hold seats');
  const meter = bucket({ size: 46 }); // fills with one popcorn puff per seat picked
  const liveEl = h('span', { class: 'live off' }, 'Connecting');
  let holding = false; // our own hold is announced to everyone, including us - ignore it

  function paint(seatId, pulse) {
    const node = nodes.get(seatId);
    const s = info.get(seatId);
    const shown = selected.has(seatId) ? 'selected' : s.status;
    node.dataset.status = shown;
    node.setAttribute('aria-pressed', String(shown === 'selected'));
    node.disabled = shown === 'held' || shown === 'booked';
    node.setAttribute('aria-label', `Seat ${s.label}, ${shown === 'selected' ? 'selected' : s.status === 'held' ? 'held by someone else' : s.status}`);
    if (pulse) {
      node.classList.remove('pulse');
      void node.offsetWidth;
      node.classList.add('pulse');
    }
  }

  function summary() {
    const labels = [...selected].map((sid) => info.get(sid).label).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    picked.textContent = labels.length ? `Seats: ${labels.join(', ')}` : `Pick up to ${max} seats`;
    meter.set(labels.length);
    total.textContent = labels.length ? money(price * labels.length) : '';
    cta.disabled = !labels.length;
    cta.textContent = session.isUser ? 'Hold seats' : session.isAdmin ? 'Admins cannot book' : 'Sign in to book';
    if (session.isAdmin) cta.disabled = true;
  }

  function apply(d) {
    data = d;
    selected.clear();
    grid.replaceChildren();
    nodes.clear();
    info.clear();
    d.rows.forEach((row, ri) => {
      const rowEl = h('div', { class: 'seat-row', style: { '--i': ri } }, h('span', { class: 'row-label', 'aria-hidden': 'true' }, row.row));
      for (const s of row.seats) {
        const btn = h('button', { class: `seat ${s.number === 6 ? 'gap' : ''}`, dataset: undefined, type: 'button', 'data-id': s.seat_id }, String(s.number));
        nodes.set(s.seat_id, btn);
        info.set(s.seat_id, { label: s.label, status: s.status === 'yours' ? 'available' : s.status });
        if (s.status === 'yours') selected.add(s.seat_id);
        rowEl.append(btn);
      }
      grid.append(rowEl);
    });
    [...nodes.keys()].forEach((sid) => paint(sid));
    summary();
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.seat');
    if (!btn) return;
    const sid = btn.dataset.id; // the seat label, e.g. "B5"
    if (selected.has(sid)) selected.delete(sid);
    else {
      if (selected.size >= max) return toast(`You can book up to ${max} seats at a time`, 'error');
      selected.add(sid);
      // pop! a few kernels burst out of the seat you picked
      btn.classList.remove('popped');
      void btn.offsetWidth;
      btn.classList.add('popped');
      popBurst(btn);
    }
    paint(sid);
    summary();
  });

  async function hold() {
    if (!session.isUser) return go(`/login?next=${encodeURIComponent('/showtime/' + id)}`);
    cta.disabled = true;
    holding = true;
    cta.replaceChildren(h('span', { class: 'spinner' }), 'Holding seats');
    try {
      const r = await api('POST', '/bookings', { showtime_id: id, seat_ids: [...selected] });
      // seats are yours: a bigger burst from the bucket, then on to checkout
      cta.replaceChildren('Seats held');
      popBurst(meter.el, { pieces: 16, spread: 150, lift: 130, size: 28 });
      setTimeout(() => go(`/checkout/${r.booking.booking_id}`), reducedMotion ? 0 : 520);
    } catch (err) {
      holding = false;
      toast(err.message, 'error');
      // someone beat us to it: refresh the map so the taken seats show correctly
      try { apply(await api('GET', `/showtimes/${id}/seats`)); } catch (_) { summary(); }
    }
  }

  // live updates from other shoppers
  let es;
  try {
    es = new EventSource(`/api/showtimes/${id}/seats/stream`);
    es.addEventListener('ready', () => { liveEl.className = 'live'; liveEl.textContent = 'Live'; });
    es.addEventListener('seats', (ev) => {
      if (holding) return;
      const { seat_ids, status } = JSON.parse(ev.data);
      for (const sid of seat_ids) {
        if (!info.has(sid)) continue;
        const was = info.get(sid).status;
        if (status === 'available') info.get(sid).status = 'available';
        else {
          info.get(sid).status = status; // held | booked
          if (selected.delete(sid)) toast(`Seat ${info.get(sid).label} was just taken`, 'error');
        }
        if (was !== info.get(sid).status) paint(sid, true);
      }
      summary();
    });
    es.onerror = () => { liveEl.className = 'live off'; liveEl.textContent = 'Reconnecting'; };
  } catch (_) { liveEl.textContent = 'Not live'; }
  onLeave(() => es && es.close());

  apply(data);
  return h('section', {},
    h('a', { class: 'back', href: `#/movie/${st.movie_id}` }, 'Back to showtimes'),
    h('div', { class: 'show-head' },
      h('div', {}, h('h1', {}, st.movie_title), h('p', { class: 'hint', style: { margin: '6px 0 0' } }, `${fmtDateTime(st.start_at)} at ${st.theatre.name}, ${st.screen.name}`)),
      h('div', { style: { textAlign: 'right' } }, h('div', { class: 'hint' }, `${money(price)} per seat`), liveEl)
    ),
    h('div', { class: 'legend', 'aria-hidden': 'true' },
      h('span', {}, h('i', { class: 'lg-avail' }), 'Available'),
      h('span', {}, h('i', { class: 'lg-sel' }), 'Your pick'),
      h('span', {}, h('i', { class: 'lg-held' }), 'Being paid for'),
      h('span', {}, h('i', { class: 'lg-booked' }), 'Booked')
    ),
    h('div', { class: 'hall' }, h('div', { class: 'screen' }, 'Screen this way'), grid),
    h('div', { class: 'card awn bar' },
      h('div', { class: 'bar-left' }, meter.el, h('div', {}, picked, total)),
      cta
    )
  );
}
