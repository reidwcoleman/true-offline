// node tools/interact.mjs <outdir> : exercises every interaction against localhost:4780
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
const out = process.argv[2], URL = 'http://localhost:4780/';
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];
let fails = 0;
const innerWidthFor = r => r.w;
const ok = (name, cond, extra = '') => { console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!cond) fails++; };

const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
p.on('pageerror', e => errs.push(e.message));
await p.goto(URL, { waitUntil: 'load' });
await p.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 25000 });
await p.waitForFunction(() => document.documentElement.dataset.stops === 'ready', null, { timeout: 25000 });

// the offline idea is gone for good
const leftovers = await p.evaluate(async () => {
  const text = document.body.innerText.toLowerCase();
  const regs = await navigator.serviceWorker.getRegistrations();
  return { text: /wifi|no signal|reconnect|saved on this device/.test(text), section: !!document.querySelector('#offline,[data-switch],.bar-status'), regs: regs.length };
});
ok('no offline feature left on the page', !leftovers.text && !leftovers.section && leftovers.regs === 0, JSON.stringify(leftovers));

// 3D hero
ok('webgl hero is live', await p.evaluate(() => document.querySelector('[data-gl]').classList.contains('on')));
const paint = await p.evaluate(() => new Promise(res => requestAnimationFrame(() => { const c = document.querySelector('[data-gl]'); res({ w: c.width, h: c.height }); })));
ok('canvas fills the screen', paint.w >= 1440 && paint.h >= 900, JSON.stringify(paint));
const glb = await p.locator('[data-gl]').boundingBox();
await p.mouse.move(glb.width * .5, glb.height * .4); await p.mouse.down();
await p.mouse.move(glb.width * .8, glb.height * .4, { steps: 8 }); await p.mouse.up();
ok('dragging the hero does not scroll the page', (await p.evaluate(() => scrollY)) === 0);
ok('cursor label says Drag to spin', await p.evaluate(() => document.querySelector('[data-cur]').textContent === 'Drag to spin'));
await p.evaluate(() => scrollTo({ top: document.querySelector('#hero').offsetHeight - innerHeight, behavior: 'instant' })); await p.waitForTimeout(400);
ok('scroll dive fades to black into the next section', await p.evaluate(() => +document.querySelector('[data-hero-fade]').style.opacity > .97));
await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));

// the wordmark must be fully on screen: project the outermost letters to pixels
await p.waitForTimeout(3200);   // let the ring finish swinging in
const reach = await p.evaluate(() => window.TO_ringReach ? window.TO_ringReach() : null);
ok('both ends of TRUE OFFLINE are on screen', reach && reach.left > 0 && reach.right < innerWidthFor(reach), JSON.stringify(reach));

// intro plays, then gets out of the way, and only once per visit
ok('intro armed on first visit', await p.evaluate(() => document.documentElement.classList.contains('intro')));
await p.waitForTimeout(1700);
ok('intro has left the screen', await p.evaluate(() => getComputedStyle(document.querySelector('.intro-layer')).visibility === 'hidden'));
await p.reload({ waitUntil: 'load' });
ok('intro skipped on reload', !(await p.evaluate(() => document.documentElement.classList.contains('intro'))));

