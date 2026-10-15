import { h, poster, money, fmtDateTime } from '../dom.js';
import { api, session } from '../api.js';
import { bucket } from '../snacks.js';

const FILTERS = ['', 'Paid', 'Pending', 'Cancelled', 'Expired'];

export default async function bookings({ go }) {
  if (!session.isUser) return go('/login?next=%2Fbookings') || h('div');
  let status = '';
  const list = h('div', { class: 'list' });
  const chips = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Filter by status' });

  function drawChips() {
    chips.replaceChildren(...FILTERS.map((f) => h('button', { class: 'chip', 'aria-pressed': String(f === status), onclick: () => { status = f; drawChips(); load(); } }, f || 'All')));
  }

  async function load() {
    try {
      const d = await api('GET', '/bookings/my?limit=50' + (status ? `&status=${status}` : ''));
      if (!d.bookings.length) {
        list.replaceChildren(h('div', { class: 'empty' }, h('div', { class: 'empty-art' }, bucket({ size: 78 }).el), h('h2', {}, status ? `No ${status.toLowerCase()} bookings` : 'No bookings yet'), h('p', {}, 'Pick a movie and your tickets will show up here.'), h('a', { class: 'btn', href: '#/' }, 'Browse movies')));
        return;
      }
      list.replaceChildren(
        ...d.bookings.map((b) =>
          h('a', { class: 'card awn row-card', href: b.status === 'Pending' ? `#/checkout/${b.booking_id}` : `#/ticket/${b.booking_id}` },
            poster(b.movie),
            h('div', {},
              h('h3', {}, b.movie.title),
              h('p', {}, `${fmtDateTime(b.showtime.start_at)} at ${b.theatre.name}`),
              h('p', {}, `Seats ${b.seats.join(', ') || 'released'} · ${money(b.total_amount)} · ${b.booking_ref}`)
            ),
            h('div', { style: { textAlign: 'right' } }, h('span', { class: `status ${b.status}` }, b.status), b.status === 'Pending' ? h('p', { class: 'hint', style: { margin: '6px 0 0' } }, 'Tap to pay') : null)
          )
        )
      );
    } catch (err) {
      list.replaceChildren(h('div', { class: 'empty' }, h('h2', {}, 'Could not load bookings'), h('p', {}, err.message), h('button', { class: 'btn', onclick: load }, 'Try again')));
    }
  }

  drawChips();
  await load();
  return h('section', {}, h('div', { class: 'page-head' }, h('h1', {}, 'My bookings')), chips, list);
}
