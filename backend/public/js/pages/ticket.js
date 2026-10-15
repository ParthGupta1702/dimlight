import { h, svg, money, fmtDateTime } from '../dom.js';
import { api, session } from '../api.js';

// Decorative bars derived from the booking reference (not a scannable code)
function bars(ref) {
  const rects = [];
  let x = 0;
  for (let i = 0; i < 36; i++) {
    const c = ref.charCodeAt(i % ref.length) + i * 7;
    const w = 1 + (c % 4);
    if (i % 2 === 0) rects.push(svg('rect', { x, y: 0, width: w, height: 64, fill: '#2B1A12' }));
    x += w + 1;
  }
  return svg('svg', { class: 'barcode', viewBox: `0 0 ${x} 64`, preserveAspectRatio: 'none', 'aria-hidden': 'true' }, ...rects);
}

export default async function ticket({ params, go }) {
  if (!session.get()) return go(`/login?next=${encodeURIComponent('/ticket/' + params.id)}`) || h('div');
  const b = await api('GET', `/bookings/${params.id}`);
  const paid = b.status === 'Paid';

  const stamp = paid ? h('span', { class: 'stamp' }, 'Paid')
    : b.status === 'Pending' ? h('span', { class: 'stamp warn' }, 'Unpaid')
    : h('span', { class: 'stamp dim' }, b.status);

  return h('section', {},
    h('a', { class: 'back no-print', href: session.isAdmin ? '#/admin/bookings' : '#/bookings' }, session.isAdmin ? 'Back to all bookings' : 'Back to my bookings'),
    h('div', { class: 'ticket' },
      h('div', { class: 'main' },
        h('p', { class: 'hint', style: { margin: 0 } }, paid ? 'Your e-ticket' : 'Booking details'),
        h('h1', {}, b.movie.title),
        h('dl', {},
          h('div', {}, h('dt', {}, 'Date and time'), h('dd', {}, fmtDateTime(b.showtime.start_at))),
          h('div', {}, h('dt', {}, 'Seats'), h('dd', {}, b.seats.join(', ') || 'None')),
          h('div', {}, h('dt', {}, 'Theatre'), h('dd', {}, `${b.theatre.name}, ${b.theatre.city}`)),
          h('div', {}, h('dt', {}, 'Screen'), h('dd', {}, b.screen)),
          h('div', {}, h('dt', {}, 'Total'), h('dd', {}, money(b.total_amount))),
          h('div', {}, h('dt', {}, 'Payment'), h('dd', {}, b.payment.method ? `${b.payment.status}, ${b.payment.method.toUpperCase()}` : b.payment.status)),
          b.user ? h('div', {}, h('dt', {}, 'Booked by'), h('dd', {}, `${b.user.name} (${b.user.email})`)) : null,
          b.payment.transaction_ref ? h('div', {}, h('dt', {}, 'Transaction'), h('dd', {}, b.payment.transaction_ref)) : null
        )
      ),
      h('div', { class: 'stub' },
        h('div', {}, stamp),
        bars(b.booking_ref),
        h('div', {}, h('div', { class: 'hint' }, 'Booking reference'), h('div', { class: 'ref' }, b.booking_ref))
      )
    ),
    h('div', { class: 'no-print', style: { textAlign: 'center', marginTop: '26px', display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' } },
      paid ? h('button', { class: 'btn', onclick: () => window.print() }, 'Print ticket') : null,
      b.status === 'Pending' && !session.isAdmin ? h('a', { class: 'btn', href: `#/checkout/${b.booking_id}` }, 'Complete payment') : null,
      h('a', { class: 'btn ghost', href: '#/' }, 'Browse movies')
    )
  );
}
