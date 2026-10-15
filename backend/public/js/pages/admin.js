import { h, toast, money, fmtDateTime, fmtDate, fmtTime, duration } from '../dom.js';
import { api, session } from '../api.js';

const TABS = [['bookings', 'All bookings'], ['movies', 'Movies'], ['showtimes', 'Showtimes']];

export default async function admin({ params, go }) {
  if (!session.isAdmin) return go('/admin/login') || h('div');
  const tab = TABS.some(([k]) => k === params.tab) ? params.tab : 'bookings';
  const body = h('div', {});
  const content = await ({ bookings: bookingsTab, movies: moviesTab, showtimes: showtimesTab })[tab](body);
  return h('section', {},
    h('div', { class: 'page-head' }, h('h1', {}, 'Admin')),
    h('div', { class: 'tabs', role: 'tablist' }, TABS.map(([k, label]) => h('a', { class: 'chip', role: 'tab', 'aria-selected': String(k === tab), href: `#/admin/${k}`, style: { display: 'inline-flex', alignItems: 'center', textDecoration: 'none' } }, label))),
    content || body
  );
}

/* ------------------------------ bookings ------------------------------ */
async function bookingsTab() {
  const state = { page: 1, status: '', search: '' };
  const tiles = h('div', { class: 'tiles' });
  const tbody = h('tbody', {});
  const pager = h('div', { class: 'pager' });

  async function load() {
    const p = new URLSearchParams({ page: state.page, limit: 15 });
    if (state.status) p.set('status', state.status);
    if (state.search) p.set('search', state.search);
    try {
      const d = await api('GET', '/admin/bookings?' + p);
      const s = d.summary;
      tiles.replaceChildren(
        ...[[s.confirmed_bookings, 'Confirmed (paid)'], [money(s.revenue), 'Revenue'], [s.pending, 'Pending'], [s.cancelled + s.expired, 'Cancelled or expired']].map(([n, l]) => h('div', { class: 'tile' }, h('b', {}, String(n)), h('span', {}, l)))
      );
      tbody.replaceChildren(
        ...(d.bookings.length ? d.bookings.map((b) =>
          h('tr', {},
            h('td', {}, h('a', { href: `#/ticket/${b.booking_id}` }, b.booking_ref)),
            h('td', {}, b.user.name, h('br'), h('span', { class: 'hint' }, b.user.email)),
            h('td', {}, b.movie.title),
            h('td', {}, fmtDateTime(b.showtime.start_at), h('br'), h('span', { class: 'hint' }, `${b.theatre.name}, ${b.screen}`)),
            h('td', {}, b.seats.join(', ') || '-'),
            h('td', {}, money(b.total_amount)),
            h('td', {}, h('span', { class: `status ${b.status}` }, b.status), h('br'), h('span', { class: 'hint' }, `Payment: ${b.payment.status}`))
          )
        ) : [h('tr', {}, h('td', { colspan: 7, style: { textAlign: 'center', padding: '28px' } }, 'No bookings match these filters.'))])
      );
      const pages = Math.max(1, Math.ceil(d.total / d.limit));
      pager.replaceChildren(
        h('button', { class: 'btn ghost sm', disabled: state.page <= 1, onclick: () => { state.page--; load(); } }, 'Previous'),
        h('span', { class: 'hint' }, `Page ${state.page} of ${pages} (${d.total} bookings)`),
        h('button', { class: 'btn ghost sm', disabled: state.page >= pages, onclick: () => { state.page++; load(); } }, 'Next')
      );
    } catch (err) { toast(err.message, 'error'); }
  }

  const status = h('select', { class: 'select', 'aria-label': 'Status', onchange: (e) => { state.status = e.target.value; state.page = 1; load(); } },
    ['', 'Paid', 'Pending', 'Cancelled', 'Expired'].map((s) => h('option', { value: s }, s || 'All statuses')));
  let timer;
  const search = h('input', { class: 'select grow', style: { borderRadius: '999px' }, type: 'search', placeholder: 'Search name, email or reference', 'aria-label': 'Search bookings',
    oninput: (e) => { clearTimeout(timer); timer = setTimeout(() => { state.search = e.target.value.trim(); state.page = 1; load(); }, 300); } });

  await load();
  return h('div', {}, tiles, h('div', { class: 'toolbar' }, search, status),
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Reference', 'Customer', 'Movie', 'Show', 'Seats', 'Total', 'Status'].map((t) => h('th', {}, t)))), tbody)),
    pager);
}

