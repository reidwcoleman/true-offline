// node tools/shot.mjs <outdir> : screenshots + console errors against localhost:4780
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const root = path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules');
const { chromium } = require(path.join(root, '@playwright/cli/node_modules/playwright'));
const out = process.argv[2], URL = 'http://localhost:4780/';
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
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
  await p.evaluate(() => document.querySelector('#shop').scrollIntoView({ behavior: 'instant' }));
  await p.waitForTimeout(1300);
  await p.screenshot({ path: `${out}/${name}-3shop.jpg`, quality: 80, type: 'jpeg' });
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

await b.close();
console.log(errs.length ? 'ERRORS\n' + [...new Set(errs)].slice(0, 15).join('\n') : 'no console errors');
