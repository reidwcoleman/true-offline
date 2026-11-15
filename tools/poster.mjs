// node tools/poster.mjs : stills of the 3D stage, shown on touch screens while the live scene starts.
// SITE_URL is the site to shoot (default localhost:4780). CHROME may point at a Chromium to use.
// Writes tools/_poster-tall.png and tools/_poster-wide.png; tools/studio/run.py turns them into webp.
import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
const require = createRequire(import.meta.url);
const here = path.dirname(new URL(import.meta.url).pathname);
const places = [path.join(here, 'node_modules/playwright'), path.join(process.env.HOME || '', '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright')];
const { chromium } = require(places.find(p => fs.existsSync(p)) || 'playwright');
const URL_ = process.env.SITE_URL || 'http://localhost:4780/';

async function shoot(args) {
  const b = await chromium.launch({ executablePath: process.env.CHROME || undefined, args });
  try {
    for (const [name, width, height, dsf] of [['tall', 390, 844, 2], ['wide', 1180, 820, 1]]) {
      const c = await b.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: true, isMobile: true });
      const p = await c.newPage();
      await p.goto(URL_, { waitUntil: 'load' });
      await p.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 90000 });
      await p.addStyleTag({ content: '.bar,.hero-foot,.gl-poster{display:none!important}' });
      await p.waitForTimeout(2600);
      await p.screenshot({ path: path.join(here, `_poster-${name}.png`) });
      await c.close();
    }
  } finally { await b.close(); }
}
// The real GPU first. A machine without one (a server) draws it in software, which is slow but the same picture.
try { await shoot(['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist']); }
catch (e) { console.log('no GPU path, drawing in software:', String(e.message).split('\n')[0]); await shoot(['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist']); }
