import { h, toast } from '../dom.js';
import { api, session } from '../api.js';

export default async function adminLogin({ go }) {
  if (session.isAdmin) return go('/admin') || h('div');
  const err = h('p', { class: 'error-text', role: 'alert' });
  const form = h('form', { novalidate: true },
    h('label', { class: 'field' }, 'Admin email', h('input', { name: 'email', type: 'email', autocomplete: 'username', required: true })),
    h('label', { class: 'field' }, 'Password', h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true })),
    err,
    h('button', { class: 'btn', style: { width: '100%' }, type: 'submit' }, 'Sign in as admin')
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    err.textContent = '';
    try {
      const r = await api('POST', '/auth/admin/login', Object.fromEntries(new FormData(form)));
      session.set({ token: r.token, role: 'admin', name: r.admin.name, email: r.admin.email });
      window.dispatchEvent(new Event('session-changed'));
      toast('Welcome back', 'ok');
      go('/admin');
    } catch (ex) { err.textContent = ex.message; btn.disabled = false; }
  });
  return h('section', { class: 'auth' }, h('div', { class: 'card awn' }, h('div', { class: 'pad', style: { padding: '24px' } },
    h('h1', { style: { fontSize: '36px', marginBottom: '16px' } }, 'Staff sign in'), form,
    h('p', { class: 'hint', style: { marginTop: '16px' } }, h('a', { href: '#/login' }, 'Customer sign in'))
  )));
}
