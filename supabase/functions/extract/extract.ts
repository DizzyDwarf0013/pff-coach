// Reads one notebook page with Claude and returns structured data.
// Pure module (no Deno APIs) so it can be unit-tested with Node.

export const MODELS: Record<string, string> = {
  sonnet: 'claude-sonnet-5-5',
  haiku: 'claude-haiku-5-5',
};

export interface ExtractInput {
  image: { media_type: string; data: string };
  model?: string;
  catalog?: string[];
  clients?: string[];
  today?: string;
  yearHint?: number | null;
}

const num = { type: ['number', 'null'] };
const str = { type: ['string', 'null'] };

const exercise = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Exercise name as written, expanded from shorthand where obvious.' },
    catalog_match: { ...str, description: 'Exact name from the catalog list if this is clearly the same exercise, otherwise null.' },
    category: { type: 'string', enum: ['Lower body', 'Upper body', 'Core', 'Cardio', 'Mobility'] },
    measure: { type: 'string', enum: ['weight_reps', 'reps', 'time'], description: 'weight_reps if a load is recorded, reps for bodyweight reps, time for holds or timed work.' },
    sets: {
      type: 'array',
      description: 'One entry per set. "3x10 @ 15" becomes three sets of {weight_lb: 15, reps: 10}.',
      items: { type: 'object', properties: { weight_lb: num, reps: num, seconds: num }, required: ['weight_lb', 'reps', 'seconds'] },
    },
    notes: str,
  },
  required: ['name', 'catalog_match', 'category', 'measure', 'sets', 'notes'],
};

export const TOOL = {
  name: 'record_notebook_page',
  description: 'Record everything legible on one page of a personal trainer\'s notebook.',
  input_schema: {
    type: 'object',
    properties: {
      page_kind: { type: 'string', enum: ['client_profile', 'client_sessions', 'group_class', 'mixed', 'other'] },
      clients: {
        type: 'array',
        description: 'Personal training clients that appear on the page.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Client name as written. If only a first name is written, use just that.' },
            email: str,
            phone: str,
            pink_fitness: { type: ['boolean', 'null'], description: 'true only if the page says this is a Pink Fitness client, false only if it says private/outside; otherwise null.' },
            profile: {
              type: 'object',
              description: 'Intake or background facts written on the page. Use null for anything not written.',
              properties: {
                height_in: num, start_weight_lb: num, goal_weight_lb: num, muscle_pct: num, body_fat_pct: num,
                age: num, dob: { ...str, description: 'YYYY-MM-DD' },
                pregnancy_status: { type: ['string', 'null'], enum: ['pregnant', 'postpartum', 'none', null] },
                due_date: { ...str, description: 'YYYY-MM-DD' },
                delivery_date: { ...str, description: 'YYYY-MM-DD' },
                goals: { type: 'array', items: { type: 'string' } },
                medical: { ...str, description: 'Injuries, conditions, limitations, modifications noted.' },
                notes: str,
              },
              required: ['height_in', 'start_weight_lb', 'goal_weight_lb', 'muscle_pct', 'body_fat_pct', 'age', 'dob', 'pregnancy_status', 'due_date', 'delivery_date', 'goals', 'medical', 'notes'],
            },
            sessions: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  date: { ...str, description: 'YYYY-MM-DD, or null if no date is written.' },
                  date_text: { ...str, description: 'The date exactly as written.' },
                  exercises: { type: 'array', items: exercise },
                  body_weight_lb: num,
                  muscle_pct: num,
                  notes: str,
                },
                required: ['date', 'date_text', 'exercises', 'body_weight_lb', 'muscle_pct', 'notes'],
              },
            },
            measurements: {
              type: 'array',
              description: 'Body measurements recorded outside of a session (weigh-ins, check-ins).',
              items: {
                type: 'object',
                properties: { date: str, weight_lb: num, muscle_pct: num, body_fat_pct: num, waist_in: num, notes: str },
                required: ['date', 'weight_lb', 'muscle_pct', 'body_fat_pct', 'waist_in', 'notes'],
              },
            },
          },
          required: ['name', 'email', 'phone', 'pink_fitness', 'profile', 'sessions', 'measurements'],
        },
      },
      classes: {
        type: 'array',
        description: 'Group fitness class plans on the page.',
        items: {
          type: 'object',
          properties: {
            date: str,
            date_text: str,
            title: { ...str, description: 'Class name or theme if written.' },
            format: { ...str, description: 'Structure such as circuit, EMOM, AMRAP, intervals, with timings.' },
            exercises: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  catalog_match: str,
                  detail: { ...str, description: 'Reps, time, rounds, equipment or modifications for this move.' },
                },
                required: ['name', 'catalog_match', 'detail'],
              },
            },
            notes: str,
          },
          required: ['date', 'date_text', 'title', 'format', 'exercises', 'notes'],
        },
      },
      unclear: {
        type: 'array',
        description: 'Short descriptions of anything on the page you could not read or were unsure about.',
        items: { type: 'string' },
      },
    },
    required: ['page_kind', 'clients', 'classes', 'unclear'],
  },
};

