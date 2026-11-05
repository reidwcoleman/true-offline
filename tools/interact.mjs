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

// intro plays, then gets out of the way, and only once per visit
ok('intro armed on first visit', await p.evaluate(() => document.documentElement.classList.contains('intro')));
await p.waitForTimeout(1700);
ok('intro has left the screen', await p.evaluate(() => getComputedStyle(document.querySelector('.intro-layer')).visibility === 'hidden'));
await p.reload({ waitUntil: 'networkidle' });
ok('intro skipped on reload', !(await p.evaluate(() => document.documentElement.classList.contains('intro'))));

// data integrity
const data = await p.evaluate(() => window.TO_PRODUCTS.map(x => ({ n: x.name, e: x.etsy, p: x.price, s: x.sizes.length, r: x.rows.length, full: x.rows.every(r => r.inch.length === x.sizes.length && r.cm.length === x.sizes.length) })));
ok('20 products', data.length === 20);
ok('every product has a real listing url + price', data.every(d => /^https:\/\/www\.etsy\.com\/listing\/\d+\//.test(d.e) && d.p > 0));
ok('every size table is complete', data.every(d => d.s >= 4 && d.r >= 3 && d.full));
ok('every product appears once in the grid', await p.evaluate(() => new Set([...document.querySelectorAll('.tile')].map(t => t.dataset.slug)).size === 20 && !document.querySelector('.tile a[href="#/undefined"]')));

// up close
await p.evaluate(() => document.querySelector('#closeup').scrollIntoView({ behavior: 'instant' }));
await p.waitForTimeout(1300);
await p.evaluate(() => document.querySelector('.bento').scrollIntoView({ behavior: 'instant', block: 'end' }));
await p.waitForTimeout(1300);
const bento = await p.evaluate(async () => {
  const im = [...document.querySelectorAll('.macro img')];
  await Promise.all(im.map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
  return { n: im.length, loaded: im.filter(i => i.naturalWidth > 0).length, open: [...document.querySelectorAll('.bento li')].filter(l => l.classList.contains('in')).length };
});
ok('all 6 close-ups load and reveal', bento.n === 6 && bento.loaded === 6 && bento.open === 6, JSON.stringify(bento));
const holes = await p.evaluate(() => { const g = document.querySelector('.bento').getBoundingClientRect(); const area = [...document.querySelectorAll('.bento li')].reduce((a, l) => { const r = l.getBoundingClientRect(); return a + r.width * r.height; }, 0); return area / (g.width * g.height); });
ok('bento has no holes', holes > .93, holes.toFixed(3));
await p.screenshot({ path: `${out}/i-bento.jpg`, quality: 82, type: 'jpeg' });

// filters
await p.evaluate(() => document.querySelector('#shop').scrollIntoView({ behavior: 'instant' }));
await p.waitForTimeout(900);
const vis = () => p.evaluate(() => [...document.querySelectorAll('.tile')].filter(t => !t.hidden).length);
ok('all 20 shown', await vis() === 20);
await p.screenshot({ path: `${out}/i-shop.jpg`, quality: 82, type: 'jpeg' });
for (const [c, n] of [['Hoodies', 8], ['Tops', 4], ['Sweats', 5], ['Shorts', 3]]) {
  await p.click(`[data-c="${c}"]`); await p.waitForTimeout(620);
  ok(`filter ${c}`, await vis() === n);
  const ind = await p.evaluate(() => { const i = document.querySelector('.chip-ind').getBoundingClientRect(), b = document.querySelector('.chips [aria-pressed=true]').getBoundingClientRect(); return Math.abs(i.left - b.left) + Math.abs(i.width - b.width); });
  ok(`chip indicator sits on ${c}`, ind < 2, String(ind));
  if (c === 'Hoodies') await p.screenshot({ path: `${out}/i-hoodies.jpg`, quality: 80, type: 'jpeg' });
}
await p.click('[data-c="All"]'); await p.waitForTimeout(620);

// hover shows the other side; the sheet then opens on that same side
const li = p.locator('.tile:not(.big)').first();
const slug = await li.getAttribute('data-slug');
const tile = li.locator('a');
await tile.scrollIntoViewIfNeeded(); await p.waitForTimeout(900); await tile.hover(); await p.waitForTimeout(600);
ok('hover turns tile to back', await tile.locator('.b').evaluate(e => getComputedStyle(e).opacity === '1'));
await p.screenshot({ path: `${out}/i-hover.jpg`, quality: 80, type: 'jpeg' });
ok('cursor label shows View', await p.evaluate(() => { const c = document.querySelector('[data-cur]'); return c.classList.contains('on') && c.textContent === 'View'; }));

const y0 = await p.evaluate(() => scrollY);
await tile.click(); await p.waitForTimeout(700);
ok('click opens sheet', await p.isVisible('[data-sheet]'));
ok('hash route set', (await p.evaluate(() => location.hash)) === '#/' + slug);
ok('focus moved into sheet', await p.evaluate(() => document.activeElement.matches('[data-close]')));
const val = () => p.getAttribute('[data-sheet-stage]', 'aria-valuetext');
ok('sheet opens on the side that was showing', await val() === 'Back');
ok('no morph name left behind', await p.evaluate(() => [...document.querySelectorAll('img')].every(i => !i.style.viewTransitionName)));
const buy = await p.getAttribute('[data-s-buy]', 'href');
const want = await p.evaluate(s => window.TO_PRODUCTS.find(x => x.slug === s).id, slug);
ok('buy links to its own listing', buy.includes(`/listing/${want}/`), buy);

// drag to turn
await p.click('[data-side="0"]'); await p.waitForTimeout(550);
const st = await p.locator('[data-sheet-stage]').boundingBox();
await p.mouse.move(st.x + st.width * .7, st.y + st.height / 2); await p.mouse.down();
await p.mouse.move(st.x + st.width * .2, st.y + st.height / 2, { steps: 12 }); await p.mouse.up(); await p.waitForTimeout(550);
ok('drag turns to back', await val() === 'Back');
await p.screenshot({ path: `${out}/i-back.jpg`, quality: 80, type: 'jpeg' });
await p.mouse.click(st.x + st.width / 2, st.y + st.height / 2); await p.waitForTimeout(550);
ok('tap flips to front', await val() === 'Front');
await p.click('[data-side="1"]'); await p.waitForTimeout(550);
ok('Back button', await val() === 'Back');
ok('segment indicator moved', (await p.evaluate(() => document.querySelector('[data-seg-ind]').style.transform)).includes('100%'));
await p.focus('[data-sheet-stage]'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(550);
ok('arrow key on stage turns, does not change product', await val() === 'Front' && (await p.evaluate(() => location.hash)) === '#/' + slug);

// sizes + units
await p.click('[data-z="L"]');
ok('size highlights its column', await p.locator('.meas td.on').count() > 0);
const inch = await p.locator('.meas tbody tr').first().locator('td').nth(2).textContent();
await p.click('[data-unit="cm"]');
const cm = await p.locator('.meas tbody tr').first().locator('td').nth(2).textContent();
ok('units convert', Math.abs(parseFloat(inch) * 2.54 - parseFloat(cm)) < 1, `${inch} in / ${cm} cm`);
await p.click('[data-unit="inch"]');

// next/prev, esc, focus trap, return
const name0 = await p.textContent('[data-s-name]');
const nextName = await p.textContent('[data-next-name]');
await p.click('[data-next]'); await p.waitForTimeout(500);
ok('next piece matches its preview', (await p.textContent('[data-s-name]')) === nextName);
await p.click('[data-prev]'); await p.waitForTimeout(500);
ok('previous returns', (await p.textContent('[data-s-name]')) === name0);
for (let i = 0; i < 30; i++) await p.keyboard.press('Tab');
ok('focus stays trapped', await p.evaluate(() => !!document.activeElement.closest('[data-sheet]')));
await p.keyboard.press('Escape'); await p.waitForTimeout(800);
ok('esc closes', !(await p.isVisible('[data-sheet]')));
ok('scroll position kept', Math.abs((await p.evaluate(() => scrollY)) - y0) < 4);
ok('hash cleared', (await p.evaluate(() => location.hash)) === '');
ok('tile styles restored after close', await p.evaluate(() => [...document.querySelectorAll('.tile img')].every(i => !i.style.opacity && !i.style.transform && !i.style.viewTransitionName)));

// feature tile opens on its back print
const bigTile = p.locator('.tile.big a').first();
await bigTile.evaluate(e => e.scrollIntoView({ behavior: 'instant', block: 'center' })); await p.waitForTimeout(900);
await p.mouse.move(2, 2); await p.waitForTimeout(300);
await bigTile.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(700);
ok('keyboard open on feature tile shows the back', await val() === 'Back');
await p.keyboard.press('Escape'); await p.waitForTimeout(700);

// the offline preview switch
await p.evaluate(() => document.querySelector('#offline').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(500);
await p.click('[data-switch]'); await p.waitForTimeout(1100);
ok('preview flips the section', (await p.textContent('[data-off-title]')) === 'There you go.' && await p.evaluate(() => document.body.classList.contains('is-offline')));
await p.screenshot({ path: `${out}/i-preview.jpg`, quality: 82, type: 'jpeg' });
await p.click('[data-switch]'); await p.waitForTimeout(300);
ok('preview flips back', (await p.textContent('[data-off-title]')) === 'Turn your wifi off.');

// colourway
await p.goto(URL + '#/autumn-waffle-knit', { waitUntil: 'networkidle' }); await p.waitForTimeout(500);
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

// reduced motion: nothing stays hidden
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const q = await c.newPage();
  await q.goto(URL, { waitUntil: 'networkidle' });
  ok('reduced motion skips the intro', !(await q.evaluate(() => document.documentElement.classList.contains('intro'))));
  await q.evaluate(() => document.querySelector('#shop').scrollIntoView({ behavior: 'instant' })); await q.waitForTimeout(400);
  ok('reduced motion still reveals', await q.evaluate(() => getComputedStyle(document.querySelector('.tile')).opacity === '1'));
  await c.close();
}

// other viewports
for (const [n, w, h] of [['wide', 1920, 1080], ['short', 1280, 660], ['tablet', 820, 1180]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const q = await c.newPage();
  await q.goto(URL, { waitUntil: 'networkidle' }); await q.waitForTimeout(2600);
  await q.screenshot({ path: `${out}/v-${n}.jpg`, quality: 78, type: 'jpeg' });
  ok(`${n}: no sideways scroll`, await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await q.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await q.waitForTimeout(500);
  const clip = await q.evaluate(() => { const e = document.querySelector('.foot-wm'), r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: innerWidth, s: e.style.fontStretch }; });
  ok(`${n}: footer wordmark fits at full stretch`, clip.l >= 0 && clip.r <= clip.w && parseFloat(clip.s) === 125, JSON.stringify(clip));
  await c.close();
}
await b.close();
console.log(errs.length ? 'CONSOLE ERRORS\n' + [...new Set(errs)].join('\n') : 'no console errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
