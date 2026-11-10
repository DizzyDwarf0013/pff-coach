# PFF Coach

A trainer app for Pink Fitness Florida and private clients that installs on iPhone and iPad from the browser. It covers clients and intake, session logging, progress charts, shareable reports, and reading old notebook pages into the app.

## What's in v1

- **Clients.** Setup with a Pink Fitness switch, email and text opt-in with the date recorded, and a full intake built from the Personal Training Log with pre/postnatal fields added: due or delivery date, delivery type, diastasis recti, pelvic floor symptoms, and medical clearance.
- **Things to watch.** The intake produces review prompts, flags exercises in the catalog that conflict with it (for example, crunch-type flexion when diastasis is reported), and suggests a starting level. These are prompts for the trainer, not medical advice.
- **Sessions.** Each exercise shows its sets of weight and reps with "last time" numbers beside them, a nudge to add load when every set reached 12 or more reps, the post-session questions from the log, and autosave. You can plan a workout ahead, repeat the last one, or start a planned one.
- **Planning a workout (1.4).** Start session and Plan a workout open on four ways to begin:
  - **Suggested.** What's due next from how they rotate (upper, lower, full-body or core days, done least recently) and their weekly schedule (a kind of day they nearly always do on that weekday). It's built from their latest workout of that kind, or the one before last if they always train the same kind, with their latest numbers and weight added where every set reached 12+ reps. Notes from that day (yours, their feedback, their least favorite, exercise notes) and anything their intake now flags are shown.
  - **Generate a new workout.** Pick a focus and how many exercises. It keeps their one or two staple lifts for that focus so progress carries on, fills the rest of their usual layout with exercises they haven't done lately or haven't tried, and leaves out anything flagged by their intake or marked least favorite recently. Shuffle the whole mix, or swap or remove single exercises before using it.
  - **Repeat a past workout.** Any of their last 15, filterable by kind of day, using their latest numbers.
  - **Start from scratch.**
  - **Goals (1.4).** Their intake goals and the "In their words" box shape all of the above. Gain strength: 8-rep targets, weight goes up once every set reaches 10, loadable exercises preferred. Lose weight: 12-rep targets (15 before adding weight) and a low-impact cardio finisher. Maintain current or pregnancy: the load is held steady. Prenatal and postpartum: a core and pelvic floor block, with prenatal-friendly and pelvic floor exercises preferred. A lift they name ("deadlift my bodyweight") is kept in when the day's focus fits, and words like back pain, posture, glutes, core, leaking or stamina tilt the picks. The plan screen shows their goals and what they change. The in-session "try more weight" hint follows the same rule.
  - **Swap.** In a generated workout and on every exercise in a session, Swap opens a sheet of comparable exercises: the same muscle group, closest movement first (a squat for a squat), then ones they have done, with their last numbers. Exercises their intake flags are listed after the rest with the reason. A search covers the whole catalog for something completely different, and a new exercise can be added from the sheet. In a session, the swapped-in exercise starts from their last numbers for it and its note records what it replaced (e.g. "Swapped in for Leg press").
  - Muscle groups are worked out from exercise names and categories (`src/planlogic.ts`); group classes don't count toward their rotation. In a session, each exercise also shows their note from last time.
- **Progress.** Charts for weight (with the goal line), muscle %, body fat, and waist, plus a strength chart per exercise (heaviest set and estimated 1-rep max) and a personal bests table. Weight after a session feeds the charts automatically.
- **Reports and workout sheets.** Pink Fitness clients get the logo and pink layout; private clients get an unbranded version with only the trainer's name. Either can be printed or saved as a PDF, or sent as a text. If the intake reports an eating disorder history, weight is left off by default.
- **Notebook import (1.1).** Photograph notebook pages or choose PDFs. Each page is read by Claude on a Supabase server into clients, sessions, measurements and group class plans. You review everything (names matched to existing clients, dates, sessions already logged, new exercises) before it's saved. Needs sign-in.
- **Classes (1.3).** Plan group classes: date, start time, length, type and name, who's coming, and the workout in sections (warm-up, workout, cool-down) with sets/reps or time and easier and harder options for each move. Each attendee gets the class filed in their log (planned until it's marked as taught, then in their history); taking someone off removes it from their log, and deleting the class removes it everywhere. Exercises that conflict with an attendee's intake are flagged with their name.
  - **Build from past classes.** Repeat the last class of the same type or name, bring back one that hasn't been taught in a few weeks, or browse and search every past class. *Plan one like this* on any class starts a copy.
  - **Ideas.** Once a type or name is set, moves from similar past classes are suggested, favorites that haven't been used lately first, with a note when the plan repeats much of the last one. Notebook-imported class plans count as history.
  - Class entries in a client's log open the class; they aren't offered as private workouts to repeat or start.
