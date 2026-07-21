// Deployment configuration.
// BRAND renames the product everywhere. TMDB_KEY: mint a free key at
// themoviedb.org/settings/api and paste it here — it ships to browsers, which
// is standard for TMDB free keys (rate limits apply per caller IP; rotate it
// any time). Until phase 2 puts the key behind the edge worker, this is the
// documented trade-off. Without a key, only the demo print works.
export const BRAND = 'Matinée';
export const TMDB_KEY = 'a0b334b154b961f2de002723496254be';
