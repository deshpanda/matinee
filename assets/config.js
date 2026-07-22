// Deployment configuration.
// BRAND renames the product everywhere.
// TMDB_KEY: with WORKER_URL set, the site never uses this key — browsers go
// through the worker's proxy and the key lives in a worker secret. It stays
// here because the build tools and the weekly refresh workflow read it.
// Forks without a worker can rely on it directly (it then ships to browsers,
// which is standard for TMDB free keys; rotate any time).
export const BRAND = 'Matinée';
export const TMDB_KEY = 'a0b334b154b961f2de002723496254be';

// Phase 2: the edge worker (api/ — Rust on Cloudflare Workers). Once deployed,
// put its URL here (e.g. 'https://matinee-api.yourname.workers.dev') and the
// landing page grows a username teaser. Empty = hidden.
export const WORKER_URL = 'https://matinee-api.samyakd-2001.workers.dev';
