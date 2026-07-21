#!/usr/bin/env node
// Resolves the film-school syllabus against TMDB once, at build time, so the
// browser never pays for it: ids, posters, crowd ratings, and directors
// (marquee name wins on co-directed films). Output: data/syllabus.json
//   TMDB_KEY=... node tools/make-syllabus.mjs
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SYLLABUS, SYLLABUS_EXTRAS, normTitle } from '../lib/recs.js';
import { tmdb, sleep } from '../lib/tmdb.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const key = process.env.TMDB_KEY;
if (!key) { console.error('TMDB_KEY required'); process.exit(1); }

const search = async (title, year) => {
  let s = await tmdb('/search/movie', { query: title, primary_release_year: year }, key);
  if (!s?.results?.length) s = await tmdb('/search/movie', { query: title }, key);
  if (!s?.results?.length && title.includes(',')) {
    const stem = await tmdb('/search/movie', { query: title.split(',')[0] }, key);
    const want = normTitle(title);
    s = { results: (stem?.results || []).filter((r) => normTitle(r.title) === want) };
  }
  await sleep(60);
  return s?.results?.[0];
};

const directorOf = async (id) => {
  if (!id) return null;
  const d = await tmdb(`/movie/${id}`, { append_to_response: 'credits' }, key);
  await sleep(60);
  const dirs = (d?.credits?.crew || []).filter((c) => c.job === 'Director');
  dirs.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  return dirs[0]?.name || null;
};

const resolveFilm = async (title, year, why) => {
  const hit = await search(title, year);
  return {
    title, year, why,
    director: await directorOf(hit?.id),
    tmdbId: hit?.id || null,
    poster: hit?.poster_path || null,
    tmdb: hit?.vote_average ? Math.round(hit.vote_average * 10) / 10 : null,
  };
};

const out = [];
for (const course of SYLLABUS) {
  const films = [];
  for (const [t, y, w] of course.films) films.push(await resolveFilm(t, y, w));
  let extra = null;
  if (SYLLABUS_EXTRAS[course.code]) {
    const [xt, xy, xw] = SYLLABUS_EXTRAS[course.code];
    extra = await resolveFilm(xt, xy, xw);
  }
  out.push({
    code: course.code, year: course.year, title: course.title,
    desc: course.desc, assignment: course.assignment, films, extra,
  });
  console.log(`${course.code} — ${films.filter((f) => f.tmdbId).length}/${films.length} resolved`);
}
writeFileSync(join(ROOT, 'data', 'syllabus.json'), JSON.stringify(out));
const flat = out.flatMap((c) => [...c.films, ...(c.extra ? [c.extra] : [])]);
console.log(`data/syllabus.json — ${out.length} courses, ${flat.length} films, ${flat.filter((f) => !f.tmdbId).length} unresolved, ${flat.filter((f) => !f.director).length} without director`);
