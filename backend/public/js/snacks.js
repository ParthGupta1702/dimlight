// Concession-stand drawings and effects: popcorn puffs, a popcorn burst, a bucket that fills up,
// and a cola cup that drains. All hand-drawn SVG (generic cup, no brand), all decorative (aria-hidden).
import { h, svg } from './dom.js';
import { motion, reducedMotion } from './motion.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;

// One popped kernel: a cluster of puffy lobes with a butter crease, drawn in a 24x24 box
function puffShape() {
  return [
    svg('g', { fill: '#FFF6D6', stroke: '#B8860B', 'stroke-width': 1.4 },
      svg('circle', { cx: 8, cy: 12.5, r: 5.5 }),
      svg('circle', { cx: 14, cy: 8.5, r: 5.5 }),
      svg('circle', { cx: 16.5, cy: 14.5, r: 5 }),
      svg('circle', { cx: 10.5, cy: 17, r: 4.5 })
    ),
    svg('circle', { cx: 12, cy: 13, r: 2.6, fill: '#FFD23F', opacity: 0.85 }), // butter
    svg('path', { d: 'M11 12.6c1.2-.9 2.7-.7 3.4.4', fill: 'none', stroke: '#9A6A0A', 'stroke-width': 1.2, 'stroke-linecap': 'round' }),
  ];
}

export function puff(size = 24) {
  return svg('svg', { class: 'puff', width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true' }, ...puffShape());
}

/* ---------------- popcorn burst ---------------- */
let live = 0;
// Pops popcorn out of an element: each piece arcs up, tumbles and falls away.
export function popBurst(el, opts = {}) {
  if (reducedMotion || !el || !el.getBoundingClientRect || !Element.prototype.animate) return;
  const cfg = motion.popcorn || {};
  const n = opts.pieces ?? cfg.pieces ?? 6;
  const dur = opts.duration ?? cfg.durationMs ?? 750;
  const spread = opts.spread ?? 60;
  const lift = opts.lift ?? 80;
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  let layer = document.getElementById('fx');
  if (!layer) { layer = h('div', { id: 'fx', 'aria-hidden': 'true' }); document.body.append(layer); }

  for (let i = 0; i < n && live < 90; i++) {
    const size = (opts.size ?? 24) * (0.75 + Math.random() * 0.5);
    const p = h('span', { class: 'fx-puff' }, puff(size));
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    layer.append(p);
    live++;
    const dx = (Math.random() * 2 - 1) * spread;
    const up = -lift * (0.6 + Math.random() * 0.6);
    const fall = up + lift * (1 + Math.random() * 0.7);
    const rot = (Math.random() * 2 - 1) * 240;
    const a = p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 1, easing: 'cubic-bezier(0.2, 0.8, 0.4, 1)' },
        { transform: `translate(-50%, -50%) translate(${dx * 0.55}px, ${up}px) rotate(${rot * 0.5}deg) scale(1)`, opacity: 1, offset: 0.42, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' },
        { transform: `translate(-50%, -50%) translate(${dx}px, ${fall}px) rotate(${rot}deg) scale(0.85)`, opacity: 0 },
      ],
      { duration: dur * (0.85 + Math.random() * 0.3), delay: i * 22, fill: 'backwards' }
    );
    const done = () => { p.remove(); live--; };
    a.onfinish = done;
    a.oncancel = done;
  }
}

/* ---------------- popcorn bucket (fills up to 6) ---------------- */
// Red-and-white striped bucket. set(n) pops n puffs above the rim.
const PILE = [[13, 17], [24, 16], [35, 17], [18.5, 10], [29.5, 10], [24, 4]];
export function bucket({ size = 48, fill = 0 } = {}) {
  const puffs = PILE.map(([cx, cy]) =>
    svg('g', { transform: `translate(${cx - 7.5} ${cy - 7.5}) scale(0.62)` }, svg('g', { class: 'b-puff' }, ...puffShape()))
  );
  // stripes: split the trapezoid into 7 slices, colour every other one red
  const stripes = [];
  for (let i = 0; i < 7; i++) {
    const t0 = 6 + (36 / 7) * i, t1 = 6 + (36 / 7) * (i + 1);
    const b0 = 11 + (26 / 7) * i, b1 = 11 + (26 / 7) * (i + 1);
    stripes.push(svg('path', { d: `M${t0} 21 L${t1} 21 L${b1} 50 L${b0} 50 Z`, fill: i % 2 ? '#FFFFFF' : '#D62828' }));
  }
  const el = svg('svg', { class: 'bucket', width: size, height: size * (52 / 48), viewBox: '0 0 48 52', 'aria-hidden': 'true' },
    ...puffs,
    ...stripes,
    svg('rect', { x: 4, y: 18, width: 40, height: 5, rx: 2.5, fill: '#B01E1E' })
  );
  const api = {
    el,
    set(n) {
      puffs.forEach((g, i) => g.firstChild.classList.toggle('on', i < n));
    },
  };
  api.set(fill);
  return api;
}

