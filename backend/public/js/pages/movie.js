import { h, poster, duration, fmtDate, fmtTime, money } from '../dom.js';
import { api } from '../api.js';

export default async function movie({ params }) {
  const [m, st] = await Promise.all([api('GET', `/movies/${params.id}`), api('GET', `/movies/${params.id}/showtimes`)]);
  let active = 0;

  const daysEl = h('div', { class: 'days', role: 'tablist', 'aria-label': 'Choose a day' });
  const timesEl = h('div', { 'aria-live': 'polite' });

  function draw() {
    daysEl.replaceChildren(
      ...st.dates.map((d, i) =>
        h('button', { class: 'chip', role: 'tab', 'aria-selected': String(i === active), onclick: () => { active = i; draw(); } }, fmtDate(d.date))
      )
    );
    if (!st.dates.length) {
      timesEl.replaceChildren(h('div', { class: 'panel' }, h('h3', {}, 'No upcoming shows'), h('p', { class: 'hint' }, 'Check back soon, new showtimes are added regularly.')));
      return;
    }
    // group the chosen day by theatre + screen
    const groups = new Map();
    for (const s of st.dates[active].showtimes) {
      const key = `${s.theatre.theatre_id}-${s.screen.screen_id}`;
      if (!groups.has(key)) groups.set(key, { theatre: s.theatre, screen: s.screen, list: [] });
      groups.get(key).list.push(s);
    }
    let i = 0;
    timesEl.replaceChildren(
      ...[...groups.values()].map((g) =>
        h('div', { class: 'venue' },
          h('h3', {}, g.theatre.name, ' ', h('span', {}, `${g.screen.name}, ${g.theatre.city}`)),
          h('div', { class: 'times' },
            g.list.map((s) => {
              const out = s.availability === 'sold_out';
              return h('a', {
                class: `time ${s.availability === 'filling_fast' ? 'few' : ''} ${out ? 'out' : ''}`,
                style: { '--i': i++ },
                href: `#/showtime/${s.showtime_id}`,
                'aria-disabled': out ? 'true' : null,
                tabindex: out ? '-1' : null,
              },
                h('b', {}, fmtTime(s.time)),
                h('small', {}, out ? 'Sold out' : s.availability === 'filling_fast' ? `${s.available_seats} left` : money(s.price))
              );
            })
          )
        )
      )
    );
  }
  draw();

  return h('section', {},
    h('a', { class: 'back', href: '#/' }, 'Back to movies'),
    h('div', { class: 'detail' },
      poster(m),
      h('div', {},
        h('h1', {}, m.title),
        h('div', { class: 'facts' }, h('span', { class: 'tag' }, m.genre), h('span', { class: 'tag' }, m.language), h('span', { class: 'tag' }, duration(m.duration_min))),
        m.description ? h('p', {}, m.description) : null
      )
    ),
    h('h2', { style: { marginBottom: '12px' } }, 'Pick a show'),
    daysEl,
    timesEl
  );
}
