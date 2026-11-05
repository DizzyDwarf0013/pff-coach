# PFF Coach

A trainer app for Pink Fitness Florida and private clients that installs on iPhone and iPad from the browser. It covers clients and intake, session logging, progress charts, shareable reports, and reading old notebook pages into the app.

## What's in v1

- **Clients.** Setup with a Pink Fitness switch, email and text opt-in with the date recorded, and a full intake built from the Personal Training Log with pre/postnatal fields added: due or delivery date, delivery type, diastasis recti, pelvic floor symptoms, and medical clearance.
- **Things to watch.** The intake produces review prompts, flags exercises in the catalog that conflict with it (for example, crunch-type flexion when diastasis is reported), and suggests a starting level. These are prompts for the trainer, not medical advice.
- **Sessions.** Each exercise shows its sets of weight and reps with "last time" numbers beside them, a nudge to add load when every set reached 12 or more reps, the post-session questions from the log, and autosave. You can plan a workout ahead, repeat the last one, or start a planned one.
- **Progress.** Charts for weight (with the goal line), muscle %, body fat, and waist, plus a strength chart per exercise (heaviest set and estimated 1-rep max) and a personal bests table. Weight after a session feeds the charts automatically.
- **Reports and workout sheets.** Pink Fitness clients get the logo and pink layout; private clients get an unbranded version with only the trainer's name. Either can be printed or saved as a PDF, or sent as a text. If the intake reports an eating disorder history, weight is left off by default.
- **Notebook import (1.1).** Photograph notebook pages or choose PDFs. Each page is read by Claude on a Supabase server into clients, sessions, measurements and group class plans. She reviews everything (names matched to existing clients, dates, sessions already logged, new exercises) before it's saved. Needs sign-in.
- **Classes (1.1).** Group class plans imported from notebooks, by month. Planning new classes comes next.
- **Client list import.** Bring in a client CSV exported from the website or a spreadsheet. Name, email, phone, and marketing opt-in columns are detected automatically, and duplicates are skipped.
- **Exercises.** 55 starter exercises tagged for care (lying on back, impact, core pressure, and so on), with the ability to add her own.
- **Backup.** Download a backup and restore it on another device.

## Sync between devices (1.2)

Once she signs in (**Settings → Account**), her clients, sessions, measurements, class plans, custom exercises and her details sync to her Supabase account and to every device she signs in on.

- Each device keeps a full copy and works offline. Changes queue up and send when there's a connection: a few seconds after an edit, when the app is opened, and every couple of minutes while it's open.
- The first time a device signs in, everything already on it is uploaded. Sample data never syncs.
- If the same record was changed on two devices, the newer change wins.
- **Erase this device** only clears that device and signs out; her account keeps the data.
- Data is stored in the `records` table (one JSON document per record) with row-level security, so each account can only read and change its own rows.

## Server side (Supabase)

Project `xvqamjaxutxfyzkbtigr`. The app signs in with Supabase Auth (email and password), syncs through the `records` table and the `sync_push` database function, and calls one Edge Function, `extract`, which checks the sign-in, checks the email against `ALLOWED_EMAILS`, and sends the page image to the Claude API. Page images aren't stored.

Database changes live in `supabase/migrations/` and are applied by the deploy workflow through the Supabase Management API.

`.github/workflows/keepalive.yml` runs a tiny query every day so the free project doesn't pause during quiet weeks. GitHub turns off scheduled workflows in a repository with no commits for 60 days; if that happens, re-enable it under **Actions → Keep Supabase awake**.

`.github/workflows/supabase.yml` runs whenever `supabase/` changes. It runs the function's tests, applies database changes, deploys the function, copies the secrets into Supabase, points sign-in emails at the app's address, and checks the function responds.

Repository secrets (Settings → Secrets and variables → Actions):

| Secret | What it is |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Personal access token from the Supabase account page |
| `SUPABASE_DB_PASSWORD` | The project's database password (kept for direct database work) |
| `ANTHROPIC_API_KEY` | Claude API key from platform.claude.com |
| `ALLOWED_EMAILS` | Comma-separated emails allowed to read pages |

To rerun the deploy after changing a secret: **Actions → Deploy Supabase → Run workflow**.

## Hosting (GitHub Pages)

The app is published with GitHub Pages. Every push to `main` runs `.github/workflows/pages.yml`, which compiles the TypeScript and deploys the `app/` folder. The address is `https://<github-username>.github.io/pff-coach/`.

To make a change, edit the files in `src/` (or `app/styles.css`), commit, and push. The site updates within a minute or two, and phones pick up the new version the next time the app is opened.

A custom address such as `coach.pinkfitnessflorida.com` can be added under the repo's **Settings → Pages → Custom domain**.

## Install on iPhone and iPad

1. Open the site in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Open it from the Home Screen. It runs full screen and works without a connection.

## Printing and PDFs on iOS

On a report or workout sheet, tap **Print or save PDF**. In the print preview, tap the share button to save the PDF to Files or send it in Messages or Mail.

## Changing the code

- Source is TypeScript in `src/`, compiled to `app/js/`. There are no other dependencies.
- To try it locally, run `python3 build.py` (needs the TypeScript compiler: `npm i -g typescript`), then serve `app/` with `python3 -m http.server` from inside it. The build also regenerates the offline cache list in `app/sw.js`. Compiled output isn't committed; the workflow builds it.
- `python3 build_preview.py` builds a single-file preview page (used for the claude.ai preview only).
- The server function lives in `supabase/functions/extract/`. Test it with `node --experimental-strip-types supabase/functions/extract/handler.test.ts`.
- `app/vendor/pdfjs/` is Mozilla's pdf.js (Apache-2.0), used to turn PDF pages into images in the browser.
- **Older iPads.** The app runs on iOS 12 and later (for example an iPad mini 2, 3 or 4). The TypeScript compiles to ES2019, `src/compat.ts` fills in missing browser features (dialogs, `structuredClone`, `File.text()`), and `styles.css` has fallbacks at the end for older Safari. Avoid newer syntax in `index.html`'s inline script. Reading PDFs needs a recent iOS; photos work everywhere. If the app can't start, it shows a message with the error and the iOS version instead of a blank page.
- The data model is in `src/types.ts`, intake rules are in `src/logic.ts`, and the exercise catalog is in `src/seed.ts`.

## Phase 2 roadmap

1. **Automated reminders and promotions.** Scheduled email and text sends to opted-in clients only, with unsubscribe handling. Texts need a provider such as Twilio and the usual opt-in rules.
2. **Website import.** Pull new sign-ups from OfferingTree automatically if it offers an API or webhook. If not, CSV export plus the existing import works today.
3. **Group fitness.** Class planner, class catalog, history of planned classes, and suggestions that rotate formats and avoid repeating recent workouts.
4. **Suggestions.** Next-session suggestions for personal training based on history, goals, and intake flags.
