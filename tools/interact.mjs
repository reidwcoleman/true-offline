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
ok('no fade or flash between the hero and the showcases', await p.evaluate(() => !document.querySelector('[data-hero-fade]')));
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

// removed on request: Up close and the rear ring text
ok('Up close is gone', await p.evaluate(() => !document.querySelector('#closeup,[data-close-track],.cc') && !/up close/i.test(document.body.innerText)));
ok('Raleigh is off the ring', !/RALEIGH/.test(await p.evaluate(() => fetch('hero.js').then(r => r.text()))));

// every garment is one closed mesh: an edge is shared by two faces, or it is seam, or a listed open end
const meshes = await p.evaluate(async () => {
  const out = {};
  for (const n of ['blossom', 'pagoda', 'globe', 'rooster', 'dreamer']) {
    const buf = await fetch(`img/hero/${n}.bin`).then(r => r.arrayBuffer());
    const [nV, nT, nE] = new Uint32Array(buf, 0, 4);
    let o = 16;
    const zf = new Int16Array(buf, o + nV * 4, nV), zb = new Int16Array(buf, o + nV * 6, nV);
    o += nV * 12;
    const tri = new Uint16Array(buf, o, nT * 3); o += nT * 6;
    const oe = new Uint16Array(buf, o, nE * 2);
    const key = (a, b) => (a < b ? a * 70000 + b : b * 70000 + a);
    const cnt = new Map();
    for (let t = 0; t < nT; t++) for (const [a, b] of [[0, 1], [1, 2], [2, 0]]) { const k = key(tri[t * 3 + a], tri[t * 3 + b]); cnt.set(k, (cnt.get(k) || 0) + 1); }
    const open = new Set(); for (let e = 0; e < nE; e++) open.add(key(oe[e * 2], oe[e * 2 + 1]));
    let bad = 0, odd = 0;
    for (const [k, c] of cnt) {
      if (c > 2) odd++;
      if (c !== 1) continue;
      const a = Math.floor(k / 70000), b = k % 70000;
      if (!(zf[a] === zb[a] && zf[b] === zb[b]) && !open.has(k)) bad++;
    }
    out[n] = { nV, nT, bad, odd };
  }
  return out;
});
for (const [n, m] of Object.entries(meshes)) ok(`${n} mesh is closed`, m.bad === 0 && m.odd === 0 && m.nV > 5000, JSON.stringify(m));

// the hero reacts
await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(700);
await p.click('[data-picker] button:nth-child(3)'); await p.waitForTimeout(1500);
ok('picker puts the Globe on the hero', (await p.evaluate(() => window.TO_hero.state().piece)) === 'globe');
ok('picker names the piece and links to it', await p.evaluate(() => { const a = document.querySelector('[data-picker-now]'); return /Deep Red/i.test(a.textContent) && a.getAttribute('href') === '#/deep-red-logo-zip-hoodie'; }));
await p.screenshot({ path: `${out}/i-picker.jpg`, quality: 82, type: 'jpeg' });
await p.click('[data-picker] button:nth-child(1)'); await p.waitForTimeout(1400);
const vw = await p.evaluate(() => [innerWidth, innerHeight]);
await p.mouse.click(vw[0] * .9, vw[1] * .2); await p.waitForTimeout(200);
ok('a tap throws petals', (await p.evaluate(() => window.TO_hero.state().bursts)) === 1);
await p.screenshot({ path: `${out}/i-burst.jpg`, quality: 82, type: 'jpeg' });
const lp = await p.evaluate(() => window.TO_ringReach());
await p.mouse.click(lp.left + 60, vw[1] * .62); await p.waitForTimeout(150);
const st0 = await p.evaluate(() => window.TO_hero.state());
ok('a tap on the wordmark flips a letter, or misses into petals', st0.flips + st0.bursts >= 2, JSON.stringify(st0));