/* ------------------------------- movies ------------------------------- */
async function moviesTab() {
  const tbody = h('tbody', {});
  const formBox = h('div', {});
  let editing = null;

  async function load() {
    const d = await api('GET', '/movies');
    tbody.replaceChildren(...d.movies.map((m) => {
      const del = h('button', { class: 'btn danger sm', onclick: async () => {
        if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Confirm delete'; setTimeout(() => { delete del.dataset.sure; del.textContent = 'Delete'; }, 3000); return; }
        try { await api('DELETE', `/movies/${m.movie_id}`); toast('Movie deleted', 'ok'); load(); } catch (e) { toast(e.message, 'error'); }
      } }, 'Delete');
      const star = h('button', {
        class: `btn sm ${m.featured ? 'butter' : 'ghost'}`, 'aria-pressed': String(m.featured),
        'aria-label': m.featured ? `Remove ${m.title} from the hero` : `Feature ${m.title} in the hero`,
        onclick: async () => {
          try { await api('PUT', `/movies/${m.movie_id}`, { featured: !m.featured }); toast(m.featured ? 'Removed from the hero' : 'Added to the hero', 'ok'); load(); }
          catch (e) { toast(e.message, 'error'); }
        },
      }, m.featured ? 'In hero' : 'Feature');
      return h('tr', {},
        h('td', {}, h('b', {}, m.title)), h('td', {}, m.genre), h('td', {}, m.language), h('td', {}, duration(m.duration_min)), h('td', {}, star),
        h('td', {}, h('div', { class: 'actions' }, h('button', { class: 'btn ghost sm', onclick: () => { editing = m; drawForm(); } }, 'Edit'), del)));
    }));
  }

  function drawForm() {
    const m = editing || {};
    const err = h('p', { class: 'error-text', role: 'alert' });
    const f = (label, name, attrs = {}) => h('label', { class: 'field' }, label, h('input', { name, value: m[name] ?? '', ...attrs }));
    const form = h('form', { novalidate: true },
      h('h3', { style: { marginBottom: '14px' } }, editing ? 'Edit movie' : 'Add a movie'),
      f('Title', 'title', { required: true }), f('Genre', 'genre', { required: true }), f('Language', 'language', { required: true }),
      f('Duration (minutes)', 'duration_min', { type: 'number', min: 1, max: 600, required: true }), f('Poster link (optional)', 'poster_url', { type: 'url' }),
      h('label', { class: 'field' }, 'Description (optional)', h('textarea', { name: 'description' }, m.description || '')),
      h('label', { class: 'check' }, h('input', { type: 'checkbox', name: 'featured', checked: Boolean(m.featured) }), 'Show in the hero on the home page'),
      err,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, editing ? 'Save changes' : 'Add movie'),
        editing ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { editing = null; drawForm(); } }, 'Cancel') : null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(form));
      body.duration_min = Number(body.duration_min);
      body.featured = form.elements.featured.checked;
      try {
        if (editing) await api('PUT', `/movies/${editing.movie_id}`, body); else await api('POST', '/movies', body);
        toast(editing ? 'Movie updated' : 'Movie added', 'ok');
        editing = null; drawForm(); load();
      } catch (ex) { err.textContent = ex.message; }
    });
    formBox.replaceChildren(h('div', { class: 'panel' }, form));
  }

  await load(); drawForm();
  return h('div', { class: 'split' },
    h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['Title', 'Genre', 'Language', 'Length', 'Hero', ''].map((t) => h('th', {}, t)))), tbody)),
    formBox);
}

