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
        .get_async("/badge", |req, ctx| async move {
            // shields.io endpoint badges. ?metric= selects one; all of them
            // are anonymous by construction — the edge can only count.
            let metric = req
                .url()?
                .query_pairs()
                .find(|(k, _)| k == "metric")
                .map(|(_, v)| v.to_string())
                .unwrap_or_default();
            match metric.as_str() {
                "develops" => {
                    let n = ctx
                        .kv("COUNTERS")?
                        .get("develops")
                        .text()
                        .await?
                        .and_then(|s| s.parse::<u64>().ok())
                        .unwrap_or(0);
                    badge("films developed", &humanize(n), "e6a648")
                }
                "data" => data_freshness_badge(&ctx).await,
                _ => {
                    let account = ctx.var("ACCOUNT_ID")?.to_string();
                    match ctx.secret("CF_ANALYTICS_TOKEN") {
                        Ok(token) => usage_badge(&account, &token.to_string()).await,
                        Err(_) => badge("edge · 7 days", "token not set", "6b6252"),
                    }
                }
            }
        })
        .post_async("/fin", |_req, ctx| async move {
            // one empty ping when a develop completes — the counter's whole
            // datasource. No body, no id, nothing to store but the count.
            let kv = ctx.kv("COUNTERS")?;
            let n = kv
                .get("develops")
                .text()
                .await?
                .and_then(|s| s.parse::<u64>().ok())
                .unwrap_or(0);
            kv.put("develops", (n + 1).to_string())?.execute().await?;
            cors(Response::empty()?.with_status(204), 0)
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
    let headers = Headers::new();
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
    let mut init = RequestInit::new();
    let headers = Headers::new();
    headers.set("Accept", "application/json")?;
    headers.set(
        "User-Agent",
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
    )?;
    init.with_method(Method::Get).with_headers(headers);
    let mut upstream = Fetch::Request(Request::new_with_init(&url, &init)?)
        .send()
        .await?;
    // upstream responses carry immutable headers — rebuild before decorating
    let status = upstream.status_code();
    let body = upstream.bytes().await?;
    let resp = Response::from_bytes(body)?.with_status(status);
    resp.headers().set("Content-Type", "application/json")?;
    cors(resp, 86_400)
}

fn badge(label: &str, message: &str, color: &str) -> Result<Response> {
    let resp = Response::from_json(&serde_json::json!({
        "schemaVersion": 1, "label": label, "message": message, "color": color,
    }))?;
    cors(resp, 3600)
}

async fn usage_badge(account: &str, token: &str) -> Result<Response> {
    // seven days back, ISO — epoch day math keeps chrono out of the build
    let now_ms = Date::now().as_millis();
    let since_days = (now_ms / 86_400_000).saturating_sub(7);
    let since = iso_date(since_days);
    let query = serde_json::json!({
        "query": format!(
            "query {{ viewer {{ accounts(filter: {{accountTag: \"{account}\"}}) \
             {{ workersInvocationsAdaptive(limit: 1000, filter: {{scriptName: \"matinee-api\", date_geq: \"{since}\"}}) \
             {{ sum {{ requests }} }} }} }} }}"
        ),
    });
    let mut init = RequestInit::new();
    let headers = Headers::new();
    headers.set("Authorization", &format!("Bearer {token}"))?;
    headers.set("Content-Type", "application/json")?;
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(query.to_string().into()));
    let mut resp = Fetch::Request(Request::new_with_init(
        "https://api.cloudflare.com/client/v4/graphql",
        &init,
    )?)
    .send()
    .await?;
    let v: serde_json::Value = resp.json().await.unwrap_or_default();
    let rows = v["data"]["viewer"]["accounts"][0]["workersInvocationsAdaptive"].as_array();
    match rows {
        Some(rows) => {
            let total: u64 = rows.iter().filter_map(|r| r["sum"]["requests"].as_u64()).sum();
            badge("edge · 7 days", &format!("{} requests", humanize(total)), "e6a648")
        }
        None => badge("edge · 7 days", "unavailable", "6b6252"),
    }
}

