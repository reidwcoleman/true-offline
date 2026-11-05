// Contact sheet of a mesh from several angles: node tools/meshshot.mjs <out.png> <garment> [clay]
import { createRequire } from 'module';
import path from 'path';
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(process.env.HOME, '.nvm/versions/node', process.version, 'lib/node_modules/@playwright/cli/node_modules/playwright'));
const [out, name = 'blossom', clay] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 640, height: 520 } });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto(`http://localhost:4780/_viewer.html?g=${name}${clay ? '&clay=1' : ''}`);
await p.waitForFunction('window.ready');
const shots = [[0, 0], [.6, 0], [1.25, 0], [Math.PI / 2, 0], [2.3, 0], [Math.PI, 0], [.5, .35], [.3, -.45]];
const bufs = [];
for (const [ry, rx] of shots) { await p.evaluate(([a, c]) => pose(a, c), [ry, rx]); bufs.push((await p.screenshot()).toString('base64')); }
const sheet = await b.newPage({ viewport: { width: 2560, height: 1040 } });
await sheet.setContent(`<body style="margin:0;display:grid;grid-template-columns:repeat(4,640px);background:#000">${bufs.map(x => `<img src="data:image/png;base64,${x}">`).join('')}</body>`);
await sheet.screenshot({ path: out });
await b.close();
