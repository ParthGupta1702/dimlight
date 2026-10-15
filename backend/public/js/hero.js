// Home page hero: a cinema marquee that rotates through featured movies.
// - Auto-advances (motion.hero.autoplayMs). The progress bar's own CSS animation drives the timing,
//   so pausing the animation (hover, keyboard focus, Pause button, hidden tab) pauses the rotation too.
// - No autoplay when the visitor prefers reduced motion.
import { h, poster, duration, money, fmtDateTime } from './dom.js';
import { motion, reducedMotion } from './motion.js';

export function heroSection(movies, onLeave) {
  if (!movies.length) return null;
  const autoplay = !reducedMotion && movies.length > 1;
  const ms = (motion.hero && motion.hero.autoplayMs) || 7000;
  let index = 0;
  let userPaused = false;

  const slides = movies.map((m, i) => slide(m, i, movies.length));
  const thumbs = movies.map((m, i) =>
    h('button', {
      class: 'reel-thumb', type: 'button', role: 'tab', id: `hero-tab-${i}`,
      'aria-controls': `hero-slide-${i}`, 'aria-label': m.title,
      onclick: () => show(i, true),
    },
      h('span', { class: 'reel-poster' }, poster(m)),
      h('span', { class: 'reel-title' }, m.title),
      h('span', { class: 'reel-progress', 'aria-hidden': 'true' }, h('i', {}))
    )
  );

  const pauseBtn = h('button', { class: 'hero-ctl', type: 'button', 'aria-pressed': 'false', onclick: togglePause }, 'Pause');
  const root = h('section', { class: `marquee${autoplay ? '' : ' still'}`, 'aria-roledescription': 'carousel', 'aria-label': 'Featured movies', style: { '--hero-ms': `${ms}ms` } },
    h('div', { class: 'bulbs', 'aria-hidden': 'true' }),
    h('div', { class: 'stage' }, slides),
    movies.length > 1
      ? h('div', { class: 'reel-row' },
          h('div', { class: 'reel', role: 'tablist', 'aria-label': 'Choose a featured movie', onkeydown: onKeys }, thumbs),
          h('div', { class: 'hero-ctls' },
            h('button', { class: 'hero-ctl', type: 'button', 'aria-label': 'Previous movie', onclick: () => show(index - 1, true) }, 'Prev'),
            h('button', { class: 'hero-ctl', type: 'button', 'aria-label': 'Next movie', onclick: () => show(index + 1, true) }, 'Next'),
            autoplay ? pauseBtn : null
          )
        )
      : null
  );

  function show(i, fromUser) {
    index = (i + movies.length) % movies.length;
    slides.forEach((s, k) => {
      const on = k === index;
      s.classList.toggle('is-active', on);
      s.toggleAttribute('inert', !on);
      s.setAttribute('aria-hidden', String(!on));
    });
    thumbs.forEach((t, k) => {
      const on = k === index;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      // restart the progress bar on the active thumb
      const bar = t.querySelector('.reel-progress i');
      bar.classList.remove('run');
      if (on && autoplay) { void bar.offsetWidth; bar.classList.add('run'); }
    });
    if (fromUser && thumbs[index] && thumbs[index].scrollIntoView) {
      thumbs[index].scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: reducedMotion ? 'auto' : 'smooth' });
    }
  }

  // the active progress bar finishing = time to advance
  root.addEventListener('animationend', (e) => {
    if (e.target.matches('.reel-progress i.run')) show(index + 1, false);
  });

  function togglePause() {
    userPaused = !userPaused;
    root.classList.toggle('paused', userPaused);
    pauseBtn.setAttribute('aria-pressed', String(userPaused));
    pauseBtn.textContent = userPaused ? 'Play' : 'Pause';
  }

  function onKeys(e) {
    const keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (e.key in keys) { e.preventDefault(); show(index + keys[e.key], true); thumbs[index].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); show(0, true); thumbs[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); show(movies.length - 1, true); thumbs[index].focus(); }
  }

  // stop rotating while the tab is in the background
  const onVis = () => root.classList.toggle('tab-hidden', document.hidden);
  document.addEventListener('visibilitychange', onVis);
  onLeave(() => document.removeEventListener('visibilitychange', onVis));

  show(0, false);
  return root;
}

function slide(m, i, total) {
  const next = m.next_show;
  return h('article', { class: 'slide', id: `hero-slide-${i}`, role: 'tabpanel', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} of ${total}: ${m.title}` },
    m.poster_url ? h('img', { class: 'slide-bg', src: m.poster_url, alt: '', 'aria-hidden': 'true', onerror: (e) => e.target.remove() }) : null,
    h('div', { class: 'slide-poster' }, poster(m)),
    h('div', { class: 'slide-copy' },
      h('h2', { class: 'slide-title' }, m.title),
      h('div', { class: 'facts' }, h('span', { class: 'tag' }, m.genre), h('span', { class: 'tag' }, m.language), h('span', { class: 'tag' }, duration(m.duration_min))),
      m.description ? h('p', { class: 'slide-desc' }, m.description) : null,
      next
        ? h('p', { class: 'slide-next' }, h('b', {}, 'Next show '), `${fmtDateTime(next.start_at)} at ${next.theatre}`)
        : h('p', { class: 'slide-next' }, 'New showtimes are coming soon.'),
      h('div', { class: 'slide-actions' },
        h('a', { class: 'btn butter big', href: `#/movie/${m.movie_id}` }, next ? 'Book tickets' : 'See details'),
        next ? h('span', { class: 'slide-price' }, `from ${money(next.from_price)}`) : null,
        next && next.upcoming_shows > 1 ? h('span', { class: 'slide-count' }, `${next.upcoming_shows} shows coming up`) : null
      )
    )
  );
}
