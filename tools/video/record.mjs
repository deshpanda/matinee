// Records a walkthrough of the live Matinée site: loads the demo print, then
// paces through each room with slow, readable scrolling. Output: raw webm
// segments under out/, one per scene, which the cut script assembles.
import { chromium } from 'playwright';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const SITE = 'https://deshpanda.github.io/matinee/';
const OUT = new URL('./out/', import.meta.url).pathname;
const W = 1280;
const H = 800;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scene marks: the cut needs exact times, not estimates.
const marks = [];
let t0 = 0;
const mark = (label) => { marks.push({ label, t: (Date.now() - t0) / 1000 }); };

/** Smooth, human-paced scroll: eased steps instead of a jump. */
async function glide(page, toY, ms = 2600) {
  const from = await page.evaluate(() => window.scrollY);
  const steps = Math.max(24, Math.round(ms / 32));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // ease-in-out
    await page.evaluate((y) => window.scrollTo(0, y), from + (toY - from) * eased);
    await sleep(ms / steps);
  }
}

/** Scroll to a section by its heading text and hold on it. */
async function visit(page, headingRe, { hold = 1500, extra = 0 } = {}) {
  const y = await page.evaluate((src) => {
    const re = new RegExp(src, 'i');
    const blocks = [...document.querySelectorAll('section.block')];
    const hit = blocks.find((b) => re.test(b.querySelector('h2,h3')?.textContent || ''));
    if (!hit) return null;
    return hit.getBoundingClientRect().top + window.scrollY - 70;
  }, headingRe.source);
  if (y === null) return false;
  await glide(page, y + extra);
  await sleep(hold);
  return true;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const CHROME = process.env.HOME + '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing';
  const browser = await chromium.launch({ executablePath: CHROME });
  const ctx = await browser.newContext({
    viewport: { width: W, height: H },
    deviceScaleFactor: 2,
    recordVideo: { dir: OUT, size: { width: W, height: H } },
    colorScheme: 'dark',
  });
  const page = await ctx.newPage();
  t0 = Date.now();

  // ---- scene 1: the landing page ----
  await page.goto(SITE, { waitUntil: 'networkidle' });
  await page.waitForSelector('.dropzone', { timeout: 30000 });
  mark('c1');
  await sleep(2200);

  // hover the dropzone so its hover state reads on camera
  await page.hover('.dropzone');
  await sleep(1200);

  // ---- scene 2: the develop ----
  await page.click('.demo-link');
  mark('c2');
  await page.waitForSelector('.hero h2', { timeout: 60000 });
  await sleep(2600); // let the count-ups finish

  // ---- scene 3: overview ----
  mark('c3');
  await visit(page, /the reel/i, { hold: 2400 });
  await visit(page, /last reels/i, { hold: 1800 });
  mark('c4');
  const wall = await visit(page, /the wall/i, { hold: 1600 });
  if (wall) {
    // click through the rating tiers
    const chips = await page.$$('.wall-chips button, .wall-chip');
    for (const c of chips.slice(0, 3)) {
      await c.click().catch(() => {});
      await sleep(1500);
    }
  }

  // ---- scene 4: stats (map + century) ----
  await page.goto(SITE + 'stats/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.hero, section.block', { timeout: 30000 });
  await sleep(1200);
  mark('c5');
  const map = await visit(page, /map of world cinema/i, { hold: 2200 });
  if (map) {
    const lit = await page.$$('.worldmap .land.lit');
    if (lit.length) {
      await lit[Math.min(3, lit.length - 1)].click().catch(() => {});
      await sleep(2200);
    }
  }
  mark('c6');
  await visit(page, /the century/i, { hold: 3000 });
  await visit(page, /terra incognita/i, { hold: 1800 });

  // ---- scene 5: recommendations ----
  await page.goto(SITE + 'next/', { waitUntil: 'networkidle' });
  await page.waitForSelector('.pcard', { timeout: 30000 });
  mark('c7');
  await sleep(2400);
  await glide(page, 900, 2600);
  await sleep(1600);
  await glide(page, 1900, 2600);
  await sleep(1800);

  // ---- scene 6: the film school ----
  await page.goto(SITE + 'school/', { waitUntil: 'networkidle' });
  await page.waitForSelector('section.block', { timeout: 30000 });
  mark('c8');
  await sleep(2600); // transcript tiles
  await glide(page, 700, 2400);
  await sleep(2000);
  mark('c9');
  await visit(page, /seminar room/i, { hold: 2600 });

  // ---- scene 7: the archive ----
  await page.goto(SITE + 'archive/', { waitUntil: 'networkidle' });
  await page.waitForSelector('section.block', { timeout: 30000 });
  mark('c10');
  await sleep(2200);
  await glide(page, 800, 2400);
  await sleep(1800);

  mark('end');
  await writeFile(new URL('./timeline.json', import.meta.url), JSON.stringify(marks, null, 1));
  await ctx.close(); // flushes the video file
  await browser.close();
  console.log('recorded to', OUT);
}

main().catch((e) => {
  console.error('record failed:', e.message);
  process.exit(1);
});
