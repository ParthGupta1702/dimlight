// Tiny DOM helpers. Everything is built with textContent/createElement, so server data can never inject HTML.
export function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') {
      // custom properties (--i, --hero-ms...) must go through setProperty; plain assignment ignores them
      for (const [prop, val] of Object.entries(v)) {
        if (prop.startsWith('--')) el.style.setProperty(prop, String(val));
        else el.style[prop] = val;
      }
    }
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function svg(tag, attrs, ...kids) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) if (v != null) el.setAttribute(k, v);
  append(el, kids);
  return el;
}

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k == null || k === false) continue;
    el.append(k.nodeType ? k : document.createTextNode(String(k)));
  }
}

export function toast(message, type = 'info') {
  const box = document.getElementById('toasts');
  const t = h('div', { class: `toast ${type === 'error' ? 'err' : type === 'ok' ? 'ok' : ''}` }, message);
  box.append(t);
  setTimeout(() => {
    t.classList.add('out');
    setTimeout(() => t.remove(), 300);
  }, 3800);
}

const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
export const money = (n) => inr.format(Number(n) || 0);

export function duration(min) {
  const m = Number(min) || 0;
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;
}

export function fmtDate(s) {
  // 'YYYY-MM-DD' -> 'Thu, 15 Oct' (no timezone shifting)
  return new Date(`${s.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export function fmtTime(hhmm) {
  const [H, M] = hhmm.split(':').map(Number);
  return `${H % 12 || 12}:${String(M).padStart(2, '0')} ${H >= 12 ? 'pm' : 'am'}`;
}

// 'YYYY-MM-DD HH:MM:SS' -> 'Thu, 15 Oct, 6:30 pm'
export function fmtDateTime(s) {
  return `${fmtDate(s)}, ${fmtTime(s.slice(11, 16))}`;
}

// Poster with a title fallback if the image fails or is missing
export function poster(movie) {
  const box = h('div', { class: 'poster' }, h('span', {}, movie.title));
  if (movie.poster_url) {
    const img = h('img', { src: movie.poster_url, alt: `${movie.title} poster`, loading: 'lazy' });
    img.addEventListener('error', () => img.remove());
    box.append(img);
  }
  return box;
}
