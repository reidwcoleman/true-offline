// node tools/og.mjs : renders the 1200x630 share image from the live hero
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
const b = await chromium.launch({ executablePath: process.env.CHROME });
const c = await b.newContext({ viewport: { width: 1200, height: 630 }, reducedMotion: 'reduce' });
const p = await c.newPage();
await p.goto('http://localhost:4780/', { waitUntil: 'networkidle' });
await p.addStyleTag({ content: '.bar,.hero-foot{display:none}' });
await p.waitForTimeout(500);
await p.screenshot({ path: 'site/img/og.jpg', quality: 86, type: 'jpeg' });
await b.close();
