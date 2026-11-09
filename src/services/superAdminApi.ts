const API = '/api';
const TOKEN_KEY = 'shopmate_sa_token';

export const saToken = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
  },
  set: (t: string) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch { /* storage unavailable */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY); } catch { /* storage unavailable */ }
  },
};

export class SuperAdminAuthError extends Error {}

async function parse(res: Response, fallback: string) {
  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const body = isJson ? await res.json().catch(() => ({})) : {};
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      // On the sign-in call itself a 401 just means "wrong credentials"; elsewhere it means the session ended.
      throw new SuperAdminAuthError((body as any).error || fallback);
    }
    throw new Error((body as any).error || fallback);
  }
  return body as any;
}

export const superAdminApi = {
  async login(email: string, password: string): Promise<{ user: any; token: string }> {
    const res = await fetch(`${API}/superadmin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return parse(res, 'Sign-in failed');
  },

  async loginWithGoogle(credential: string): Promise<{ user: any; token: string }> {
    const res = await fetch(`${API}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, mode: 'login', portal: 'superadmin' }),
    });
    return parse(res, 'Google sign-in failed');
  },

  async get(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '' && v !== false) qs.set(k, String(v === true ? '1' : v));
    const res = await fetch(`${API}/superadmin${path}${qs.toString() ? `?${qs}` : ''}`, {
      headers: { Authorization: `Bearer ${saToken.get() || ''}` },
    });
    return parse(res, 'Could not load data');
  },
};