// filters
await p.evaluate(() => document.querySelector('#shop').scrollIntoView({ behavior: 'instant' }));
await p.waitForTimeout(900);
const vis = () => p.evaluate(() => [...document.querySelectorAll('.tile')].filter(t => !t.hidden).length);
ok('all 20 shown', await vis() === 20);
await p.screenshot({ path: `${out}/i-shop.jpg`, quality: 82, type: 'jpeg' });
for (const [c, n] of [['Hoodies', 8], ['Tops', 4], ['Sweats', 5], ['Shorts', 3]]) {
  await p.click(`[data-c="${c}"]`); await p.waitForTimeout(620);
  ok(`filter ${c}`, await vis() === n);
  const ind = await p.evaluate(() => { const i = document.querySelector('.chip-ind').getBoundingClientRect(), b = document.querySelector('.chips [aria-pressed=true]').getBoundingClientRect(); return Math.abs(i.left + i.width / 2 - b.left - b.width / 2); });
  ok(`chip indicator sits on ${c}`, ind < 2, String(ind));
  if (c === 'Hoodies') await p.screenshot({ path: `${out}/i-hoodies.jpg`, quality: 80, type: 'jpeg' });
}
await p.click('[data-c="All"]'); await p.waitForTimeout(620);

// sorting
const prices = () => p.evaluate(() => [...document.querySelectorAll('.tile')].filter(t => !t.hidden).map(t => +t.dataset.price));
await p.selectOption('[data-sort]', 'low'); await p.waitForTimeout(620);
let ps = await prices();
ok('sort low to high', ps.every((v, i) => !i || ps[i - 1] <= v));
await p.selectOption('[data-sort]', 'high'); await p.waitForTimeout(620);
ps = await prices();
ok('sort high to low', ps.every((v, i) => !i || ps[i - 1] >= v));
await p.selectOption('[data-sort]', 'featured'); await p.waitForTimeout(620);
ok('featured order comes back', await p.evaluate(() => document.querySelector('.tile').classList.contains('big') && !document.querySelector('.grid').classList.contains('filtered')));
const sticky = await p.evaluate(async () => { scrollTo({ top: document.querySelector('.grid').getBoundingClientRect().top + scrollY + 900, behavior: 'instant' }); await new Promise(r => setTimeout(r, 400)); const r = document.querySelector('[data-line-bar]').getBoundingClientRect(); return r.top; });
ok('filter bar stays with you', sticky >= 0 && sticky < 70, String(sticky));

// hover shows the other side; the sheet then opens on that same side
const li = p.locator('.tile:not(.big)').first();
const slug = await li.getAttribute('data-slug');
const tile = li.locator('a');
await tile.scrollIntoViewIfNeeded(); await p.waitForTimeout(900);
const plate = li.locator('.tile-plate');
await plate.hover({ position: { x: 20, y: 80 } }); await p.waitForTimeout(500);
ok('left side of a tile shows the first side', await tile.locator('.f').evaluate(e => +getComputedStyle(e).opacity > .95));
ok('tile tilts toward the pointer', await li.locator('.tile-card').evaluate(e => /rotateY\(-/.test(e.style.transform)), await li.locator('.tile-card').evaluate(e => e.style.transform));
const pb = await plate.boundingBox();
await plate.hover({ position: { x: pb.width - 20, y: 80 } }); await p.waitForTimeout(700);
ok('moving across turns the tile to the back', await tile.locator('.b').evaluate(e => +getComputedStyle(e).opacity > .95));
ok('sizes show on hover', await li.locator('.tile-sizes').evaluate(e => getComputedStyle(e).transform === 'none' || /, 0\)$/.test(getComputedStyle(e).transform)));
ok('other tiles step back', await p.locator('.tile:not(.big)').nth(1).evaluate(e => +getComputedStyle(e).opacity < .8));
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

// section links glide to their section; product links stay routes
await p.evaluate(() => { location.hash = ''; }); await p.waitForTimeout(800);
await p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' })); await p.waitForTimeout(500);
await p.click('.bar-nav a[href="#fit"]'); await p.waitForTimeout(1900);
ok('nav link reaches Build a fit', await p.evaluate(() => Math.abs(document.querySelector('#fit').getBoundingClientRect().top) < 4));

