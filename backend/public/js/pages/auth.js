import { h, toast } from '../dom.js';
import { api, session } from '../api.js';

export default async function auth({ query, go }) {
  if (session.isUser) return go(query.next || '/') || h('div');
  let mode = 'login';
  const form = h('form', { novalidate: true });
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const err = h('p', { class: 'error-text', role: 'alert' });

  function draw() {
    tabs.replaceChildren(
      h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(mode === 'login'), onclick: () => { mode = 'login'; draw(); } }, 'Sign in'),
      h('button', { type: 'button', class: 'chip', role: 'tab', 'aria-selected': String(mode === 'register'), onclick: () => { mode = 'register'; draw(); } }, 'Create account')
    );
    err.textContent = '';
    form.replaceChildren(
      ...(mode === 'register' ? [h('label', { class: 'field' }, 'Name', h('input', { name: 'name', autocomplete: 'name', required: true }))] : []),
      h('label', { class: 'field' }, 'Email', h('input', { name: 'email', type: 'email', autocomplete: 'email', required: true })),
      h('label', { class: 'field' }, 'Password', h('input', { name: 'password', type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true }), mode === 'register' ? h('span', { class: 'hint', style: { fontWeight: 400 } }, 'At least 8 characters') : null),
      err,
      h('button', { class: 'btn', style: { width: '100%' }, type: 'submit' }, mode === 'login' ? 'Sign in' : 'Create account')
    );
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    err.textContent = '';
    try {
      const r = await api('POST', mode === 'login' ? '/auth/login' : '/auth/register', f);
      session.set({ token: r.token, role: 'user', name: r.user.name, email: r.user.email });
      window.dispatchEvent(new Event('session-changed'));
      toast(mode === 'login' ? 'Signed in' : 'Account created', 'ok');
      go(query.next || '/');
    } catch (ex) {
      err.textContent = ex.message;
      btn.disabled = false;
    }
  });

  draw();
  return h('section', { class: 'auth' },
    h('div', { class: 'card awn' }, h('div', { class: 'pad', style: { padding: '24px' } },
      h('h1', { style: { fontSize: '36px', marginBottom: '16px' } }, 'Welcome to dimlight'),
      tabs, form,
      h('p', { class: 'hint', style: { marginTop: '16px' } }, 'Cinema staff? ', h('a', { href: '#/admin/login' }, 'Admin sign in'))
    ))
  );
}
