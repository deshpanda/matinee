// Deployment configuration.
// BRAND renames the product everywhere. TMDB_KEY: mint a free key at
// themoviedb.org/settings/api and paste it here — it ships to browsers, which
// is standard for TMDB free keys (rate limits apply per caller IP; rotate it
// any time). Until phase 2 puts the key behind the edge worker, this is the
// documented trade-off. Without a key, only the demo print works.
export const BRAND = 'Matinée';
export const TMDB_KEY = 'a0b334b154b961f2de002723496254be';

// Phase 2: the edge worker (api/ — Rust on Cloudflare Workers). Once deployed,
// put its URL here (e.g. 'https://matinee-api.yourname.workers.dev') and the
// landing page grows a username teaser. Empty = hidden.
export const WORKER_URL = 'https://matinee-api.samyakd-2001.workers.dev';
