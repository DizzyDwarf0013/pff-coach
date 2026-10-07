# PFF Coach

A trainer app for Pink Fitness Florida and private clients that installs on iPhone and iPad from the browser. Version 1 covers clients and intake, session logging, progress charts, and shareable reports.

## What's in v1

- **Clients.** Setup with a Pink Fitness switch, email and text opt-in with the date recorded, and a full intake built from the Personal Training Log with pre/postnatal fields added: due or delivery date, delivery type, diastasis recti, pelvic floor symptoms, and medical clearance.
- **Things to watch.** The intake produces review prompts, flags exercises in the catalog that conflict with it (for example, crunch-type flexion when diastasis is reported), and suggests a starting level. These are prompts for the trainer, not medical advice.
- **Sessions.** Each exercise shows its sets of weight and reps with "last time" numbers beside them, a nudge to add load when every set reached 12 or more reps, the post-session questions from the log, and autosave. You can plan a workout ahead, repeat the last one, or start a planned one.
- **Progress.** Charts for weight (with the goal line), muscle %, body fat, and waist, plus a strength chart per exercise (heaviest set and estimated 1-rep max) and a personal bests table. Weight after a session feeds the charts automatically.
- **Reports and workout sheets.** Pink Fitness clients get the logo and pink layout; private clients get an unbranded version with only the trainer's name. Either can be printed or saved as a PDF, or sent as a text. If the intake reports an eating disorder history, weight is left off by default.
- **Import.** Bring in a client CSV exported from the website or a spreadsheet. Name, email, phone, and marketing opt-in columns are detected automatically, and duplicates are skipped.
- **Exercises.** 55 starter exercises tagged for care (lying on back, impact, core pressure, and so on), with the ability to add her own.
- **Backup.** Download a backup and restore it on another device.

## Important: data lives on each device

In v1, everything is stored on the device it was entered on. **The iPhone and iPad do not sync yet.** Choose one device as the main one, and use **Settings → Download backup / Restore from backup** to move data between them. Download a backup regularly.

Syncing between devices is the first item for phase 2 (see below).

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
- The data model is in `src/types.ts`, intake rules are in `src/logic.ts`, and the exercise catalog is in `src/seed.ts`.

## Phase 2 roadmap

1. **Sync between iPhone and iPad.** Add a small hosted database with sign-in (Supabase's free tier fits) so both devices share data, with built-in backups.
2. **Automated reminders and promotions.** Scheduled email and text sends to opted-in clients only, with unsubscribe handling. Texts need a provider such as Twilio and the usual opt-in rules.
3. **Website import.** Pull new sign-ups from OfferingTree automatically if it offers an API or webhook. If not, CSV export plus the existing import works today.
4. **Notebook import.** Photograph notebook pages and have an AI model read them into clients, sessions, and class plans for her to review before saving. This needs an API key on the server side.
5. **Group fitness.** Class planner, class catalog, history of planned classes, and suggestions that rotate formats and avoid repeating recent workouts.
6. **Suggestions.** Next-session suggestions for personal training based on history, goals, and intake flags.
