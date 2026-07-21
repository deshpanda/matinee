#!/usr/bin/env node
// Builds data/demo.json — a fictional cinephile's finished print, so visitors
// can walk the whole product before uploading anything.
//   TMDB_KEY=... node tools/make-demo.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeInsights } from '../lib/insights.js';
import { enrichFilms } from '../lib/enrich.js';
import { buildShelves, setImdbSlice } from '../lib/shelves.js';
import { uniqueFilms } from '../lib/export-parse.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = process.env.TMDB_KEY;
if (!key) { console.error('TMDB_KEY required'); process.exit(1); }

// ---- the persona: a hungry second-year cinephile ---------------------------
// [name, year, rating, watchedDate, rewatch?, review?]
const LOG = [
  ['Parasite', '2019', 5, '2024-01-06', false, 'The peach fuzz is the whole class war in one image.'],
  ['Whiplash', '2014', 4.5, '2024-01-13'],
  ['The Grand Budapest Hotel', '2014', 4, '2024-01-20'],
  ['In the Mood for Love', '2000', 5, '2024-02-03', false, 'Two people rehearsing a heartbreak until it becomes one.'],
  ['Oldboy', '2003', 4, '2024-02-10'],
  ['Seven Samurai', '1954', 5, '2024-02-24', false, 'Three and a half hours and not one wasted frame.'],
  ['The Apartment', '1960', 4.5, '2024-03-02'],
  ['Portrait of a Lady on Fire', '2019', 4.5, '2024-03-09'],
  ['Blade Runner 2049', '2017', 4, '2024-03-16'],
  ['Stalker', '1979', 4.5, '2024-03-30', false, 'I do not know what the Zone is and I think about it daily.'],
  ['Before Sunrise', '1995', 4, '2024-04-06'],
  ['Chungking Express', '1994', 4.5, '2024-04-13'],
  ['12 Angry Men', '1957', 5, '2024-04-20'],
  ['Aftersun', '2022', 5, '2024-05-04', false, 'The rug pull is that there was no rug.'],
  ['La Haine', '1995', 4, '2024-05-11'],
  ['Spirited Away', '2001', 4.5, '2024-05-18'],
  ['The Godfather', '1972', 5, '2024-06-01'],
  ['Cléo from 5 to 7', '1962', 4, '2024-06-08'],
  ['Heat', '1995', 4, '2024-06-15'],
  ['Persona', '1966', 4.5, '2024-06-29', false, 'Watched it twice in one night. Still lost. Still grateful.'],
  ['Do the Right Thing', '1989', 4.5, '2024-07-06'],
  ['Drive My Car', '2021', 4.5, '2024-07-20'],
  ['The Third Man', '1949', 4, '2024-08-03'],
  ['Everything Everywhere All at Once', '2022', 4, '2024-08-10'],
  ['Tokyo Story', '1953', 4.5, '2024-08-24', false, 'It sneaks up on you like age itself.'],
  ['Mulholland Drive', '2001', 4.5, '2024-09-07'],
  ['City of God', '2002', 4.5, '2024-09-14'],
  ['Past Lives', '2023', 4, '2024-09-21'],
  ['Come and See', '1985', 5, '2024-10-05', false, 'Not a war film. An exorcism.'],
  ['The Silence of the Lambs', '1991', 4, '2024-10-12'],
  ['Rear Window', '1954', 4.5, '2024-10-26'],
  ['Eternal Sunshine of the Spotless Mind', '2004', 4.5, '2024-11-02'],
  ['Oppenheimer', '2023', 4, '2024-11-09'],
  ['Yi Yi', '2000', 5, '2024-11-23', false, 'A film that knows what the back of your head looks like.'],
  ['Fargo', '1996', 4, '2024-12-07'],
  ['It’s a Wonderful Life', '1946', 4, '2024-12-21'],
  ['The Zone of Interest', '2023', 4.5, '2025-01-04'],
  ['Ran', '1985', 4.5, '2025-01-18'],
  ['Anatomy of a Fall', '2023', 4, '2025-02-01'],
  ['There Will Be Blood', '2007', 5, '2025-02-15', false, 'Capitalism as a horror score.'],
  ['Paris, Texas', '1984', 4.5, '2025-03-01'],
  ['The Handmaiden', '2016', 4.5, '2025-03-15'],
  ['Grave of the Fireflies', '1988', 4.5, '2025-03-29'],
  ['No Country for Old Men', '2007', 4.5, '2025-04-12'],
  ['Three Colors: Red', '1994', 4.5, '2025-04-26'],
  ['Perfect Days', '2023', 4.5, '2025-05-10', false, 'Komorebi as a way of life.'],
  ['Psycho', '1960', 4.5, '2025-05-24'],
  ['8½', '1963', 4, '2025-06-07'],
  ['The Truman Show', '1998', 4, '2025-06-21'],
  ['Pather Panchali', '1955', 4.5, '2025-07-05'],
  ['Casablanca', '1942', 4.5, '2025-07-19'],
  ['Memories of Murder', '2003', 4.5, '2025-08-02'],
  ['The Shining', '1980', 4.5, '2025-08-16'],
  ['Lost in Translation', '2003', 4, '2025-08-30'],
  ['Solaris', '1972', 4, '2025-09-13'],
  ['Chinatown', '1974', 4.5, '2025-09-27'],
  ['Spider-Man: Into the Spider-Verse', '2018', 4.5, '2025-10-11'],
  ['The Seventh Seal', '1957', 4, '2025-10-25'],
  ['Killers of the Flower Moon', '2023', 4, '2025-11-08'],
  ['2001: A Space Odyssey', '1968', 5, '2025-11-22', false, 'Saw it in 70mm. Different species of experience.'],
  ['Princess Mononoke', '1997', 4.5, '2025-12-06'],
  ['Die Hard', '1988', 4, '2025-12-20'],
  ['All We Imagine as Light', '2024', 4.5, '2026-01-03'],
  ['Brief Encounter', '1945', 4, '2026-01-17'],
  ['The Conversation', '1974', 4.5, '2026-01-31'],
  ['In the Mood for Love', '2000', 5, '2026-02-14', true, 'Second watch. It is somehow sadder when you know.'],
  ['Dune: Part Two', '2024', 4, '2026-02-28'],
  ['High and Low', '1963', 4.5, '2026-03-14'],
  ['The Celebration', '1998', 4, '2026-03-28'],
  ['A Separation', '2011', 4.5, '2026-04-11'],
  ['Rashomon', '1950', 4, '2026-04-25'],
  ['The Red Shoes', '1948', 4.5, '2026-05-09'],
  ['Le Samouraï', '1967', 4, '2026-05-23'],
  ['Sunset Boulevard', '1950', 4.5, '2026-06-06', false, 'The dead narrator tells the truth. Everyone alive lies.'],
  ['Columbus', '2017', 4, '2026-06-20'],
  ['The Master', '2012', 4, '2026-07-04'],
  ['Close-Up', '1990', 4.5, '2026-07-18', false, 'A man lies his way into the truth. Cinema does the same.'],
  // the misses — an honest diary has some
  ['Babylon', '2022', 2.5, '2024-02-17'],
  ['The Gray Man', '2022', 2, '2024-05-25'],
  ['65', '2023', 1.5, '2024-09-28'],
  ['Madame Web', '2024', 1, '2025-06-28'],
  ['Red Notice', '2021', 2, '2025-12-27'],
  ['Ghosted', '2023', 1.5, '2026-03-07'],
];