export function systemPrompt(input: ExtractInput): string {
  const today = input.today || new Date().toISOString().slice(0, 10);
  const year = input.yearHint ? `Pages without a year are from ${input.yearHint}.` : `If a date has no year, use the most recent date on or before ${today} that matches.`;
  return [
    'You transcribe pages from a certified personal trainer\'s handwritten or printed notebooks into structured records.',
    'She runs pre/postnatal and women\'s group classes (Pink Fitness Florida) and trains private clients.',
    'Rules:',
    '- Record only what is on the page. Never invent clients, numbers, dates or exercises. Use null when something is not written.',
    '- Weights are in pounds unless marked kg; convert kg to lb (1 kg = 2.2046 lb). "BW" means bodyweight: weight_lb null.',
    '- Expand set shorthand: "3x10 @ 15" or "15x10x3" are three sets of 10 reps at 15 lb. "15/12/10" under a reps column is three sets with those reps.',
    '- Times like "30s", ":45", "1:30" become seconds.',
    `- Dates become YYYY-MM-DD. Today is ${today}. ${year} US date order (month/day).`,
    '- Put a session under the client it belongs to. A page with a class plan and no client names is a group class.',
    '- For catalog_match, use an exact name from the catalog only when it is clearly the same movement; otherwise null.',
    '- If handwriting is ambiguous, give your best reading and add a short note to unclear.',
  ].join('\n');
}

export function userText(input: ExtractInput): string {
  const catalog = (input.catalog || []).slice(0, 400).join('; ');
  const clients = (input.clients || []).slice(0, 400).join('; ');
  return [
    'Transcribe this notebook page with the record_notebook_page tool.',
    catalog ? `Exercise catalog: ${catalog}` : '',
    clients ? `Clients already in the app (match spelling when it is clearly the same person): ${clients}` : '',
  ].filter(Boolean).join('\n\n');
}

export function buildRequest(input: ExtractInput) {
  const model = MODELS[input.model || 'sonnet'] || MODELS.sonnet;
  return {
    model,
    max_tokens: 8192,
    system: systemPrompt(input),
    tools: [TOOL],
    tool_choice: { type: 'tool', name: TOOL.name },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: input.image.media_type, data: input.image.data } },
        { type: 'text', text: userText(input) },
      ],
    }],
  };
}

export class ExtractError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function validateInput(body: unknown): ExtractInput {
  const b = body as ExtractInput;
  if (!b || typeof b !== 'object' || !b.image || typeof b.image.data !== 'string') throw new ExtractError(400, 'Send one page image.');
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(b.image.media_type)) throw new ExtractError(400, 'Images must be JPEG, PNG, WebP or GIF.');
  if (b.image.data.length > 7_000_000) throw new ExtractError(413, 'That page image is too large. Try a smaller photo.');
  return b;
}

/** Calls the Claude Messages API and returns the tool input. */
export async function extractPage(input: ExtractInput, apiKey: string, fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify(buildRequest(input)),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `status ${res.status}`;
    if (res.status === 401) throw new ExtractError(502, 'The Claude API key was rejected. Check the ANTHROPIC_API_KEY secret.');
    if (res.status === 400 && /credit balance/i.test(msg)) throw new ExtractError(502, 'The Claude account is out of credit. Add credit at platform.claude.com.');
    if (res.status === 429 || res.status === 529) throw new ExtractError(503, 'Claude is busy right now. Try this page again in a minute.');
    throw new ExtractError(502, `Claude couldn't read the page (${msg}).`);
  }
  if (data.stop_reason === 'max_tokens') throw new ExtractError(422, 'This page has more on it than can be read in one go. Try photographing half the page at a time.');
  const block = (data.content || []).find((c: any) => c.type === 'tool_use' && c.name === TOOL.name);
  if (!block) throw new ExtractError(502, 'Claude didn\'t return any results for this page.');
  return { result: block.input, model: data.model, usage: data.usage };
}
