// Supabase Edge Function entry point: POST one notebook page image, get structured records back.
import { handle } from './handler.ts';

Deno.serve((req: Request) =>
  handle(req, {
    SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
    SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
    ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY'),
    ALLOWED_EMAILS: Deno.env.get('ALLOWED_EMAILS'),
  }),
);