// GitHub's anonymous API rate limit is shared across Cloudflare egress IPs,
// so lookups WILL flake — the last good answer lives in KV and stands in.
async fn data_freshness_badge(ctx: &RouteContext<()>) -> Result<Response> {
    let kv = ctx.kv("COUNTERS")?;
    let now_days = (Date::now().as_millis() / 86_400_000) as i64;
    if let Some(cached) = kv.get("data-freshness").text().await? {
        // "fetched_day|commit_day" — refetch at most once a day
        if let Some((fetched, commit)) = parse_cached(&cached) {
            if fetched == now_days {
                return freshness_response(now_days - commit);
            }
        }
    }
    match fetch_slice_commit_day().await {
        Some(commit_day) => {
            kv.put("data-freshness", format!("{now_days}|{commit_day}"))?
                .execute()
                .await?;
            freshness_response(now_days - commit_day)
        }
        None => {
            // rate-limited: serve the stale answer if there is one
            if let Some(cached) = kv.get("data-freshness").text().await? {
                if let Some((_, commit)) = parse_cached(&cached) {
                    return freshness_response(now_days - commit);
                }
            }
            badge("weekly data", "unavailable", "6b6252")
        }
    }
}

fn parse_cached(s: &str) -> Option<(i64, i64)> {
    let (a, b) = s.split_once('|')?;
    Some((a.parse().ok()?, b.parse().ok()?))
}

fn freshness_response(ago: i64) -> Result<Response> {
    let ago = ago.max(0);
    let msg = match ago {
        0 => "refreshed today".to_string(),
        1 => "refreshed yesterday".to_string(),
        n => format!("refreshed {n} days ago"),
    };
    badge("weekly data", &msg, if ago <= 8 { "e6a648" } else { "c8442e" })
}

async fn fetch_slice_commit_day() -> Option<i64> {
    let mut init = RequestInit::new();
    let headers = Headers::new();
    headers.set("User-Agent", "matinee-badge").ok()?;
    headers.set("Accept", "application/vnd.github+json").ok()?;
    init.with_method(Method::Get).with_headers(headers);
    let req = Request::new_with_init(
        "https://api.github.com/repos/deshpanda/matinee/commits?path=data/imdb-slice.json&per_page=1",
        &init,
    )
    .ok()?;
    let mut resp = Fetch::Request(req).send().await.ok()?;
    if resp.status_code() != 200 {
        return None;
    }
    let v: serde_json::Value = resp.json().await.ok()?;
    let date = v[0]["commit"]["committer"]["date"].as_str()?;
    if date.len() < 10 {
        return None;
    }
    Some(days_from_civil(&date[..10]))
}

/// "YYYY-MM-DD" → days since the Unix epoch (inverse of iso_date).
fn days_from_civil(s: &str) -> i64 {
    let y: i64 = s[..4].parse().unwrap_or(1970);
    let m: i64 = s[5..7].parse().unwrap_or(1);
    let d: i64 = s[8..10].parse().unwrap_or(1);
    let y = if m <= 2 { y - 1 } else { y };
    let era = y.div_euclid(400);
    let yoe = y - era * 400;
    let mp = if m > 2 { m - 3 } else { m + 9 };
    let doy = (153 * mp + 2) / 5 + d - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    era * 146_097 + doe - 719_468
}

fn humanize(n: u64) -> String {
    if n >= 10_000 { format!("{:.1}k", n as f64 / 1000.0) } else { n.to_string() }
}

/// Days since the Unix epoch → YYYY-MM-DD (civil-from-days, Hinnant's algorithm).
fn iso_date(days: u64) -> String {
    let z = days as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = if m <= 2 { y + 1 } else { y };
    format!("{y:04}-{m:02}-{d:02}")
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
