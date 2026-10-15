// API client + login session. The token lives in localStorage when allowed, otherwise in memory.
const KEY = 'dimlight.session';
let memory = null;

export const session = {
  get() {
    if (memory) return memory;
    try { memory = JSON.parse(localStorage.getItem(KEY)); } catch (_) { memory = null; }
    return memory;
  },
  set(value) {
    memory = value;
    try { localStorage.setItem(KEY, JSON.stringify(value)); } catch (_) { /* private mode: memory only */ }
  },
  clear() {
    memory = null;
    try { localStorage.removeItem(KEY); } catch (_) {}
  },
  get isAdmin() { return this.get()?.role === 'admin'; },
  get isUser() { return this.get()?.role === 'user'; },
};

export class ApiError extends Error {
  constructor(status, data) {
    super((data && data.error) || 'Something went wrong. Try again.');
    this.status = status;
    this.data = data || {};
  }
}

export async function api(method, path, body) {
  const s = session.get();
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(s ? { Authorization: `Bearer ${s.token}` } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (_) {
    throw new ApiError(0, { error: 'Cannot reach the server. Check that the backend is running.' });
  }
  let data = null;
  try { data = await res.json(); } catch (_) {}
  if (!res.ok) {
    if (res.status === 401 && s) {
      session.clear();
      window.dispatchEvent(new Event('session-changed'));
    }
    throw new ApiError(res.status, data);
  }
  return data;
}
