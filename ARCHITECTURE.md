# Architecture

## Principle

The viewer's data never touches infrastructure we run. Everything personal is
computed and stored client-side; servers exist only for things that are the
same for every viewer.

## Phase 1 — shipped: the static core

```
web (GitHub Pages, vanilla ES modules, zero build step)
├── lib/csv.js            CSV parser (quotes, CRLF, embedded newlines)
├── lib/export-parse.js   Letterboxd export → data object
├── lib/enrich.js         TMDB enrichment (browser or Node, cache-first)
├── lib/insights.js       the pure insights engine (~40 computed views)
├── lib/recs.js           ranker + canon + syllabus content + lexicon
├── lib/shelves.js        client-side recommendation shelves
├── lib/school.js         transcript grader (pure, tested)
├── lib/store.js          IndexedDB (print + TMDB cache)
├── lib/render.js         hand-rolled SVG charts (heatmaps, map, century…)
└── assets/app.js         landing/darkroom + five-page orchestration
```

Build-time tools (Node, run by a maintainer, output committed):
- `tools/make-syllabus.mjs` — resolves the 31-course syllabus against TMDB
  once (ids, posters, directors — marquee name wins on co-directions).
- `tools/make-demo.mjs` — develops the fictional demo print.
- `tools/make-worldmap.mjs` — Natural Earth GeoJSON → SVG country paths.

## Phase 2 — planned: the edges

### `api/` — Rust on Cloudflare Workers (free tier)
- `GET /teaser/:username` — fetches the public Letterboxd RSS feed
  (last ~50 films), normalizes it, caches at the edge. Powers the landing-page
  hook: type a username, see a 30-second preview, then be sold on the full
  export. The worker exists because browsers can't read the feed directly
  (no CORS) — it holds no state and sees no export data.
- `GET /tmdb/*` — a caching proxy so the TMDB key stops shipping to browsers.

### `pipeline/` — Go in GitHub Actions (zero hosting)
- Weekly job: download IMDb's `title.ratings.tsv.gz` (25 MB), prune to
  films with ≥1000 votes, emit `data/imdb-slice.json` (~2 MB) the browser can
  join against — an IMDb second opinion on every shelf and syllabus film.
- Refreshes `data/syllabus.json` so posters and crowd ratings never rot.

### Explicit non-goals
- No accounts, no database, no server-side storage of viewer data — ever.
- No scraping of Letterboxd. The export and the public RSS feed are the only
  data sources, both initiated by their owner.