/* ------------------------------ showtimes ------------------------------ */
async function showtimesTab() {
  const [mv, th] = await Promise.all([api('GET', '/movies'), api('GET', '/theatres')]);
  let movieId = mv.movies[0]?.movie_id;
  let editing = null;
  const tbody = h('tbody', {});
  const formBox = h('div', {});

  async function load() {
    if (!movieId) return;
    const d = await api('GET', `/movies/${movieId}/showtimes`);
    const all = d.dates.flatMap((x) => x.showtimes);
    tbody.replaceChildren(...(all.length ? all.map((s) =>
      h('tr', {}, h('td', {}, fmtDate(s.date), ', ', fmtTime(s.time)), h('td', {}, `${s.theatre.name}, ${s.screen.name}`), h('td', {}, money(s.price)), h('td', {}, `${s.total_seats - s.available_seats} / ${s.total_seats}`),
        h('td', {}, h('button', { class: 'btn ghost sm', onclick: () => { editing = s; drawForm(); } }, 'Edit')))
    ) : [h('tr', {}, h('td', { colspan: 5, style: { textAlign: 'center', padding: '24px' } }, 'No upcoming showtimes for this movie.'))]));
  }

  function drawForm() {
    const s = editing;
    const err = h('p', { class: 'error-text', role: 'alert' });
    const today = new Date().toISOString().slice(0, 10);
    const form = h('form', { novalidate: true },
      h('h3', { style: { marginBottom: '14px' } }, s ? 'Edit showtime' : 'Add a showtime'),
      h('label', { class: 'field' }, 'Screen', h('select', { name: 'screen_id' }, th.theatres.map((t) => h('optgroup', { label: `${t.name}, ${t.city}` }, t.screens.map((sc) => h('option', { value: sc.screen_id, selected: s && s.screen.screen_id === sc.screen_id }, sc.name)))))),
      h('label', { class: 'field' }, 'Date', h('input', { name: 'date', type: 'date', min: today, value: s ? s.date : '', required: true })),
      h('label', { class: 'field' }, 'Start time', h('input', { name: 'time', type: 'time', value: s ? s.time : '', required: true })),
      h('label', { class: 'field' }, 'Ticket price (INR)', h('input', { name: 'price', type: 'number', min: 1, max: 5000, value: s ? s.price : 250, required: true })),
      h('p', { class: 'hint' }, 'Shows on the same screen cannot overlap. A 15 minute gap is added after each show.'),
      err,
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'submit' }, s ? 'Save changes' : 'Add showtime'), s ? h('button', { class: 'btn ghost', type: 'button', onclick: () => { editing = null; drawForm(); } }, 'Cancel') : null));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const b = Object.fromEntries(new FormData(form));
      b.price = Number(b.price);
      try {
        if (s) await api('PUT', `/showtimes/${s.showtime_id}`, b); else await api('POST', '/showtimes', { ...b, movie_id: movieId });
        toast(s ? 'Showtime updated' : 'Showtime added', 'ok');
        editing = null; drawForm(); load();
      } catch (ex) { err.textContent = ex.message; }
    });
    formBox.replaceChildren(h('div', { class: 'panel' }, form));
  }

  const picker = h('select', { class: 'select', 'aria-label': 'Movie', onchange: (e) => { movieId = e.target.value; editing = null; drawForm(); load(); } },
    mv.movies.map((m) => h('option', { value: m.movie_id }, m.title)));
  await load(); drawForm();
  return h('div', {}, h('div', { class: 'toolbar' }, h('span', { style: { fontWeight: 700 } }, 'Movie:'), picker),
    h('div', { class: 'split' },
      h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ['When', 'Where', 'Price', 'Seats sold', ''].map((t) => h('th', {}, t)))), tbody)),
      formBox));
}