// build a fit
await p.evaluate(() => { location.hash = ''; }); await p.waitForTimeout(700);
await p.evaluate(() => document.querySelector('#fit').scrollIntoView({ behavior: 'instant' })); await p.waitForTimeout(1000);
const bill = () => p.evaluate(() => {
  const a = [...document.querySelectorAll('[data-fit-bill] a')].map(x => x.getAttribute('href').slice(2));
  const img = document.querySelector('[data-row="top"] img').getAttribute('src');
  const pr = s => window.TO_PRODUCTS.find(x => x.slug === s).price;
  const sum = document.querySelector('[data-fit-total]').textContent.trim();
  return { a, sum, want: '$' + (pr(a[0]) + pr(a[1])).toFixed(2) };
});
const b0 = await bill();
ok('fit starts on the blossom hoodie', b0.a[0] === 'blossom-baggy-zip-hoodie', JSON.stringify(b0));
ok('fit total adds up', b0.sum === b0.want, JSON.stringify(b0));
await p.click('[data-reel="top"] ~ [data-go="1"]'); await p.waitForTimeout(900);
const b1 = await bill();
ok('arrow moves the top reel', b1.a[0] !== b0.a[0] && b1.a[1] === b0.a[1], JSON.stringify(b1));
ok('total follows the reel', b1.sum === b1.want, JSON.stringify(b1));
await p.focus('[data-reel="bottom"]'); await p.keyboard.press('ArrowRight'); await p.waitForTimeout(900);
ok('arrow keys move a reel', (await bill()).a[1] !== b1.a[1]);
const rb = await p.locator('[data-reel="top"]').boundingBox();
await p.mouse.move(rb.x + rb.width * .6, rb.y + rb.height / 2); await p.mouse.down();
await p.mouse.move(rb.x + rb.width * .2, rb.y + rb.height / 2, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(1000);
ok('a reel can be dragged', (await bill()).a[0] !== b1.a[0]);
const b2 = await bill();
await p.click('[data-fit-shuffle]'); await p.waitForTimeout(1300);
const b3 = await bill();
ok('shuffle changes the fit', b3.a[0] !== b2.a[0] && b3.a[1] !== b2.a[1] && b3.sum === b3.want, JSON.stringify(b3));
ok('every piece on the reels is a top or a bottom', await p.evaluate(() => document.querySelectorAll('[data-reel="top"] .reel-i').length === 12 && document.querySelectorAll('[data-reel="bottom"] .reel-i').length === 8));
await p.screenshot({ path: `${out}/i-fit.jpg`, quality: 82, type: 'jpeg' });
await p.click('[data-fit-bill] a'); await p.waitForTimeout(700);
ok('a fit piece opens its sheet', await p.isVisible('[data-sheet]'));
await p.keyboard.press('Escape'); await p.waitForTimeout(700);

// type that answers the pointer
await p.evaluate(() => scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })); await p.waitForTimeout(900);
const fw = await p.locator('.foot-wm').boundingBox();
await p.mouse.move(fw.x + fw.width * .2, fw.y + fw.height / 2); await p.waitForTimeout(600);
const wv = await p.evaluate(() => { const l = [...document.querySelectorAll('.foot-wm .wv')]; const w = n => +getComputedStyle(n).fontWeight; return { n: l.length, near: w(l[1]), far: w(l[l.length - 1]), over: document.documentElement.scrollWidth - innerWidth }; });
ok('footer letters react to the pointer', wv.n === 11 && wv.near > wv.far + 200, JSON.stringify(wv));
ok('reacting type never widens the page', wv.over <= 0);
await p.screenshot({ path: `${out}/i-wave.jpg`, quality: 82, type: 'jpeg' });

await ctx.close();

