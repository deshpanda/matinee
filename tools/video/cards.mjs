// Renders the intro/outro cards and the lower-third captions as images, using
// the site's own typography so the cut looks like one piece with the product.
import { chromium } from 'playwright';
import { mkdir, rm } from 'node:fs/promises';

const OUT = new URL('./cards/', import.meta.url).pathname;
const CHROME =
  process.env.HOME +
  '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';

const BASE = `
  :root { --bg:#0e0c09; --ink:#ece4d6; --muted:#9b8f7c; --faint:#6b6252; --amber:#e6a648;
          --mono: ui-monospace,"SF Mono",Menlo,monospace;
          --sans: system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  * { box-sizing:border-box; margin:0; }
  body { width:1280px; height:800px; background:var(--bg); color:var(--ink);
         font-family:var(--sans); display:grid; place-items:center; overflow:hidden; }
  .grain::after { content:""; position:fixed; inset:0; pointer-events:none; opacity:.05;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E"); }
  .bars { position:fixed; inset:0; pointer-events:none; }
  .bars::before, .bars::after { content:""; position:fixed; left:0; right:0; height:52px; background:#000; }
  .bars::before { top:0; } .bars::after { bottom:0; }
  .glow { position:fixed; inset:-10% -10% auto -10%; height:120%;
    background:radial-gradient(ellipse 55% 60% at 50% 12%, rgba(230,166,72,.10), transparent 70%); }
  .wrap { text-align:center; position:relative; z-index:2; }
  .reel { font-family:var(--mono); color:var(--faint); letter-spacing:.5em; font-size:22px; }
  h1 { font-size:112px; font-weight:900; letter-spacing:.02em; text-transform:uppercase; margin:18px 0 14px; }
  h1 em { font-style:normal; color:var(--amber); }
  .tag { font-family:var(--mono); font-size:27px; color:var(--muted); letter-spacing:.02em; }
  .kicker { font-family:var(--mono); font-size:19px; color:var(--faint); margin-top:34px; letter-spacing:.06em; }
  .url { font-family:var(--mono); font-size:31px; color:var(--amber); margin-top:8px; }
  ul { list-style:none; margin-top:30px; display:grid; gap:13px; }
  li { font-family:var(--mono); font-size:23px; color:var(--muted); }
  li b { color:var(--ink); font-weight:600; }
`;

const CAPTION = `
  html,body { background:transparent !important; }
  body { width:1280px; height:150px; display:flex; align-items:flex-end; justify-content:flex-start; padding:0 0 26px 46px; }
  .cap { display:inline-flex; flex-direction:column; gap:7px;
         background:rgba(14,12,9,.86); border-left:3px solid var(--amber);
         padding:14px 22px 15px; border-radius:0 6px 6px 0; backdrop-filter:blur(6px); }
  .k { font-family:var(--mono); font-size:15px; letter-spacing:.22em; text-transform:uppercase; color:var(--amber); }
  .t { font-family:var(--sans); font-size:27px; font-weight:600; color:var(--ink); }
`;

const cards = {
  intro: `<div class="glow"></div><div class="wrap">
    <div class="reel">&#9679; &#9679; &#9679;</div>
    <h1>Mati<em>n&eacute;e</em></h1>
    <div class="tag">your film life, developed in your browser</div>
    <div class="kicker">drop your Letterboxd export &middot; nothing leaves your machine</div>
  </div>`,
  outro: `<div class="glow"></div><div class="wrap">
    <h1>Mati<em>n&eacute;e</em></h1>
    <ul>
      <li><b>free</b> and open source</li>
      <li><b>no account</b>, no server, no database</li>
      <li>your export is read <b>in your own browser</b></li>
    </ul>
    <div class="kicker" style="margin-top:44px">try it, or walk the demo print first</div>
    <div class="url">deshpanda.github.io/matinee</div>
  </div>`,
};

const captions = [
  ['c1', 'the landing', 'Drop the export ZIP Letterboxd gives you'],
  ['c2', 'the develop', 'Every film is matched and computed in the tab'],
  ['c3', 'the reel', 'Year by year, one cell per day'],
  ['c4', 'the wall', 'Poster walls by rating tier'],
  ['c5', 'the map', 'Shaded by how much of each country you have watched'],
  ['c6', 'the century', '1895 to now: the decades you have never visited'],
  ['c7', 'the next pictures', 'Recommendations weighted by your own ratings'],
  ['c8', 'the film school', 'A 31 course curriculum, graded from your diary'],
  ['c9', 'the seminar room', 'The vocabulary, anchored to the films that teach it'],
  ['c10', 'the archive', 'Your full diary and every review, searchable'],
];

const page$ = async (page, html, css, w, h, out, transparent = false) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(
    `<html><head><style>${BASE}${css}</style></head><body class="grain">${html}</body></html>`,
    { waitUntil: 'load' },
  );
  await page.waitForTimeout(220);
  await page.screenshot({ path: out, omitBackground: transparent });
};

const main = async () => {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: CHROME });
  const page = await browser.newPage({ deviceScaleFactor: 2 });

  for (const [name, html] of Object.entries(cards)) {
    await page$(page, `<div class="bars"></div>${html}`, '', 1280, 800, `${OUT}${name}.png`);
  }
  for (const [id, k, t] of captions) {
    await page$(
      page,
      `<div class="cap"><span class="k">${k}</span><span class="t">${t}</span></div>`,
      CAPTION,
      1280,
      150,
      `${OUT}${id}.png`,
      true,
    );
  }
  await browser.close();
  console.log('cards + captions rendered');
};

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