const WATCHLIST = [
  ['Sátántangó', '1994'], ['Jeanne Dielman, 23, quai du Commerce, 1080 Bruxelles', '1975'],
  ['A Brighter Summer Day', '1991'], ['Andrei Rublev', '1966'], ['Wings of Desire', '1987'],
  ['The Battle of Algiers', '1966'], ['Barry Lyndon', '1975'], ['Werckmeister Harmonies', '2000'],
];

const data = {
  diary: LOG.map(([name, year, rating, watchedDate, rewatch]) => ({
    name, year, rating, watchedDate, rewatch: !!rewatch,
  })),
  watched: [...new Map(LOG.map(([name, year]) => [`${name}|${year}`, { name, year }])).values()],
  ratings: [...new Map(LOG.map(([name, year, rating]) => [`${name}|${year}`, { name, year, rating }])).values()],
  watchlist: WATCHLIST.map(([name, year]) => ({ name, year })),
  watchlistCount: WATCHLIST.length,
  reviews: LOG.filter((r) => r[5]).map(([name, year, rating, watchedDate, , text]) => ({
    name, year, rating, watchedDate, text,
  })),
};

// enrich with a local file cache so re-runs are cheap
const CACHE = join(ROOT, 'tools', '.demo-cache.json');
const fileCache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, 'utf8')) : {};
const cache = {
  get: async (k) => (k in fileCache ? fileCache[k] : null),
  put: async (k, v) => { fileCache[k] = v; },
};
console.log(`Enriching ${uniqueFilms(data).length} films…`);
const films = await enrichFilms(uniqueFilms(data), key, {
  cache, onProgress: (d, t) => { if (d % 20 === 0) console.log(`  ${d}/${t}`); },
});
writeFileSync(CACHE, JSON.stringify(fileCache));
data.films = Object.fromEntries(Object.entries(films).filter(([, v]) => v));
data.generatedAt = '2026-07-18';

const insights = computeInsights(data);
console.log(`Insights: ${insights.totals.uniqueFilms} films, ${insights.totals.hours} h.`);
const syllabus = JSON.parse(readFileSync(join(ROOT, 'data', 'syllabus.json'), 'utf8'));
if (existsSync(join(ROOT, 'data', 'imdb-slice.json'))) {
  setImdbSlice(JSON.parse(readFileSync(join(ROOT, 'data', 'imdb-slice.json'), 'utf8')));
}
console.log('Building shelves…');
insights.recs = await buildShelves(data, data.films, syllabus, key,
  (phase, d, t) => { if (d === t) console.log(`  ${phase} done`); });
insights.isDemo = true;
writeFileSync(join(ROOT, 'data', 'demo.json'), JSON.stringify(insights));
console.log(`data/demo.json — ${Math.round(JSON.stringify(insights).length / 1024)} KB, standing: ${insights.recs.school.standing}, GPA ${insights.recs.school.gpa}`);
