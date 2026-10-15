import { h, toast } from './dom.js';
import { api, session } from './api.js';
import { loadMotion } from './motion.js';

// Pages are loaded on demand. Each default export: async ({ params, query, onLeave, go }) => Node
const routes = [
  ['/', () => import('./pages/movies.js')],
  ['/movie/:id', () => import('./pages/movie.js')],
  ['/showtime/:id', () => import('./pages/seats.js')],
  ['/checkout/:id', () => import('./pages/checkout.js')],
  ['/ticket/:id', () => import('./pages/ticket.js')],
  ['/bookings', () => import('./pages/bookings.js')],
  ['/login', () => import('./pages/auth.js')],
  ['/admin/login', () => import('./pages/adminLogin.js')],
  ['/admin', () => import('./pages/admin.js')],
  ['/admin/:tab', () => import('./pages/admin.js')],
].map(([pattern, load]) => {
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)')) + '$');
  return { re, names, load };
});

const app = document.getElementById('app');
let leaveFns = [];
let renderToken = 0;

export function go(path) {
  if (location.hash === '#' + path) render();
  else location.hash = '#' + path;
}

function parseHash() {
  const raw = location.hash.slice(1) || '/';
  const [path, qs] = raw.split('?');
  return { path: path || '/', query: Object.fromEntries(new URLSearchParams(qs || '')) };
}

function renderChrome(path) {
  const acct = document.getElementById('acct');
  const nav = document.getElementById('subnav');
  const s = session.get();
  acct.replaceChildren(
    ...(s
      ? [
          h('span', { class: 'who' }, `Hi, ${(s.name || '').split(' ')[0] || 'there'}`),
          h('button', { class: 'btn butter pill sm', onclick: () => { session.clear(); window.dispatchEvent(new Event('session-changed')); toast('Signed out'); go('/'); } }, 'Sign out'),
        ]
      : [h('a', { class: 'btn butter pill', href: '#/login' }, 'Sign in')])
  );
  const link = (href, text, active) => h('a', { href: '#' + href, 'aria-current': active ? 'page' : null }, text);
  nav.replaceChildren(
    ...[
      link('/', 'Movies', path === '/' || path.startsWith('/movie') || path.startsWith('/showtime')),
      session.isAdmin ? null : link('/bookings', 'My bookings', path === '/bookings' || path.startsWith('/ticket') || path.startsWith('/checkout')),
      session.isAdmin ? link('/admin', 'Admin', path.startsWith('/admin')) : null,
    ].filter(Boolean)
  );
}

async function render() {
  const token = ++renderToken;
  leaveFns.forEach((fn) => { try { fn(); } catch (_) {} });
  leaveFns = [];

  const { path, query } = parseHash();
  renderChrome(path);
  document.getElementById('searchInput').value = path === '/' ? query.q || '' : '';

  const match = routes.map((r) => ({ r, m: r.re.exec(path) })).find((x) => x.m);
  app.setAttribute('aria-busy', 'true');
  try {
    if (!match) throw Object.assign(new Error('That page does not exist.'), { status: 404 });
    const params = Object.fromEntries(match.r.names.map((n, i) => [n, decodeURIComponent(match.m[i + 1])]));
    const mod = await match.r.load();
    const page = await mod.default({ params, query, onLeave: (fn) => leaveFns.push(fn), go });
    if (token !== renderToken) return; // user navigated away while loading
    app.replaceChildren(page);
  } catch (err) {
    if (token !== renderToken) return;
    app.replaceChildren(
      h('section', { class: 'empty' },
        h('h2', {}, err.status === 404 ? 'Not found' : 'Could not load this page'),
        h('p', {}, err.message || 'Something went wrong.'),
        h('p', {}, h('a', { class: 'btn', href: '#/' }, 'Back to movies'), ' ', h('button', { class: 'btn ghost', onclick: render }, 'Try again'))
      )
    );
  } finally {
    if (token === renderToken) {
      app.removeAttribute('aria-busy');
      app.classList.remove('page-enter');
      void app.offsetWidth; // restart the entrance animation
      app.classList.add('page-enter');
      window.scrollTo(0, 0);
    }
  }
}

document.getElementById('searchForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('searchInput').value.trim();
  go(q ? `/?q=${encodeURIComponent(q)}` : '/');
});
window.addEventListener('hashchange', render);
window.addEventListener('session-changed', () => renderChrome(parseHash().path));

// keep the token fresh: if it expired, the next API call clears it and the header updates
(async function start() {
  await loadMotion();
  if (session.get()) api('GET', '/auth/me').catch(() => {});
  render();
})();
