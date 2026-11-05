// node tools/heroshot.mjs <outdir> [tag] : renders the 3D hero on the real GPU at several moments
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
const out = process.argv[2], tag = process.argv[3] || 'h', URL = 'http://localhost:4780/';
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errs = [];
async function shots(name, vp, extra = {}) {
  const c = await b.newContext({ viewport: vp, ...extra });
  const p = await c.newPage();
  p.on('console', m => { if (['error', 'warning'].includes(m.type()) && !/GPU stall|GL Driver/.test(m.text())) errs.push(name + ': ' + m.text().slice(0, 240)); });
  p.on('pageerror', e => errs.push(name + ': ' + e.message));
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForFunction(() => document.documentElement.dataset.hero === 'ready' || !document.documentElement.classList.contains('gl'), null, { timeout: 25000 });
  console.log(name, 'gl:', await p.evaluate(() => document.documentElement.classList.contains('gl')));
  if (name === 'd') {
    for (const [i, ms] of [[0, 260], [1, 420]]) { await p.waitForTimeout(ms); await p.screenshot({ path: `${out}/${tag}-arrive${i}.jpg`, quality: 80, type: 'jpeg' }); }
  }
  await p.waitForTimeout(3000);
  await p.screenshot({ path: `${out}/${tag}-${name}.jpg`, quality: 88, type: 'jpeg' });
  return { c, p };
}
const { c, p } = await shots('d', { width: 1440, height: 900 });
await p.waitForTimeout(2600);
await p.screenshot({ path: `${out}/${tag}-d2.jpg`, quality: 88, type: 'jpeg' });
// every angle, held mid-drag
await p.mouse.move(420, 300); await p.mouse.down();
for (const [i, dx] of [[0, 60], [1, 105], [2, 170]]) {
  await p.mouse.move(420 + dx * (i + 1), 300, { steps: 6 });
  await p.waitForTimeout(350);
  await p.screenshot({ path: `${out}/${tag}-angle${i}.jpg`, quality: 82, type: 'jpeg', clip: { x: 340, y: 60, width: 760, height: 760 } });
}
await p.mouse.up();
await p.waitForTimeout(5000);
// frame rate over three seconds
const fps = await p.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = t => { n++; t - t0 < 3000 ? requestAnimationFrame(f) : r(Math.round(n / ((t - t0) / 1000))); }; requestAnimationFrame(f); }));
console.log('fps', fps);
const H = await p.evaluate(() => document.querySelector('#hero').offsetHeight - innerHeight);
for (const [i, f] of [[0, .35], [1, .65], [2, .88]]) {
  await p.evaluate(y => scrollTo({ top: y, behavior: 'instant' }), H * f);
  await p.waitForTimeout(700);
  await p.screenshot({ path: `${out}/${tag}-scroll${i}.jpg`, quality: 85, type: 'jpeg' });
}
await c.close();
const m = await shots('m', { width: 390, height: 844 }, { deviceScaleFactor: 2, hasTouch: true, isMobile: true });
await m.c.close();
await b.close();
console.log(errs.length ? 'ISSUES\n' + [...new Set(errs)].slice(0, 12).join('\n') : 'no console issues');
