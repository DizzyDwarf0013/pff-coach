// Run with: node --experimental-strip-types supabase/functions/extract/handler.test.ts
import { handle } from './handler.ts';
import { buildRequest, TOOL } from './extract.ts';

let failures = 0;
const check = (name: string, ok: boolean, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

const env = { SUPABASE_URL: 'https://proj.supabase.co', SUPABASE_ANON_KEY: 'anon', ANTHROPIC_API_KEY: 'sk-test', ALLOWED_EMAILS: 'coach@example.com, Other@Example.com' };
const sample = { page_kind: 'client_sessions', clients: [{ name: 'Ann', sessions: [] }], classes: [], unclear: [] };

let lastClaudeBody: any = null;
function mockFetch(opts: { user?: string | null; claudeStatus?: number; claudeBody?: any } = {}): typeof fetch {
  return (async (url: any, init: any = {}) => {
    const u = String(url);
    if (u.endsWith('/auth/v1/user')) {
      if (opts.user === null) return new Response('{}', { status: 401 });
      return Response.json({ email: opts.user ?? 'coach@example.com' });
    }
    if (u === 'https://api.anthropic.com/v1/messages') {
      lastClaudeBody = JSON.parse(init.body);
      if (init.headers['x-api-key'] !== 'sk-test') return Response.json({ error: { message: 'bad key' } }, { status: 401 });
      return Response.json(opts.claudeBody ?? { model: 'claude-sonnet-5-5', stop_reason: 'tool_use', usage: { input_tokens: 3000, output_tokens: 900 }, content: [{ type: 'tool_use', name: TOOL.name, input: sample }] }, { status: opts.claudeStatus ?? 200 });
    }
    throw new Error('unexpected fetch ' + u);
  }) as typeof fetch;
}

const req = (body: unknown, headers: Record<string, string> = { authorization: 'Bearer user-jwt', apikey: 'pub' }) =>
  new Request('https://proj.supabase.co/functions/v1/extract', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
const page = { image: { media_type: 'image/jpeg', data: 'AAAA' }, model: 'sonnet', catalog: ['Goblet squat'], clients: ['Ann Lee'], today: '2026-10-08' };

const opt = await handle(new Request('https://x/functions/v1/extract', { method: 'OPTIONS' }), env);
check('OPTIONS answers CORS preflight', opt.status === 204 && opt.headers.get('access-control-allow-origin') === '*');

let r = await handle(req(page, {}), env, mockFetch());
check('no sign-in → 401', r.status === 401);

r = await handle(req(page), env, mockFetch({ user: null }));
check('expired token → 401', r.status === 401);

r = await handle(req(page), env, mockFetch({ user: 'stranger@example.com' }));
check('email not on list → 403', r.status === 403);

r = await handle(req(page), { ...env, ALLOWED_EMAILS: '' }, mockFetch());
check('empty allow list denies everyone', r.status === 403);

r = await handle(req(page), env, mockFetch({ user: 'other@example.com' }));
check('allow list is case-insensitive', r.status === 200, String(r.status));

r = await handle(req({ image: { media_type: 'application/pdf', data: 'x' } }), env, mockFetch());
check('rejects non-image', r.status === 400);

r = await handle(req(page), env, mockFetch());
const body = await r.json();
check('signed-in, allowed → 200 with result', r.status === 200 && body.result.clients[0].name === 'Ann', JSON.stringify(body));
check('forces the tool', lastClaudeBody.tool_choice.name === 'record_notebook_page');
check('uses Sonnet by default', lastClaudeBody.model === 'claude-sonnet-5-5');
check('sends image then text', lastClaudeBody.messages[0].content[0].type === 'image' && lastClaudeBody.messages[0].content[1].text.includes('Goblet squat'));
check('passes existing client names', lastClaudeBody.messages[0].content[1].text.includes('Ann Lee'));
check('system prompt has today', lastClaudeBody.system.includes('2026-10-08'));

check('haiku model id', buildRequest({ ...page, model: 'haiku' }).model === 'claude-haiku-5-5');
check('year hint used', buildRequest({ ...page, yearHint: 2024 }).system.includes('from 2024'));

r = await handle(req(page), { ...env, ANTHROPIC_API_KEY: 'wrong' }, mockFetch());
check('bad API key → clear 502', r.status === 502 && (await r.json()).error.includes('ANTHROPIC_API_KEY'));

r = await handle(req(page), env, mockFetch({ claudeStatus: 400, claudeBody: { error: { message: 'Your credit balance is too low' } } }));
check('no credit → clear message', (await r.json()).error.includes('out of credit'));

r = await handle(req(page), env, mockFetch({ claudeBody: { stop_reason: 'max_tokens', content: [] } }));
check('truncated output → 422', r.status === 422);

r = await handle(req(page), env, mockFetch({ claudeStatus: 529, claudeBody: { error: { message: 'Overloaded' } } }));
check('overloaded → 503', r.status === 503);

console.log(failures ? `\n${failures} failed` : '\nall passed');
if (failures) process.exit(1);
