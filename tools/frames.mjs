// node tools/frames.mjs <outdir> : the intro at a few moments, the full shop, and the mobile views
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
const out = process.argv[2], URL = 'http://localhost:4780/';
const b = await chromium.launch({ executablePath: process.env.CHROME });

// intro: freeze the CSS animation at chosen times so each frame is exact
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  for (const t of [420, 800, 1120]) {
    await p.evaluate(ms => document.getAnimations().forEach(a => { a.pause(); a.currentTime = ms; }), t);
    await p.waitForTimeout(80);
    await p.screenshot({ path: `${out}/f-intro${t}.jpg`, quality: 80, type: 'jpeg' });
  }
  await c.close();
}

// the whole shop, reveals forced on
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await c.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(async () => {
    document.querySelectorAll('.tile,.rv,.mask,.bento li').forEach(e => e.classList.add('in'));
    const im = [...document.querySelectorAll('img')];
    await Promise.all(im.map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
  });
  await p.waitForTimeout(1500);
  await p.locator('#closeup').screenshot({ path: `${out}/f-close.jpg`, quality: 80, type: 'jpeg' });
  await p.locator('#shop').screenshot({ path: `${out}/f-shop.jpg`, quality: 78, type: 'jpeg' });
  await c.close();
}

// phone
{
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await c.newPage();
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(async () => {
    document.querySelectorAll('.tile,.rv,.mask,.bento li').forEach(e => e.classList.add('in'));
    const im = [...document.querySelectorAll('.macro img,.tile img')];
    await Promise.all(im.map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
  });
  await p.waitForTimeout(1500);
  await p.locator('#closeup').screenshot({ path: `${out}/f-m-close.jpg`, quality: 72, type: 'jpeg' });
  await p.evaluate(() => document.querySelector('#offline').scrollIntoView({ behavior: 'instant' }));
  await p.waitForTimeout(400);
  await p.locator('#offline').screenshot({ path: `${out}/f-m-off.jpg`, quality: 76, type: 'jpeg' });
  await p.locator('[data-switch]').tap(); await p.waitForTimeout(1100);
  await p.locator('#offline').screenshot({ path: `${out}/f-m-off2.jpg`, quality: 76, type: 'jpeg' });
  await p.evaluate(() => { location.hash = '/deep-red-logo-zip-hoodie'; });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/f-m-sheet.jpg`, quality: 76, type: 'jpeg' });
  await c.close();
}
await b.close();