// A tipped-over bucket with popcorn spilling out (error pages)
export function spilledBucket() {
  const b = bucket({ size: 86, fill: 6 });
  return h('div', { class: 'spill', 'aria-hidden': 'true' },
    h('span', { class: 'spill-bucket' }, b.el),
    h('span', { class: 'spill-puff', style: { left: '92px', top: '64px' } }, puff(22)),
    h('span', { class: 'spill-puff', style: { left: '118px', top: '76px' } }, puff(18)),
    h('span', { class: 'spill-puff', style: { left: '140px', top: '70px' } }, puff(20))
  );
}

/* ---------------- cola cup (drains with time) ---------------- */
// Clear cup with a lid and striped straw. set(fraction) sets the cola level (1 = full, 0 = empty).
export function colaCup({ size = 64, level = 1, fizz = true } = {}) {
  const cupId = nextId('cup');
  const liqId = nextId('liq');
  const cupPath = 'M10 22 L50 22 L45 88 L15 88 Z';
  const bubbles = fizz && !reducedMotion
    ? [[20, 80, 0], [30, 84, 0.7], [38, 78, 1.3], [26, 74, 2]].map(([cx, cy, d]) =>
        svg('circle', { class: 'bubble', cx, cy, r: 1.6, style: `animation-delay:${d}s` }))
    : [];
  const liquid = svg('g', { class: 'cola-level' },
    svg('rect', { x: 0, y: 22, width: 60, height: 66, fill: '#4A2511' }),
    svg('rect', { x: 0, y: 22, width: 60, height: 3, fill: '#8C5A3C' }),
    svg('g', { 'clip-path': `url(#${liqId})` }, ...bubbles)
  );
  const el = svg('svg', { class: 'cola', width: size, height: size * (96 / 60), viewBox: '0 0 60 96', 'aria-hidden': 'true' },
    svg('defs', {},
      svg('clipPath', { id: cupId }, svg('path', { d: cupPath })),
      svg('clipPath', { id: liqId }, svg('rect', { x: 0, y: 24, width: 60, height: 64 }))
    ),
    // straw (behind the lid)
    svg('g', { transform: 'rotate(14 38 12)' },
      svg('rect', { x: 35, y: -2, width: 6, height: 26, rx: 2, fill: '#D62828' }),
      svg('rect', { x: 35, y: 4, width: 6, height: 3, fill: '#fff' }),
      svg('rect', { x: 35, y: 12, width: 6, height: 3, fill: '#fff' })
    ),
    svg('path', { d: cupPath, fill: 'rgba(255,255,255,0.75)' }),
    svg('g', { 'clip-path': `url(#${cupId})` }, liquid),
    // red band around the cup (no label, no brand)
    svg('path', { d: 'M12.6 56 L47.4 56 L46.6 66 L13.4 66 Z', fill: '#D62828' }),
    svg('path', { d: 'M12.9 59 L47.1 59', stroke: '#fff', 'stroke-width': 1 }),
    svg('path', { d: cupPath, fill: 'none', stroke: '#CDB98A', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    // domed lid
    svg('path', { d: 'M7 22 Q30 9 53 22 Z', fill: '#FFFFFF', stroke: '#CDB98A', 'stroke-width': 2, 'stroke-linejoin': 'round' }),
    svg('rect', { x: 6, y: 20, width: 48, height: 4, rx: 2, fill: '#FFFFFF', stroke: '#CDB98A', 'stroke-width': 1.5 })
  );
  const api = {
    el,
    set(f) {
      const fr = Math.max(0, Math.min(1, f));
      liquid.style.transform = `translateY(${(1 - fr) * 66}px)`;
    },
  };
  api.set(level);
  return api;
}
