// HTTP handling for the extract function: CORS, sign-in check, allowed emails, then extraction.
import { ExtractError, extractPage, validateInput } from './extract.ts';

export interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  ALLOWED_EMAILS?: string;
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });

export async function handle(req: Request, env: Env, fetchImpl: typeof fetch = fetch): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Use POST.' });
  try {
    // 1. Who is calling? Ask Supabase Auth to validate the bearer token.
    const auth = req.headers.get('authorization') || '';
    const apikey = req.headers.get('apikey') || env.SUPABASE_ANON_KEY || '';
    if (!/^bearer\s+\S+/i.test(auth)) throw new ExtractError(401, 'Sign in to read notebook pages.');
    const who = await fetchImpl(`${env.SUPABASE_URL}/auth/v1/user`, { headers: { authorization: auth, apikey } });
    if (!who.ok) throw new ExtractError(401, 'Your sign-in has expired. Sign in again.');
    const user = await who.json();
    const email = String(user?.email || '').toLowerCase();

    // 2. Only listed accounts may spend API credit.
    const allowed = (env.ALLOWED_EMAILS || '').split(/[,\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (!email || !allowed.includes(email)) throw new ExtractError(403, `${email || 'This account'} isn't allowed to read pages. Add it to the ALLOWED_EMAILS secret.`);

    if (!env.ANTHROPIC_API_KEY) throw new ExtractError(500, 'The ANTHROPIC_API_KEY secret is missing.');

    // 3. Read the page.
    const input = validateInput(await req.json().catch(() => null));
    const out = await extractPage(input, env.ANTHROPIC_API_KEY, fetchImpl);
    return json(200, out);
  } catch (e) {
    if (e instanceof ExtractError) return json(e.status, { error: e.message });
    console.error(e);
    return json(500, { error: 'Something went wrong reading this page.' });
  }
}
