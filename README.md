# Matinée

**Your film life, developed in your browser.**

Drop your Letterboxd export onto the page and Matinée develops the whole
print locally: watching stats, poster walls, a world map of your cinema, a
century timeline, taste-weighted recommendations, and a four-year film-school
transcript graded from your own ratings — all computed **inside your
browser**, stored **only in your browser**.

There is no server. No account. No analytics. We could not see your data if
we wanted to.

## How it works

```
your Letterboxd ZIP ──▶ parsed in-tab ──▶ TMDB garnish (your browser ⇄ TMDB)
                                  │
                                  ▼
                    insights + shelves + transcript
                                  │
                                  ▼
                        IndexedDB (this browser only)
```

1. Export your data from Letterboxd (**Settings → Data → Export**).
2. Drop the ZIP (or the CSVs inside it) onto the landing page.
3. The darkroom narrates the develop: your films are matched against TMDB
   from your own browser, insights are computed, shelves are cut.
4. The finished print lives in your browser's IndexedDB. **Eject** wipes it.

Not sure yet? The landing page carries a **demo print** — a fictional
cinephile's finished dashboard — so you can walk every room first.

## The rooms

| Page | What hangs there |
| --- | --- |
| **Overview** | The hero numbers, the year-by-year heatmap reel, last screenings, and rating-tier poster walls |
| **Stats** | Habits, taste, the map of world cinema, the century strip, terra incognita, verdicts, years in review |
| **Next** | Recommendation shelves weighted by your own ratings — because-you-loved, short reels, the long haul, unmet masters, the canon board |
| **School** | A 31-course film school (BA + MFA) graded from your ratings: transcript, GPA, dean's list, the seminar room's method and vocabulary |
| **Archive** | The full ledger, searchable, beside the margins — your own reviews |

## Deploying your own

It's a static site — fork, enable GitHub Pages, done. One config:
[`assets/config.js`](assets/config.js) needs a free TMDB API key
(themoviedb.org → Settings → API). Rebuild the committed data files any time
with:

```
TMDB_KEY=... node tools/make-syllabus.mjs   # film-school metadata
TMDB_KEY=... node tools/make-demo.mjs       # the demo print
```

`node --test` covers the engine: CSV parsing, the insights math, the
recommendation ranker, the transcript grader.

## Roadmap

See [ARCHITECTURE.md](ARCHITECTURE.md) — phase 2 adds a Rust edge worker
(instant RSS-based teaser from just a username, TMDB key kept server-side)
and a Go data pipeline (weekly IMDb ratings slice for a second opinion on
every shelf).

---

Not affiliated with Letterboxd. This product uses the TMDB API but is not
endorsed or certified by TMDB.
