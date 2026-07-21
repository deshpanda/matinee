//! Matinée's edge — the only server-side code in the product, and it holds
//! no viewer data. Two jobs the browser can't do itself:
//!
//!   GET /teaser/:username   Letterboxd's public RSS (last ~50 films) has no
//!                           CORS headers, so the landing-page preview needs
//!                           this hop. Normalized to JSON.
//!   GET /tmdb/<path>        TMDB proxy so the API key stays server-side.
//!
//! Deploy: `npx wrangler deploy`, secret: `wrangler secret put TMDB_KEY`.

use serde::Serialize;
use worker::*;

#[derive(Serialize)]
struct TeaserFilm {
    title: String,
    year: String,
    rating: Option<f64>,
    watched: String,
    rewatch: bool,
    tmdb_id: Option<u64>,
}

#[event(fetch)]
async fn fetch(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    let router = Router::new();
    router
        .get_async("/teaser/:user", |_req, ctx| async move {
            let user = ctx.param("user").cloned().unwrap_or_default();
            teaser(&user).await
        })
        .get_async("/tmdb/*path", |req, ctx| async move {
            let path = ctx.param("path").cloned().unwrap_or_default();
            let key = ctx.secret("TMDB_KEY")?.to_string();
            tmdb_proxy(&req, &path, &key).await
        })
        .run(req, env)
        .await
}

fn cors(mut resp: Response, max_age: u32) -> Result<Response> {
    let headers = resp.headers_mut();
    headers.set("Access-Control-Allow-Origin", "*")?;
    headers.set("Cache-Control", &format!("public, s-maxage={max_age}"))?;
    Ok(resp)
}

async fn teaser(user: &str) -> Result<Response> {
    if user.is_empty()
        || user.len() > 32
        || !user.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_' || b == b'-')
    {
        return cors(Response::error("bad username", 400)?, 60);
    }
    let url = format!("https://letterboxd.com/{}/rss/", user.to_lowercase());
    let mut init = RequestInit::new();
    let mut headers = Headers::new();
    // the feed 403s non-browser user agents
    headers.set(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    )?;
    init.with_method(Method::Get).with_headers(headers);
    let request = Request::new_with_init(&url, &init)?;
    let mut upstream = Fetch::Request(request).send().await?;
    if upstream.status_code() == 404 {
        return cors(Response::error("no such member", 404)?, 300);
    }
    if upstream.status_code() != 200 {
        return cors(Response::error("letterboxd unavailable", 502)?, 60);
    }
    let xml = upstream.text().await?;
    let films: Vec<TeaserFilm> = xml
        .split("<item>")
        .skip(1)
        .filter_map(|item| {
            let title = tag(item, "letterboxd:filmTitle")?;
            Some(TeaserFilm {
                title,
                year: tag(item, "letterboxd:filmYear").unwrap_or_default(),
                rating: tag(item, "letterboxd:memberRating").and_then(|r| r.parse().ok()),
                watched: tag(item, "letterboxd:watchedDate").unwrap_or_default(),
                rewatch: tag(item, "letterboxd:rewatch").as_deref() == Some("Yes"),
                tmdb_id: tag(item, "tmdb:movieId").and_then(|v| v.parse().ok()),
            })
        })
        .collect();
    cors(Response::from_json(&films)?, 21_600)
}

async fn tmdb_proxy(req: &Request, path: &str, key: &str) -> Result<Response> {
    // pass the query string through, add the key server-side
    let query = req
        .url()?
        .query()
        .map(|q| format!("{q}&"))
        .unwrap_or_default();
    let url = format!("https://api.themoviedb.org/3/{path}?{query}api_key={key}");
    let upstream = Fetch::Url(url.parse().map_err(|_| Error::from("bad url"))?)
        .send()
        .await?;
    cors(upstream, 86_400)
}

/// First occurrence of `<name>…</name>`, entity-decoded just enough for titles.
fn tag(hay: &str, name: &str) -> Option<String> {
    let open = format!("<{name}>");
    let close = format!("</{name}>");
    let start = hay.find(&open)? + open.len();
    let end = hay[start..].find(&close)? + start;
    let raw = &hay[start..end];
    Some(
        raw.replace("&amp;", "&")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&#039;", "'")
            .replace("&quot;", "\"")
            .trim()
            .to_string(),
    )
}
