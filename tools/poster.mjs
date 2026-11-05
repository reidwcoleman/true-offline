// node tools/poster.mjs : stills of the 3D stage, shown on touch screens while the live scene starts
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const [name, width, height, dsf] of [['tall', 390, 844, 2], ['wide', 1180, 820, 1]]) {
  const c = await b.newContext({ viewport: { width, height }, deviceScaleFactor: dsf, hasTouch: true, isMobile: true });
  const p = await c.newPage();
  await p.goto('http://localhost:4780/', { waitUntil: 'load' });
  await p.waitForFunction(() => document.documentElement.dataset.hero === 'ready', null, { timeout: 30000 });
  await p.addStyleTag({ content: '.bar,.hero-foot,.gl-poster{display:none!important}' });
  await p.waitForTimeout(2600);
  await p.screenshot({ path: `tools/_poster-${name}.png` });
  await c.close();
}
await b.close();
