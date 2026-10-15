import { h, poster, duration } from '../dom.js';
import { api } from '../api.js';
import { heroSection } from '../hero.js';
import { bucket } from '../snacks.js';

export function movieCard(m, i) {
  return h('article', { class: 'card awn movie', style: { '--i': i } },
    h('div', { class: 'pad', style: { display: 'flex', flexDirection: 'column', flex: 1 } },
      poster(m),
      h('h3', {}, m.title),
      h('p', { class: 'meta' }, `${m.genre} · ${m.language} · ${duration(m.duration_min)}`),
      h('a', { class: 'btn', href: `#/movie/${m.movie_id}`, 'aria-label': `Book ${m.title}` }, 'Book')
    )
  );
}

export default async function movies({ query, onLeave }) {
  // the hero is skipped while searching, so results come first; a failed hero never blocks the page
  const [filters, featured] = await Promise.all([
    api('GET', '/movies/filters'),
    query.q ? Promise.resolve({ movies: [] }) : api('GET', '/movies/featured').catch(() => ({ movies: [] })),
  ]);
  const hero = heroSection(featured.movies, onLeave);
  let genre = '';
  let language = '';

  const grid = h('div', { class: 'grid' });
  const count = h('p', { class: 'hint', 'aria-live': 'polite' });
  const genreRow = h('div', { class: 'filters', role: 'group', 'aria-label': 'Genre' });
  const langSelect = h('select', { class: 'select', 'aria-label': 'Language', onchange: (e) => { language = e.target.value; load(); } },
    h('option', { value: '' }, 'All languages'),
    filters.languages.map((l) => h('option', { value: l }, l))
  );

  function drawChips() {
    genreRow.replaceChildren(
      ...['', ...filters.genres].map((g) =>
        h('button', { class: 'chip', 'aria-pressed': String(g === genre), onclick: () => { genre = g; drawChips(); load(); } }, g || 'All genres')
      ),
      langSelect
    );
  }

  async function load() {
    grid.replaceChildren(...Array.from({ length: 6 }, () => h('div', { class: 'skeleton' })));
    const p = new URLSearchParams();
    if (genre) p.set('genre', genre);
    if (language) p.set('language', language);
    if (query.q) p.set('search', query.q);
    try {
      const d = await api('GET', '/movies?' + p);
      count.textContent = d.count ? `${d.count} ${d.count === 1 ? 'movie' : 'movies'}${query.q ? ` matching "${query.q}"` : ''}` : '';
      if (!d.count) {
        grid.replaceChildren(
          h('div', { class: 'empty', style: { gridColumn: '1 / -1' } },
            h('div', { class: 'empty-art' }, bucket({ size: 78 }).el),
            h('h2', {}, 'No movies found'),
            h('p', {}, 'Try a different search or clear the filters.'),
            h('button', { class: 'btn', onclick: () => { genre = ''; language = ''; langSelect.value = ''; drawChips(); location.hash = '#/'; load(); } }, 'Clear filters')
          )
        );
      } else grid.replaceChildren(...d.movies.map(movieCard));
    } catch (err) {
      grid.replaceChildren(h('div', { class: 'empty', style: { gridColumn: '1 / -1' } }, h('h2', {}, 'Could not load movies'), h('p', {}, err.message), h('button', { class: 'btn', onclick: load }, 'Try again')));
    }
  }

  drawChips();
  load();
  return h('section', {},
    hero,
    h('div', { class: 'page-head' }, h('h1', {}, query.q ? 'Search results' : 'Now showing'), count),
    genreRow,
    grid
  );
}
