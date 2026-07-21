// Thin TMDB v3 client — identical in Node and the browser.
// 429s back off and retry; any other failure returns null (callers degrade).

export async function tmdb(path, params, key) {
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  url.searchParams.set('api_key', key);
  const res = await fetch(url).catch(() => null);
  if (res?.status === 429) {
    await sleep(2000);
    return tmdb(path, params, key);
  }
  if (!res?.ok) return null;
  return res.json();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const yearOf = (d) => (d || '').slice(0, 4);
export const POSTER = (p) => (p ? `https://image.tmdb.org/t/p/w342${p}` : null);
