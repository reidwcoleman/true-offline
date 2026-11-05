// node tools/shot.mjs <outdir> : screenshots + console errors + a real offline test against localhost:4780
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const root = path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules');
const { chromium } = require(path.join(root, '@playwright/cli/node_modules/playwright'));
const out = process.argv[2], URL = 'http://localhost:4780/';
const b = await chromium.launch({ executablePath: process.env.CHROME });
const errs = [];
async function run(name, vp, mobile) {
  const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: mobile ? 2 : 1, hasTouch: !!mobile, isMobile: !!mobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  p.on('requestfailed', r => errs.push(name + ' FAILED ' + r.url()));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(650);
  await p.screenshot({ path: `${out}/${name}-0intro.jpg`, quality: 80, type: 'jpeg' });
  await p.waitForTimeout(2200);
  await p.screenshot({ path: `${out}/${name}-1hero.jpg`, quality: 80, type: 'jpeg' });
  const turn = await p.evaluate(() => { const s = document.querySelector('#turn'); return { top: s.offsetTop, h: s.offsetHeight - innerHeight }; });
  for (const [i, f] of [[0, .05], [1, .2], [2, .33], [3, .7]]) {
    await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), turn.top + turn.h * f);
    await p.waitForTimeout(350);
    await p.screenshot({ path: `${out}/${name}-2turn${i}.jpg`, quality: 80, type: 'jpeg' });
  }
  await p.evaluate(() => document.querySelector('#closeup').scrollIntoView({ behavior: 'instant' }));
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${out}/${name}-2close.jpg`, quality: 80, type: 'jpeg' });
  await p.evaluate(() => document.querySelector('#shop').scrollIntoView({ behavior: 'instant' }));
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${out}/${name}-3shop.jpg`, quality: 80, type: 'jpeg' });
  await p.evaluate(() => document.querySelector('#offline').scrollIntoView({ behavior: 'instant' }));
  await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/${name}-4off.jpg`, quality: 80, type: 'jpeg' });
  await p.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
  await p.waitForTimeout(300);
  await p.screenshot({ path: `${out}/${name}-5foot.jpg`, quality: 80, type: 'jpeg' });
  const over = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  console.log(name, 'horizontal overflow', over);
  await p.evaluate(() => { location.hash = '/autumn-waffle-knit'; });
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/${name}-6sheet.jpg`, quality: 80, type: 'jpeg' });
  await ctx.close();
}
await run('d', { width: 1440, height: 900 });
await run('m', { width: 390, height: 844 }, true);

// real offline: wait for the SW, kill the network, reload, open a piece
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto(URL, { waitUntil: 'networkidle' });
await p.evaluate(() => navigator.serviceWorker.ready);
await p.waitForTimeout(3000);
console.log('saved label:', await p.textContent('[data-saved]'));
await ctx.setOffline(true);
await p.reload({ waitUntil: 'load' });
await p.waitForTimeout(1200);
const r = await p.evaluate(async () => {
  const imgs = [...document.querySelectorAll('.tile-img img')];
  await Promise.all(imgs.map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
  return { online: navigator.onLine, tiles: imgs.length, loaded: imgs.filter(i => i.naturalWidth > 0).length, status: document.querySelector('.bar-status').innerText, hero: document.querySelector('[data-hero-line]').textContent, title: document.querySelector('[data-off-title]').textContent };
});
console.log('offline:', JSON.stringify(r));
await p.evaluate(() => document.querySelector('#offline').scrollIntoView({ behavior: 'instant' }));
await p.waitForTimeout(400);
await p.screenshot({ path: `${out}/x-offline.jpg`, quality: 80, type: 'jpeg' });
await p.evaluate(() => { location.hash = '/logo-wash-jorts'; });
await p.waitForTimeout(700);
await p.screenshot({ path: `${out}/x-offline-sheet.jpg`, quality: 80, type: 'jpeg' });
console.log('buy:', (await p.textContent('[data-s-buy]')).trim(), '| img ok:', await p.evaluate(() => document.querySelector('[data-sf]').naturalWidth));
await b.close();
console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].slice(0, 15).join('\n') : 'no console errors');
