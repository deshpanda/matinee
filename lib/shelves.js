// Client-side recommendation shelves — the viewer's browser talks to TMDB
// directly, weighted by their own ratings. A lean port of the private
// build-time engine: because / for-you / runtime carve / unmet masters /
// canon board / watchlist / film school / season pass.
import { tmdb, sleep } from './tmdb.js';
import {
  aggregate, seedWeight, normTitle, genreAffinity, CANON_DIRECTORS, TMDB_GENRES,
} from './recs.js';
import { gradeSchool, viewerKeys } from './school.js';

const asCard = (c, why) => ({
  tmdbId: c.id, title: c.title, year: (c.release_date || '').slice(0, 4) || c.year || '',
  poster: c.poster_path || null,
  tmdb: c.vote_average ? { rating: Math.round(c.vote_average * 10) / 10 } : null,
  imdb: null,
  runtime: c.runtime || 0,
  genres: (c.genres?.map((g) => g.name) || (c.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean)).slice(0, 3),
  why,
});

export async function buildShelves(data, films, syllabus, key, onProgress = () => {}) {
  const ratingByKey = new Map();
  for (const r of data.ratings || []) ratingByKey.set(`${r.name}|${r.year}`, Number(r.rating) || null);

  const exclude = new Set();
  const excludeTitles = new Set();
  const watchedByDir = new Map();
  const seedPool = [];
  for (const w of data.watched || []) {
    const k = `${w.name}|${w.year}`;
    exclude.add(`${normTitle(w.name)} ${w.year}`);
    excludeTitles.add(normTitle(w.name));
    const f = films[k];
    if (!f) continue;
    if (f.tmdbId) exclude.add(f.tmdbId);
    if (f.director) watchedByDir.set(f.director, (watchedByDir.get(f.director) || 0) + 1);
    const rating = ratingByKey.get(k);
    if (f.tmdbId && rating >= 3.5) seedPool.push({ id: f.tmdbId, title: w.name, rating, weight: seedWeight(rating) });
  }

  const diaryDesc = [...(data.diary || [])].sort((a, b) => (a.watchedDate < b.watchedDate ? 1 : -1));
  const recentIds = new Set();
  for (const d of diaryDesc) {
    const f = films[`${d.name}|${d.year}`];
    const r = ratingByKey.get(`${d.name}|${d.year}`);
    if (f?.tmdbId && r >= 3.5) recentIds.add(f.tmdbId);
    if (recentIds.size >= 8) break;
  }

  // one /recommendations call per seed, strongest 40 seeds
  seedPool.sort((a, b) => b.rating - a.rating);
  const seeds = seedPool.slice(0, 40);
  for (const s of [...seedPool].filter((s2) => recentIds.has(s2.id))) {
    if (!seeds.some((x) => x.id === s.id)) seeds.push(s);
  }
  const recLists = [];
  let done = 0;
  for (const seed of seeds) {
    const r = await tmdb(`/movie/${seed.id}/recommendations`, {}, key);
    await sleep(40);
    recLists.push({
      seed,
      items: (r?.results || []).map((it) => ({ ...it, year: (it.release_date || '').slice(0, 4) })),
    });
    onProgress('shelves', ++done, seeds.length);
  }

  const opts = { exclude, excludeTitles, minVotes: 200 };
  const recentLists = recLists.filter((l) => recentIds.has(l.seed.id));
  const because = aggregate(recentLists, { ...opts, limit: 10 })
    .map((c) => asCard(c, `because you loved ${c.seeds[0]}`));
  const pool = aggregate(recLists, { ...opts, limit: 56 });
  const becauseIds = new Set(because.map((c) => c.tmdbId));
  const forYouRaw = pool.filter((c) => !becauseIds.has(c.id)).slice(0, 30);

  // runtimes for the pool come from one details call per card
  const detailed = [];
  done = 0;
  for (const c of forYouRaw) {
    const d = await tmdb(`/movie/${c.id}`, {}, key);
    await sleep(40);
    detailed.push({ ...c, runtime: d?.runtime || 0, genres: d?.genres });
    onProgress('details', ++done, forYouRaw.length);
  }
  const quality = detailed.filter((c) => (c.vote_average || 0) >= 6.8);
  const forYou = quality.slice(0, 10).map((c) => asCard(c, `via ${c.seeds.slice(0, 2).join(' + ')}`));
  const used = new Set(forYou.map((c) => c.tmdbId));
  const shortReel = quality.filter((c) => !used.has(c.id) && c.runtime > 0 && c.runtime <= 105)
    .slice(0, 8).map((c) => asCard(c, 'one sitting, no intermission'));
  shortReel.forEach((c) => used.add(c.tmdbId));
  const longHaul = quality.filter((c) => !used.has(c.id) && c.runtime >= 150)
    .slice(0, 8).map((c) => asCard(c, 'clear the evening'));

  // masters you haven't met — canon directors with zero films in the diary
  const topGenres = topUserGenres(data, films, ratingByKey);
  const unmet = CANON_DIRECTORS.filter((n) => !watchedByDir.get(n)).slice(0, 12);
  const meet = [];
  done = 0;
  for (const name of unmet) {
    if (meet.length >= 8) break;
    const p = await tmdb('/search/person', { query: name }, key);
    const pid = p?.results?.[0]?.id;
    if (pid) {
      const credits = await tmdb(`/person/${pid}/movie_credits`, {}, key);
      const best = (credits?.crew || [])
        .filter((c) => c.job === 'Director' && !exclude.has(c.id) && (c.vote_count || 0) >= 300)
        .sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0))[0];
      if (best) {
        const aff = genreAffinity(topGenres, (best.genre_ids || []).map((g) => TMDB_GENRES[g]).filter(Boolean));
        meet.push({ ...asCard({ ...best, year: (best.release_date || '').slice(0, 4) }, `start ${name} here`), aff });
      }
    }
    await sleep(40);
    onProgress('masters', ++done, unmet.length);
  }
  meet.sort((a, b) => b.aff - a.aff);

  const canon = CANON_DIRECTORS
    .map((name) => ({ name, seen: watchedByDir.get(name) || 0 }))
    .sort((a, b) => b.seen - a.seen || a.name.localeCompare(b.name));

  // watchlist first — already enriched alongside the watched films
  const watchlistFirst = (data.watchlist || [])
    .map((w) => ({ w, f: films[`${w.name}|${w.year}`] }))
    .filter(({ w, f }) => f?.tmdbId && !exclude.has(`${normTitle(w.name)} ${w.year}`))
    .sort((a, b) => (b.f.tmdbRating || 0) - (a.f.tmdbRating || 0))
    .slice(0, 10)
    .map(({ w, f }) => asCard({
      id: f.tmdbId, title: w.name, year: w.year, poster_path: f.poster,
      vote_average: f.tmdbRating, runtime: f.runtime, genres: f.genres.map((g) => ({ name: g })),
    }, 'you already promised yourself this one'));

  const school = gradeSchool(syllabus, viewerKeys(data, films));

  const seasonPass = [];
  const addWeek = (label, card) => {
    if (card && !seasonPass.some((x) => x.card.tmdbId === card.tmdbId)) {
      seasonPass.push({ week: seasonPass.length + 1, label, card });
    }
  };
  const nextCourse = school.semester?.next;
  if (nextCourse) {
    addWeek(`film school, ${school.semester.code}`, {
      tmdbId: nextCourse.tmdbId, title: nextCourse.title, year: nextCourse.year,
      poster: nextCourse.poster, tmdb: nextCourse.tmdb ? { rating: nextCourse.tmdb } : null,
      imdb: null, runtime: 0, genres: [], why: nextCourse.why,
    });
  }
  addWeek('off your watchlist', watchlistFirst[0]);
  addWeek('a master awaits', meet[0]);
  addWeek('for you', forYou[0]);

  return {
    because, forYou, shortReel, longHaul, meet, canon, watchlistFirst,
    school, seasonPass: seasonPass.slice(0, 4),
  };
}

function topUserGenres(data, films, ratingByKey) {
  const count = new Map();
  for (const w of data.watched || []) {
    const f = films[`${w.name}|${w.year}`];
    const r = ratingByKey.get(`${w.name}|${w.year}`);
    if (!f || !(r >= 3.5)) continue;
    for (const g of f.genres || []) count.set(g, (count.get(g) || 0) + 1);
  }
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
}
