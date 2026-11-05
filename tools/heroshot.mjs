// node tools/heroshot.mjs <outdir> [tag] : renders the 3D stage and Up Close on the real GPU
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
const out = process.argv[2], tag = process.argv[3] || 'h', URL = 'http://localhost:4780/';
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];
const shot = (p, n, extra = {}) => p.screenshot({ path: `${out}/${tag}-${n}.jpg`, quality: 86, type: 'jpeg', ...extra });

async function open(name, vp, extra = {}) {
  const c = await b.newContext({ viewport: vp, ...extra });
  const p = await c.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/GPU stall|GL Driver/.test(m.text())) errs.push(name + ': ' + m.text().slice(0, 240)); });
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 30000 });
  await p.waitForFunction(() => document.documentElement.dataset.stops === 'ready', null, { timeout: 30000 });
  return { c, p };
}
async function tour(p, n) {
  await p.waitForTimeout(3300);
  await shot(p, `${n}-hero`);
  // the automatic turn shows the front at about eight seconds in
  await p.waitForTimeout(6200);
  await shot(p, `${n}-front`);
  const m = await p.evaluate(() => ({ heroH: document.querySelector('#hero').offsetHeight - innerHeight, turn: document.querySelector('#turn').offsetTop, turnH: document.querySelector('#turn').offsetHeight - innerHeight, close: document.querySelector('#closeup').offsetTop, closeH: document.querySelector('#closeup').offsetHeight - innerHeight }));
  const go = async (y, wait = 500) => { await p.evaluate(v => scrollTo({ top: v, behavior: 'instant' }), y); await p.waitForTimeout(wait); };
  await go(m.heroH * .6); await shot(p, `${n}-dive`);
  await go(m.turn + m.turnH * .03); await shot(p, `${n}-t0`);
  await go(m.turn + m.turnH * .15, 700); await shot(p, `${n}-t1`);
  await go(m.turn + m.turnH * .25, 700); await shot(p, `${n}-tswap`);
  await go(m.turn + m.turnH * .4, 700); await shot(p, `${n}-t2`);
  await go(m.turn + m.turnH * .9, 700); await shot(p, `${n}-t3`);
  await go(m.close + 4, 900); await shot(p, `${n}-c0`);
  await go(m.close + m.closeH * .26, 700); await shot(p, `${n}-c1`);
  await go(m.close + m.closeH * .58, 700); await shot(p, `${n}-c2`);
  await go(m.close + m.closeH * .995, 700); await shot(p, `${n}-c3`);
}

const d = await open('d', { width: 1440, height: 900 });
await tour(d.p, 'd');
await d.p.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
await d.p.waitForTimeout(600);
const fps = await d.p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = t => { n++; t - t0 < 3000 ? requestAnimationFrame(f) : r(Math.round(n / ((t - t0) / 1000))); }; requestAnimationFrame(f); }));
console.log('fps at the hero', fps);
await d.c.close();
const m = await open('m', { width: 390, height: 844 }, { deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await tour(m.p, 'm');
await m.c.close();
await b.close();
console.log(errs.length ? 'ISSUES\n' + [...new Set(errs)].slice(0, 12).join('\n') : 'no console issues');