// touch: the page always scrolls, sideways swipes do the spinning, and nothing pushes back
{
  const tc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const t = await tc.newPage();
  t.on('pageerror', e => errs.push(e.message));
  await t.goto(URL, { waitUntil: 'load' });
  await t.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 25000 });
  const cdp = await tc.newCDPSession(t);
  const swipe = (x, y, dx, dy, speed = 900) => cdp.send('Input.synthesizeScrollGesture', { x, y, xDistance: dx, yDistance: dy, speed, gestureSourceType: 'touch' });
  const watch = () => t.evaluate(() => { window.__ys = []; const f = () => { window.__ys.push(document.body.scrollTop); window.__on && requestAnimationFrame(f); }; window.__on = true; f(); });
  const stop = () => t.evaluate(() => { window.__on = false; const y = window.__ys; let back = 0; for (let i = 1; i < y.length; i++) back = Math.max(back, y[i - 1] - y[i]); return { from: y[0], to: y[y.length - 1], back }; });
  ok('touch: the page scrolls inside itself, so the address bar cannot move it', await t.evaluate(() => document.documentElement.classList.contains('inner') && getComputedStyle(document.documentElement).overflowY === 'hidden' && window.scrollY === 0 && document.body.scrollHeight > 4000));
  ok('touch: first screen starts on the poster', await t.evaluate(() => !!document.querySelector('.gl-poster')));
  await t.waitForTimeout(600);
  await swipe(195, 420, -170, 0, 700); await t.waitForTimeout(250);
  ok('touch: a sideways swipe spins the hoodie', (await t.evaluate(() => window.TO_hero.state().spun)) > .4);
  ok('touch: a sideways swipe does not scroll', (await t.evaluate(() => document.body.scrollTop)) === 0);
  const sp0 = await t.evaluate(() => window.TO_hero.state().spun);
  await t.waitForTimeout(3600);
  await watch();
  const spinBefore = await t.evaluate(() => window.TO_hero.state().spun);
  await swipe(195, 620, 0, -520); await t.waitForTimeout(300);
  let r = await stop();
  ok('touch: a swipe up on the 3D scrolls the page', r.to - r.from > 400, JSON.stringify(r));
  ok('touch: scrolling the 3D never pushes back', r.back === 0, JSON.stringify(r));
  // the address bar sliding away changes innerHeight; the timeline must not feel it
  await t.waitForTimeout(500);
  const before = await t.evaluate(() => window.TO_hero.state());
  await t.evaluate(() => { window.__ih = Object.getOwnPropertyDescriptor(window, 'innerHeight'); Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => 760 }); });
  await t.waitForTimeout(500);
  const after = await t.evaluate(() => window.TO_hero.state());
  await t.evaluate(() => Object.defineProperty(window, 'innerHeight', window.__ih));
  ok('touch: the address bar sliding does not move the animation', Math.abs(before.p - after.p) < .002 && Math.abs(before.pos - after.pos) < .002, JSON.stringify([before.p, after.p]));
  // the whole page, top to bottom, in long swipes
  await watch();
  for (let i = 0; i < 26; i++) { await swipe(195, 700, 0, -560, 1800); await t.waitForTimeout(40); }
  r = await stop();
  ok('touch: the whole page scrolls with no push-back', r.to > 4000 && r.back === 0, JSON.stringify(r));
  // shop tiles: vertical goes to the page, sideways shows the back, and a swipe is not a tap
  await t.evaluate(() => { const y = document.querySelector('.grid').getBoundingClientRect().top + document.body.scrollTop; document.body.scrollTo({ top: y + 700, behavior: 'instant' }); });
  await t.waitForTimeout(500);
  const box = await t.evaluate(() => { const l = [...document.querySelectorAll('.tile:not(.big) .tile-plate')].find(e => { const r = e.getBoundingClientRect(); return r.top > 90 && r.bottom < innerHeight - 20; }); l.closest('.tile').id = 'pick'; const r = l.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const y1 = await t.evaluate(() => document.body.scrollTop);
  await swipe(box.x + 50, box.y, -110, 0, 700); await t.waitForTimeout(450);
  ok('touch: a sideways swipe on a piece shows its back', await t.evaluate(() => document.querySelector('#pick a').classList.contains('flip') && +getComputedStyle(document.querySelector('#pick .b')).opacity > .9));
  ok('touch: swiping a piece does not open it or scroll', (await t.evaluate(() => document.body.scrollTop)) === y1 && !(await t.isVisible('[data-sheet]')));
  await watch();
  await swipe(box.x, box.y, 0, -300); await t.waitForTimeout(250);
  r = await stop();
  ok('touch: a swipe up on a piece scrolls the page', r.to - r.from > 200 && r.back === 0, JSON.stringify(r));
  // Build a fit: vertical scroll passes straight through the reels
  await t.evaluate(() => document.querySelector('#fit').scrollIntoView({ behavior: 'instant' })); await t.waitForTimeout(900);
  const rb2 = await t.evaluate(() => { const r = document.querySelector('[data-reel="bottom"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(r.top + r.height / 2, innerHeight - 200) }; });
  await watch();
  await swipe(rb2.x, rb2.y, 0, -260); await t.waitForTimeout(300);
  r = await stop();
  ok('touch: page scrolls when the swipe starts on a reel', r.to - r.from > 150, JSON.stringify(r));
  await tc.close();
}

// every showcase piece drops its own thing, and the first screen keeps the petals
{
  const fc = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const f = await fc.newPage();
  await f.goto(URL, { waitUntil: 'load' });
  await f.waitForFunction(() => document.documentElement.dataset.stops === 'ready', null, { timeout: 25000 });
  const at = async i => { await f.evaluate(k => { const t = document.querySelector('.turn'), r = t.getBoundingClientRect(); scrollTo({ top: scrollY + r.top + (r.height - innerHeight) * (k + .5) / 4, behavior: 'instant' }); }, i); await f.waitForTimeout(900); return f.evaluate(() => window.TO_hero.state().fall); };
  const falls = [await f.evaluate(() => window.TO_hero.state().fall)];
  for (let i = 0; i < 4; i++) falls.push(await at(i));
  ok('falls: petals on the first screen and Pagoda, then one of its own for each piece', falls.join() === '0,0,1,2,3', falls.join());
  await fc.close();
}

// touch flick and stop: the page and the stage hold still once the finger is gone
{
  const tc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const t = await tc.newPage();
  await t.goto(URL, { waitUntil: 'load' });
  await t.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 25000 });
  await t.waitForTimeout(800);
  const cdp = await tc.newCDPSession(t);
  await t.evaluate(() => { window.__l = []; window.__on = true; const c = document.querySelector('canvas'); const f = () => { window.__l.push([document.body.scrollTop, c.getBoundingClientRect().top, window.scrollY]); window.__on && requestAnimationFrame(f); }; f(); });
  for (const d of [-500, -300, -700, 260, -420]) {
    await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 500, yDistance: d, speed: 2600, gestureSourceType: 'touch' });
    await t.waitForTimeout(450);
  }
  const r = await t.evaluate(() => { window.__on = false; const l = window.__l; let flips = 0, dir = 0, stage = 0, win = 0; for (let i = 1; i < l.length; i++) { const d = l[i][0] - l[i - 1][0]; if (d && dir && Math.sign(d) !== dir && Math.abs(d) > 1) flips++; if (d) dir = Math.sign(d); stage = Math.max(stage, Math.abs(l[i][1])); win = Math.max(win, Math.abs(l[i][2])); } return { flips, stage, win, end: l[l.length - 1][0], n: l.length }; });
  ok('touch: flicks only reverse when the finger does, the stage never shifts', r.flips === 2 && r.stage <= 1 && r.win === 0 && r.end > 500, JSON.stringify(r));
  await tc.close();
}

