// node tools/interact.mjs <outdir> : exercises every interaction against localhost:4780
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
const out = process.argv[2], URL = 'http://localhost:4780/';
const b = await chromium.launch({ executablePath: process.env.CHROME });
const errs = [];
let fails = 0;
const ok = (name, cond, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(e.message));
await p.goto(URL, { waitUntil: 'networkidle' });

// data integrity
const data = await p.evaluate(() => window.TO_PRODUCTS.map(x => ({ n: x.name, e: x.etsy, p: x.price, s: x.sizes.length, r: x.rows.length, full: x.rows.every(r => r.inch.length === x.sizes.length && r.cm.length === x.sizes.length) })));
ok('20 products', data.length === 20);
ok('every product has a real listing url + price', data.every(d => /^https:\/\/www\.etsy\.com\/listing\/\d+\//.test(d.e) && d.p > 0));
ok('every size table is complete', data.every(d => d.s >= 4 && d.r >= 3 && d.full));

// filters
await p.evaluate(() => document.querySelector('#shop').scrollIntoView({ behavior: 'instant' }));
const vis = () => p.evaluate(() => [...document.querySelectorAll('.tile')].filter(t => !t.hidden).length);
ok('all 20 shown', await vis() === 20);
for (const [c, n] of [['Hoodies', 8], ['Tops', 4], ['Sweats', 5], ['Shorts', 3]]) {
  await p.click(`[data-c="${c}"]`); await p.waitForTimeout(350);
  ok(`filter ${c}`, await vis() === n);
  if (c === 'Sweats') { await p.evaluate(() => document.querySelector('[data-grid]').scrollIntoView({ behavior: 'instant', block: 'start' })); await p.waitForTimeout(600); await p.screenshot({ path: `${out}/i-sweats.jpg`, quality: 80, type: 'jpeg' }); }
}
await p.click('[data-c="All"]'); await p.waitForTimeout(350);

// hover shows the back
const tile = p.locator('.tile a').nth(2);
await tile.scrollIntoViewIfNeeded(); await tile.hover(); await p.waitForTimeout(500);
ok('hover turns tile to back', await tile.locator('.b').evaluate(e => getComputedStyle(e).opacity === '1'));
await p.screenshot({ path: `${out}/i-hover.jpg`, quality: 80, type: 'jpeg' });

// open by click, focus goes in, scroll locked
const y0 = await p.evaluate(() => scrollY);
await tile.click(); await p.waitForTimeout(500);
ok('click opens sheet', await p.isVisible('[data-sheet]'));
ok('hash route set', (await p.evaluate(() => location.hash)) === '#/blossom-baggy-zip-hoodie');
ok('focus moved into sheet', await p.evaluate(() => document.activeElement.matches('[data-close]')));
ok('title updated', (await p.title()).startsWith('Blossom'));
const buy = await p.getAttribute('[data-s-buy]', 'href');
ok('buy links to its own listing', buy.includes('/listing/4598064712/'), buy);

// drag to turn
const st = await p.locator('[data-sheet-stage]').boundingBox();
const val = () => p.getAttribute('[data-sheet-stage]', 'aria-valuetext');
await p.mouse.move(st.x + st.width * .7, st.y + st.height / 2); await p.mouse.down();
await p.mouse.move(st.x + st.width * .5, st.y + st.height / 2, { steps: 8 });
await p.screenshot({ path: `${out}/i-mid.jpg`, quality: 80, type: 'jpeg' });
await p.mouse.move(st.x + st.width * .2, st.y + st.height / 2, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(550);
ok('drag turns to back', await val() === 'Back');
await p.screenshot({ path: `${out}/i-back.jpg`, quality: 80, type: 'jpeg' });
await p.mouse.click(st.x + st.width / 2, st.y + st.height / 2); await p.waitForTimeout(550);
ok('tap flips to front', await val() === 'Front');
await p.click('[data-side="1"]'); await p.waitForTimeout(550);
ok('Back button', await val() === 'Back');
await p.focus('[data-sheet-stage]'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(550);
ok('arrow key on stage turns, does not change product', await val() === 'Front' && (await p.evaluate(() => location.hash)) === '#/blossom-baggy-zip-hoodie');

// sizes + units
await p.click('[data-z="L"]');
ok('size highlights its column', await p.locator('.meas td.on').count() > 0);
const inch = await p.locator('.meas tbody tr').first().locator('td').nth(2).textContent();
await p.click('[data-unit="cm"]');
const cm = await p.locator('.meas tbody tr').first().locator('td').nth(2).textContent();
ok('units convert', Math.abs(parseFloat(inch) * 2.54 - parseFloat(cm)) < 1, `${inch} in / ${cm} cm`);
await p.click('[data-unit="inch"]');

// next/prev, esc, focus trap, return
await p.click('[data-next]'); await p.waitForTimeout(300);
ok('next product', (await p.textContent('[data-s-name]')) !== 'Blossom Baggy Zip Hoodie');
await p.click('[data-prev]'); await p.waitForTimeout(300);
for (let i = 0; i < 30; i++) await p.keyboard.press('Tab');
ok('focus stays trapped', await p.evaluate(() => !!document.activeElement.closest('[data-sheet]')));
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok('esc closes', !(await p.isVisible('[data-sheet]')));
ok('scroll position kept', Math.abs((await p.evaluate(() => scrollY)) - y0) < 4);
ok('hash cleared', (await p.evaluate(() => location.hash)) === '');

// colourway
await p.goto(URL + '#/autumn-waffle-knit', { waitUntil: 'networkidle' }); await p.waitForTimeout(400);
ok('deep link opens sheet', await p.isVisible('[data-sheet]'));
await p.click('[data-k="ivory"]'); await p.waitForTimeout(400);
ok('colourway swaps image', (await p.getAttribute('[data-sf]', 'src')).includes('-ivory-'));
ok('ivory image loads', await p.evaluate(() => document.querySelector('[data-sf]').naturalWidth > 0));

// every large image exists
const missing = await p.evaluate(async () => {
  const urls = window.TO_PRODUCTS.flatMap(x => (x.colours ? x.colours.map(c => '-' + c.key) : ['']).flatMap(c => ['front', 'back'].map(s => `img/${x.img}${c}-${s}.webp`)));
  const r = await Promise.all(urls.map(u => fetch(u).then(r => (r.ok ? null : u))));
  return r.filter(Boolean);
});
ok('all large images resolve', missing.length === 0, missing.join(' '));
await ctx.close();

// other viewports
for (const [n, w, h] of [['wide', 1920, 1080], ['short', 1280, 660], ['tablet', 820, 1180]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const q = await c.newPage();
  await q.goto(URL, { waitUntil: 'networkidle' }); await q.waitForTimeout(1500);
  await q.screenshot({ path: `${out}/v-${n}.jpg`, quality: 78, type: 'jpeg' });
  ok(`${n}: no sideways scroll`, await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  const clip = await q.evaluate(() => { const e = document.querySelector('.foot-wm'), r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { l: b.left, r: b.right, w: innerWidth }; });
  ok(`${n}: footer wordmark fits`, clip.l >= 0 && clip.r <= clip.w, JSON.stringify(clip));
  await c.close();
}
await b.close();
console.log(errs.length ? 'CONSOLE ERRORS\n' + [...new Set(errs)].join('\n') : 'no console errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