// data integrity
const data = await p.evaluate(() => window.TO_PRODUCTS.map(x => ({ n: x.name, e: x.etsy, p: x.price, s: x.sizes.length, r: x.rows.length, full: x.rows.every(r => r.inch.length === x.sizes.length && r.cm.length === x.sizes.length) })));
ok('20 products', data.length === 20);
ok('every product has a real listing url + price', data.every(d => /^https:\/\/www\.etsy\.com\/listing\/\d+\//.test(d.e) && d.p > 0));
ok('every size table is complete', data.every(d => d.s >= 4 && d.r >= 3 && d.full));
ok('every product appears once in the grid', await p.evaluate(() => new Set([...document.querySelectorAll('.tile')].map(t => t.dataset.slug)).size === 20 && !document.querySelector('.tile a[href="#/undefined"]')));

// up close: a pinned gallery that moves sideways with the scroll
const cl = await p.evaluate(() => { const s = document.querySelector('#closeup'); return { top: s.offsetTop, span: s.offsetHeight - innerHeight }; });
await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), cl.top + 2); await p.waitForTimeout(500);
const x0 = await p.evaluate(() => new DOMMatrix(getComputedStyle(document.querySelector('[data-close-track]')).transform).m41);
await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), cl.top + cl.span - 2); await p.waitForTimeout(700);
const end = await p.evaluate(async () => {
  const cards = [...document.querySelectorAll('.cc')], im = cards.map(c => c.querySelector('img'));
  await Promise.all(im.map(i => { i.loading = 'eager'; return i.decode().catch(() => {}); }));
  const r = cards[cards.length - 1].getBoundingClientRect();
  return { n: cards.length, loaded: im.filter(i => i.naturalWidth > 0).length, x: new DOMMatrix(getComputedStyle(document.querySelector('[data-close-track]')).transform).m41, lastIn: r.left >= 0 && r.right <= innerWidth + 2, count: document.querySelector('[data-close-n]').textContent, over: document.documentElement.scrollWidth - innerWidth };
});
ok('all 6 close-ups load', end.n === 6 && end.loaded === 6, JSON.stringify(end));
ok('gallery moves sideways with the scroll', end.x < x0 - 400);
ok('last close-up lands on screen', end.lastIn && end.count === '06');
ok('no sideways page scroll from the gallery', end.over <= 0);
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

// no WebGL, or the bundle fails: the flat hero takes over
for (const [n, setup] of [
  ['no webgl', async q => { await q.addInitScript(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : g.call(this, t, ...a); }; }); }],
  ['bundle fails', async q => { await q.route('**/hero.js*', r => r.abort()); }],
]) {
  const c = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const q = await c.newPage();
  await setup(q);
  await q.goto(URL, { waitUntil: 'load' }); await q.waitForTimeout(1900);
  const st = await q.evaluate(() => ({ gl: document.documentElement.classList.contains('gl'), wm: getComputedStyle(document.querySelector('.wm')).display, piece: document.querySelector('.hero-piece img').complete, h: document.querySelector('#hero').offsetHeight / innerHeight }));
  ok(`${n}: flat hero shows`, !st.gl && st.wm !== 'none' && st.piece && st.h < 1.1, JSON.stringify(st));
  await q.screenshot({ path: `${out}/i-fallback.jpg`, quality: 76, type: 'jpeg' });
  await c.close();
}

// reduced motion: nothing stays hidden
{
  const c = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const q = await c.newPage();
  await q.goto(URL, { waitUntil: 'load' });
  await q.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 25000 });
  ok('reduced motion skips the intro', !(await q.evaluate(() => document.documentElement.classList.contains('intro'))));
  await q.evaluate(() => document.querySelector('#shop').scrollIntoView({ behavior: 'instant' })); await q.waitForTimeout(400);
  ok('reduced motion still reveals', await q.evaluate(() => getComputedStyle(document.querySelector('.tile')).opacity === '1'));
  await c.close();
}

// other viewports
for (const [n, w, h] of [['wide', 1920, 1080], ['short', 1280, 660], ['tablet', 820, 1180], ['phone', 390, 844]]) {
  const c = await b.newContext({ viewport: { width: w, height: h } });
  const q = await c.newPage();
  await q.goto(URL, { waitUntil: 'load' });
  await q.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 25000 });
  await q.waitForTimeout(3600);
  await q.screenshot({ path: `${out}/v-${n}.jpg`, quality: 78, type: 'jpeg' });
  const rr = await q.evaluate(() => window.TO_ringReach());
  ok(`${n}: whole wordmark on screen`, rr.left > 0 && rr.right < rr.w, JSON.stringify(rr));
  ok(`${n}: no sideways scroll`, await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await q.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await q.waitForTimeout(500);
  const clip = await q.evaluate(() => { const e = document.querySelector('.foot-wm'), r = document.createRange(); r.selectNodeContents(e); const b = r.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), w: innerWidth, s: e.style.fontStretch }; });
  ok(`${n}: footer wordmark fits at full stretch`, clip.l >= 0 && clip.r <= clip.w && parseFloat(clip.s) === 125, JSON.stringify(clip));
  await c.close();
}
await b.close();
console.log(errs.length ? 'CONSOLE ERRORS\n' + [...new Set(errs)].join('\n') : 'no console errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