// flick and stop: the 3D timeline must settle forward and never swing back
{
  const fc = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const f = await fc.newPage();
  await f.goto(URL, { waitUntil: 'load' });
  await f.waitForFunction(() => document.documentElement.dataset.stops === 'ready', null, { timeout: 25000 });
  await f.waitForTimeout(600);
  await f.mouse.move(700, 450);
  await f.evaluate(() => { window.__ps = []; window.__on = true; const g = () => { const s = window.TO_hero.state(); window.__ps.push(s.p + s.pos); window.__on && requestAnimationFrame(g); }; g(); });
  for (const n of [4, 3, 5, 2, 6]) {
    for (let i = 0; i < n; i++) await f.mouse.wheel(0, 240);
    await f.waitForTimeout(650);
  }
  const back = await f.evaluate(() => { window.__on = false; const y = window.__ps; let m = 0; for (let i = 1; i < y.length; i++) m = Math.max(m, y[i - 1] - y[i]); return { m, n: y.length, end: y[y.length - 1] }; });
  ok('flick and stop: the animation never swings back', back.m < .0005 && back.end > .4, JSON.stringify(back));
  await fc.close();
}

// desktop wheel: no backward jolts anywhere on the way down
{
  const wc = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const w = await wc.newPage();
  await w.goto(URL, { waitUntil: 'load' });
  await w.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 25000 });
  await w.waitForTimeout(800);
  await w.mouse.move(700, 450);
  await w.evaluate(() => { window.__ys = []; const f = () => { window.__ys.push(scrollY); window.__on && requestAnimationFrame(f); }; window.__on = true; f(); });
  for (let i = 0; i < 60; i++) { await w.mouse.wheel(0, 300); await w.waitForTimeout(60); }
  await w.waitForTimeout(900);
  const r = await w.evaluate(() => { window.__on = false; const y = window.__ys; let back = 0; for (let i = 1; i < y.length; i++) back = Math.max(back, y[i - 1] - y[i]); return { to: y[y.length - 1], back }; });
  ok('desktop: wheel scrolling never jolts backward', r.to > 5000 && r.back <= 1, JSON.stringify(r));
  await wc.close();
}

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
  ok(`${n}: footer wordmark fits`, clip.l >= 0 && clip.r <= clip.w, JSON.stringify(clip));
  await c.close();
}
await b.close();
console.log(errs.length ? 'CONSOLE ERRORS\n' + [...new Set(errs)].join('\n') : 'no console errors');
console.log(fails ? `${fails} FAILED` : 'all passed');
