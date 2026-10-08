// Sign-in with Supabase Auth (email + password), using its REST API directly.
import * as db from './db.js';
import { html, Raw, toast } from './util.js';

// The project URL and publishable key are meant to be public; data is protected by sign-in.
const CONFIG = {
  url: 'https://xvqamjaxutxfyzkbtigr.supabase.co',
  key: 'sb_publishable_inb7y1Gu5DBI5-GUtrKQbw_ev8kaP9N',
  ...((window as any).__PFF_CONFIG__ || {}),
};
export const SUPABASE_URL: string = CONFIG.url;
export const SUPABASE_KEY: string = CONFIG.key;
export const SITE_URL = 'https://dizzydwarf0013.github.io/pff-coach/';

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  expires_at: number; // seconds since epoch
  email: string;
}

export class AuthError extends Error {}

const META_KEY = 'auth';
let cached: AuthSession | null | undefined;

async function call(path: string, body: unknown, token?: string) {
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    throw new AuthError('Couldn’t reach the sign-in service. Check the connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg: string = data.msg || data.error_description || data.message || data.error || '';
    if (/invalid login credentials/i.test(msg)) throw new AuthError('That email and password don’t match.');
    if (/email not confirmed/i.test(msg)) throw new AuthError('Confirm your email first. Check your inbox for the link, then sign in.');
    if (/already registered/i.test(msg)) throw new AuthError('That email already has an account. Sign in instead.');
    if (/password/i.test(msg) && /characters/i.test(msg)) throw new AuthError('Use a password of at least 8 characters.');
    if (res.status === 429) throw new AuthError('Too many attempts. Wait a minute and try again.');
    throw new AuthError(msg || `Sign-in failed (status ${res.status}).`);
  }
  return data;
}

function fromTokenResponse(d: any): AuthSession {
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    email: d.user?.email || '',
  };
}

async function store(s: AuthSession | null) {
  cached = s;
  await db.setMeta(META_KEY, s);
  document.dispatchEvent(new CustomEvent('auth-change'));
}

export async function signIn(email: string, password: string) {
  const d = await call('token?grant_type=password', { email, password });
  await store(fromTokenResponse(d));
}

/** Creates the account. Returns true if she's signed in right away, false if a confirmation email was sent. */
export async function signUp(email: string, password: string): Promise<boolean> {
  const d = await call(`signup?redirect_to=${encodeURIComponent(SITE_URL)}`, { email, password });
  if (d.access_token) { await store(fromTokenResponse(d)); return true; }
  return false;
}

export async function signOut() {
  const s = await session();
  if (s) { try { await call('logout', {}, s.access_token); } catch { /* signing out locally is what matters */ } }
  await store(null);
}

/** The current session, refreshed if it is about to expire. Null when signed out. */
export async function session(): Promise<AuthSession | null> {
  if (cached === undefined) cached = (await db.getMeta<AuthSession | null>(META_KEY)) || null;
  if (!cached) return null;
  if (cached.expires_at - 60 > Date.now() / 1000) return cached;
  try {
    const d = await call('token?grant_type=refresh_token', { refresh_token: cached.refresh_token });
    const next = fromTokenResponse(d);
    if (!next.email) next.email = cached.email;
    await store(next);
    return next;
  } catch (e) {
    // Offline: keep the old session so the app still shows her as signed in; calls will retry later.
    if (!navigator.onLine) return cached;
    await store(null);
    return null;
  }
}

export async function currentEmail(): Promise<string | null> {
  if (cached === undefined) cached = (await db.getMeta<AuthSession | null>(META_KEY)) || null;
  return cached?.email || null;
}

/**
 * Supabase sends people back to the site with tokens in the URL after they confirm their email.
 * Pick those up, sign in, and clean the address bar.
 */
export async function consumeRedirect(): Promise<void> {
  const h = location.hash;
  if (!/access_token=|error_description=/.test(h)) return;
  const p = new URLSearchParams(h.replace(/^#/, ''));
  history.replaceState(null, '', location.pathname + '#/settings');
  if (p.get('error_description')) { setTimeout(() => toast(p.get('error_description')!.replace(/\+/g, ' ')), 300); return; }
  try {
    const token = p.get('access_token')!;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${token}` } });
    const user = res.ok ? await res.json() : {};
    await store({ access_token: token, refresh_token: p.get('refresh_token') || '', expires_at: Number(p.get('expires_at')) || Math.floor(Date.now() / 1000) + Number(p.get('expires_in') || 3600), email: user.email || '' });
    setTimeout(() => toast('Email confirmed. You’re signed in.'), 300);
  } catch {
    setTimeout(() => toast('Email confirmed. Sign in to continue.'), 300);
  }
}

/** Calls a Supabase Edge Function as the signed-in user. */
export async function callFunction<T>(name: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const s = await session();
  if (!s) throw new AuthError('Sign in to continue.');
  let res: Response;
  try {
    res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: { apikey: SUPABASE_KEY, authorization: `Bearer ${s.access_token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new Error('Couldn’t reach the server. Check the connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) { await store(null); throw new AuthError(data.error || 'Sign in again to continue.'); }
  if (res.status === 404) throw new Error('The page-reading service isn’t set up yet.');
  if (!res.ok) throw new Error(data.error || `The server returned an error (${res.status}).`);
  return data as T;
}

/** Sign-in / create-account form. Call bindAuthForm on the container after inserting it. */
export function authForm(intro?: string): Raw {
  return html`
    <form class="auth-form" novalidate>
      ${intro ? html`<p>${intro}</p>` : ''}
      <div class="grid">
        <label class="field"><span class="label">Email</span><input name="email" type="email" inputmode="email" autocomplete="username" required></label>
        <label class="field"><span class="label">Password</span><input name="password" type="password" autocomplete="current-password" minlength="8" required></label>
      </div>
      <p class="auth-msg" role="alert" hidden></p>
      <div class="row-end">
        <button type="button" class="btn ghost" data-auth="signup">Create account</button>
        <button class="btn primary" data-auth="signin">Sign in</button>
      </div>
    </form>`;
}

export function bindAuthForm(root: ParentNode, onDone: () => void) {
  const form = root.querySelector('.auth-form') as HTMLFormElement | null;
  if (!form) return;
  const msg = form.querySelector('.auth-msg') as HTMLElement;
  const say = (text: string, kind: 'error' | 'info' = 'error') => { msg.textContent = text; msg.className = `auth-msg ${kind}`; msg.hidden = false; };
  const run = async (mode: 'signin' | 'signup') => {
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
    const password = (form.elements.namedItem('password') as HTMLInputElement).value;
    if (!email || !email.includes('@')) return say('Enter your email address.');
    if (password.length < 8) return say('Use a password of at least 8 characters.');
    const buttons = Array.from(form.querySelectorAll('button')) as HTMLButtonElement[];
    buttons.forEach((b) => (b.disabled = true));
    try {
      if (mode === 'signin') { await signIn(email, password); toast('Signed in'); onDone(); }
      else if (await signUp(email, password)) { toast('Account created'); onDone(); }
      else say(`Check ${email} for a confirmation link. After confirming, come back here and sign in.`, 'info');
    } catch (e) {
      say((e as Error).message);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  };
  form.addEventListener('submit', (e) => { e.preventDefault(); run('signin'); });
  form.querySelector('[data-auth="signup"]')!.addEventListener('click', () => run('signup'));
}
