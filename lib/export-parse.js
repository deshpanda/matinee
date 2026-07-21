// Turns a Letterboxd export — a ZIP, a folder drop, or loose CSVs — into the
// data object the insights engine eats. Pure string-in, data-out; the file
// unzipping/reading happens in the caller.
import { parseCsvObjects } from './csv.js';

const col = (r, name) => (r[name] ?? '').trim();

// texts: { 'diary.csv': string, 'watched.csv': string, ... } (missing ok, diary required)
export function parseExport(texts) {
  const rows = (file) => (texts[file] ? parseCsvObjects(texts[file]) : []);

  const diary = rows('diary.csv').map((r) => ({
    name: col(r, 'Name'),
    year: col(r, 'Year'),
    rating: parseFloat(col(r, 'Rating')) || null,
    watchedDate: col(r, 'Watched Date') || col(r, 'Date'),
    rewatch: /^yes$/i.test(col(r, 'Rewatch')),
  })).filter((d) => d.name && d.watchedDate);
  if (!diary.length) throw new Error('No diary entries found — is this a Letterboxd export?');

  const watched = rows('watched.csv').map((r) => ({ name: col(r, 'Name'), year: col(r, 'Year') }));
  const ratings = rows('ratings.csv').map((r) => ({
    name: col(r, 'Name'), year: col(r, 'Year'), rating: parseFloat(col(r, 'Rating')) || null,
  })).filter((r) => r.rating);
  const watchlist = rows('watchlist.csv')
    .map((r) => ({ name: col(r, 'Name'), year: col(r, 'Year') }))
    .filter((w) => w.name);
  const reviews = rows('reviews.csv').map((r) => ({
    name: col(r, 'Name'), year: col(r, 'Year'),
    watchedDate: col(r, 'Watched Date') || col(r, 'Date'),
    rating: parseFloat(col(r, 'Rating')) || null,
    text: col(r, 'Review'),
  })).filter((r) => r.name && r.text);

  // watched.csv can be absent in partial exports — the diary stands in
  const w = watched.length ? watched : dedupe(diary);
  return { diary, watched: w, ratings, watchlist, watchlistCount: watchlist.length, reviews };
}

function dedupe(diary) {
  const seen = new Set();
  const out = [];
  for (const d of diary) {
    const k = `${d.name}|${d.year}`;
    if (!seen.has(k)) { seen.add(k); out.push({ name: d.name, year: d.year }); }
  }
  return out;
}

// Unique films to enrich: everything watched plus the watchlist.
export function uniqueFilms(data) {
  const uniq = new Map();
  for (const x of [...data.watched, ...data.watchlist]) {
    uniq.set(`${x.name}|${x.year}`, { name: x.name, year: x.year });
  }
  return [...uniq.values()];
}
