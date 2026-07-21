// TMDB enrichment that runs wherever it's called — the visitor's browser for
// the live product, Node for the demo build. Two calls per unique film
// (search, then details+credits), cache-first so a re-upload is instant.
import { tmdb, sleep, yearOf } from './tmdb.js';
import { normTitle } from './recs.js';

// films: [{name, year}] unique. cache: {get(key), put(key, value)} async.
// onProgress(done, total, title) fires per film.
export async function enrichFilms(films, key, { cache, onProgress } = {}) {
  const out = {};
  let done = 0;
  for (const f of films) {
    const k = `${f.name}|${f.year}`;
    const hit = cache ? await cache.get(k) : null;
    if (hit !== null && hit !== undefined) {
      out[k] = hit;
    } else {
      out[k] = await enrichOne(f.name, f.year, key);
      if (cache) await cache.put(k, out[k]);
      await sleep(40);
    }
    done++;
    if (onProgress) onProgress(done, films.length, f.name);
  }
  return out;
}

async function enrichOne(name, year, key) {
  let s = await tmdb('/search/movie', { query: name, primary_release_year: year }, key);
  if (!s?.results?.length) s = await tmdb('/search/movie', { query: name }, key);
  if (!s?.results?.length && name.includes(',')) {
    const stem = await tmdb('/search/movie', { query: name.split(',')[0] }, key);
    const want = normTitle(name);
    s = { results: (stem?.results || []).filter((r) => normTitle(r.title) === want) };
  }
  const hit = s?.results?.[0];
  if (!hit) return false; // looked up, not found — cached so we don't retry
  const detail = await tmdb(`/movie/${hit.id}`, { append_to_response: 'credits' }, key);
  if (!detail) return false;
  const dirs = (detail.credits?.crew || []).filter((c) => c.job === 'Director');
  dirs.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return {
    tmdbId: detail.id,
    poster: detail.poster_path || null,
    collection: detail.belongs_to_collection
      ? { id: detail.belongs_to_collection.id, name: detail.belongs_to_collection.name } : null,
    genres: (detail.genres || []).map((g) => g.name),
    runtime: detail.runtime || 0,
    director: dirs[0]?.name || null,
    cast: (detail.credits?.cast || []).slice(0, 6).map((c) => c.name),
    countries: (detail.production_countries || []).map((c) => c.name),
    language: detail.original_language || null,
    tmdbRating: detail.vote_average || null,
    votes: detail.vote_count || 0,
    popularity: detail.popularity ?? null,
    releaseYear: yearOf(detail.release_date),
  };
}
