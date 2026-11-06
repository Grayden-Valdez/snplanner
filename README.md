# Planner — Supernote yearly planner plugin

> **Coded with [Claude](https://claude.com/claude-code).** No human wrote a line of this —
> review accordingly before relying on it. The concept, requirements and on-device
> testing are by [Grayden Valdez](https://github.com/Grayden-Valdez); Claude wrote the code
> to that spec and direction.

A Supernote plugin (React Native + the official `sn-plugin-lib` SDK) that
generates a fully linked yearly planner as a single `.note` file and keeps
the overview pages in sync with where you have written.

Built from the scaffold of [jpmoo/compass](https://github.com/jpmoo/compass).

## What it makes

`Note/Planner <year>.note`, ~440 pages, in this order:

| Page kind | Count | Links on the page |
|---|---|---|
| Year at a glance | 1 | Q1–Q4, each whole mini-month box |
| Quarter | 4 | ‹ prev / next › quarter, year, each month title |
| Month | 12 | ‹ prev / next › month, quarter, year, every whole day cell, every week cell; To-do's / Notes below |
| Week (Sunday start) | 52–54 | ‹ prev / next › week, month, quarter, year, each day header band |
| Day | 7 per week | ‹ prev / next › day, week, month, quarter, year; To-do's, Notes, 7am–7pm schedule, gratitude |

Weeks follow each other chronologically with their seven day pages right
behind them, so swiping forward from a week walks through its days.
Week 1 is the week containing Jan 1; the spill-over days from the
neighbouring years get day pages too so every week is complete.

### ✓ marks

Write anything on a day page, then run **Planner → Sync ✓ marks**. The
plugin scans the day pages for handwriting and places a **✓** in that day's
cell on the week, month, quarter and year pages (and removes stale ones).
Each ✓ is itself a link: tap it to jump to that day. The details always
stay on the day page.

Supernote plugins only run when you tap them (the SDK has no background
hooks), so syncing is a button press: *This month* is quick, *Whole year*
scans all ~370 day pages.

## Install

1. Download `snplanner.snplg` from the latest GitHub Actions run (or Release).
2. Copy it to the **MyStyle** folder on the Supernote (USB transfer mode).
3. On the device: **Settings → Apps → Plugins → Add Plugin → snplanner.snplg**.

## Use

1. Open any note. Side menu → **Plugins → Planner**.
2. Enter the year and tap **Create planner**. This renders one background
   template per page into `MyStyle/Planner <year>/` and builds the note —
   expect several minutes; the plugin keeps the device awake.
3. Open **Note/Planner <year>.note**. Write on day pages.
4. From anywhere in the planner: **Plugins → Planner → Sync ✓ marks**.

## How it works

- `src/calendar.js` — pure page model (order, prev/next, parents).
- `src/layout.js` — pure layouts: produces draw-ops for the background
  template and the rectangles for link elements and ✓ slots. Designed at
  1920×2560 (Manta) and scaled to the real page size.
- `android/.../PlannerRenderModule.kt` — draws those ops onto an Android
  Canvas and writes the template PNGs.
- `src/planner.js` — `createNote` / `insertNotePage` with the templates,
  `insertElements` with text-link elements, and the ✓ reconciliation using
  `getElements` (stroke type 0) / `deleteElements`.
- `tools/preview.py` — renders the same ops with Pillow, so layouts can be
  checked on a computer: `npm run preview` → `build/preview/*.png`.
- `tools/test.js` — `npm test`: walks every page of several years and checks
  that all links resolve, prev/next are symmetric, and nothing is off-page.

## Build

CI (`.github/workflows/build.yml`) builds `snplanner.snplg` on every push and
attaches it as an artifact; pushing a `v*` tag also creates a Release.

Locally you need Node 18+, JDK 17, and the Android SDK
(`platforms;android-35`, `build-tools;35.0.0`, `ndk;27.1.12297006`):

```
npm install
./buildPlugin.sh        # → build/outputs/snplanner.snplg
```

## Known limits / things to verify on-device

- The `template` argument of `insertNotePage`/`createNote` is accepted as a
  path on some firmware and a name on others; the plugin tries the path
  first and falls back to the name. If creation fails on page 1, check
  whether templates need to live directly in `MyStyle` rather than a
  subfolder.
- Link text widths are estimated; if labels look clipped, enlarge the
  factors in `textWidth()` in `src/layout.js`.
- Templates total roughly 50–80 MB per planner year.
- Not yet tested on hardware — please report what you see.

## Link appearance

Every link is an invisible hit area covering its whole box (nav tile, mini-month,
day cell, day header). The words are printed by the page template; Supernote
draws only its small clip badge at the box's bottom-right corner. Year-page day
cells are too small for a badge each, so there the mini-month box is the link.
✓ marks are plain text elements (no badge). Picked on-device with the plugin's
"Link style test" button.