- **Client list import.** Bring in a client CSV exported from the website or a spreadsheet. Name, email, phone, and marketing opt-in columns are detected automatically, and duplicates are skipped.
- **Exercises.** 55 starter exercises tagged for care (lying on back, impact, core pressure, and so on), with the ability to add your own.
- **Exercise cards (1.5).** Every exercise has a card: a start → finish picture with an arrow for the movement, three steps, coaching cues, breathing, easier and harder options, and a pregnancy note. Tap an exercise name anywhere (a session, the workout planner, the class planner and class pages, or the **i** in the exercise and swap pickers) to open it and show the client. Shared workout sheets show a small picture and two cues beside each exercise, followed by pages with the full cards (switch off with **Include exercise cards**).
  - The pictures aren't image files: `src/figure.ts` draws the figure from joint angles (side and front views, props like benches, cables, bands and machines), and `src/poses.ts` holds about 100 movement templates. Exercises map to a template by name, and new exercises get a best guess from their name, so every exercise has a picture.
  - The text for all 128 exercises in the catalog is in `src/exerciseInfo.ts`. Edit any card from **Exercises → the exercise → Exercise card** (with a live preview); only the fields you change are saved, and **Reset to built-in** undoes them. Six names were left for you to describe: Ball pass, Crab dance, Z core move, Hip shift, Dependent curl and Rope pull. They show **Needs card text** in the list.
- **Backup.** Download a backup and restore it on another device.

## Sync between devices (1.2)

Once you sign in (**Settings → Account**), your clients, sessions, measurements, class plans, custom exercises and details sync to your Supabase account and to every device you sign in on.

- Each device keeps a full copy and works offline. Changes queue up and send when there's a connection: a few seconds after an edit, when the app is opened, and every couple of minutes while it's open.
- The first time a device signs in, everything already on it is uploaded. Sample data never syncs.
- If the same record was changed on two devices, the newer change wins.
- **Erase this device** only clears that device and signs out; your account keeps the data.
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

iPhone and iPad can't print from a Home Screen app, so on iOS **Print or save PDF** makes the PDF on the device instead (`src/pdfExport.ts`, using the vendored `app/vendor/html2canvas`, MIT). The sheet or report is drawn into Letter pages, breaking between table rows and cards, and the exercise cards start on a new page. Tap **Share, print or save** to open the share menu with Print, Save to Files, Messages and Mail. On a computer the button opens the normal print window. On phones, the on-screen sheet uses a compact layout with the sets under each exercise; the PDF always uses the full layout.

## Changing the code

- Source is TypeScript in `src/`, compiled to `app/js/`. There are no other dependencies.
- To try it locally, run `python3 build.py` (needs the TypeScript compiler: `npm i -g typescript`), then serve `app/` with `python3 -m http.server` from inside it. The build also regenerates the offline cache list in `app/sw.js`. Compiled output isn't committed; the workflow builds it.
- `python3 build_preview.py` builds a single-file preview page (used for the claude.ai preview only).
- The server function lives in `supabase/functions/extract/`. Test it with `node --experimental-strip-types supabase/functions/extract/handler.test.ts`.
- `app/vendor/pdfjs/` is Mozilla's pdf.js (Apache-2.0), used to turn PDF pages into images in the browser.
- **Older iPads.** The app runs on iOS 12 and later (for example an iPad mini 2, 3 or 4). The TypeScript compiles to ES2019, `src/compat.ts` fills in missing browser features (dialogs, `structuredClone`, `File.text()`), and `styles.css` has fallbacks at the end for older Safari. Avoid newer syntax in `index.html`'s inline script. Reading PDFs needs a recent iOS; photos work everywhere. If the app can't start, it shows a message with the error and the iOS version instead of a blank page.
- The data model is in `src/types.ts`, intake rules are in `src/logic.ts`, class suggestions and filing are in `src/classlogic.ts`, workout suggestions and the generator are in `src/planlogic.ts`, exercise cards are in `src/figure.ts`, `src/poses.ts` and `src/exerciseInfo.ts`, and the exercise catalog is in `src/seed.ts`.

## Phase 2 roadmap

1. **Automated reminders and promotions.** Scheduled email and text sends to opted-in clients only, with unsubscribe handling. Texts need a provider such as Twilio and the usual opt-in rules.
2. **Website import.** Pull new sign-ups from OfferingTree automatically if it offers an API or webhook. If not, CSV export plus the existing import works today.
3. **Group fitness.** Class planner, history and move suggestions are done (1.3). Still open: a printable class sheet and suggestions that rotate class types across the week.
4. **Suggestions.** Next-session suggestions and generated workouts for personal training, shaped by intake goals, are done (1.4).
