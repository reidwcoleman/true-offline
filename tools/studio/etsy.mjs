// node tools/studio/etsy.mjs <profile dir> <out.html> <url>
// Etsy turns away anything that is not a real browser, so this opens the page in a real Chrome window
// with its own profile and reads the page back over the DevTools protocol. Only the DOM domain is
// used. If Etsy asks for a human check, the window comes to the front and this waits for it.
// Prints one JSON line per event: {state:"open"|"captcha"|"done"|"error", ...}
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const [profile, out, url] = process.argv.slice(2);
const say = o => console.log(JSON.stringify(o));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const APPS = ['Google Chrome', 'Google Chrome Beta', 'Chromium', 'Brave Browser', 'Microsoft Edge'];
const app = APPS.find(a => fs.existsSync(`/Applications/${a}.app`));
if (!app) { say({ state: 'error', error: 'Google Chrome is not installed in /Applications.' }); process.exit(2); }

fs.mkdirSync(profile, { recursive: true });
const portFile = path.join(profile, 'DevToolsActivePort');
fs.rmSync(portFile, { force: true });
// `open -g` starts it without taking the keyboard away from whatever is in front.
spawn('open', ['-g', '-n', '-a', app, '--args', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run',
  '--no-default-browser-check', '--disable-session-crashed-bubble', '--window-size=980,760', '--window-position=60,60', 'about:blank'], { stdio: 'ignore', detached: true }).unref();

let port = 0;
for (let i = 0; i < 80 && !port; i++) {
  await sleep(250);
  try { port = +fs.readFileSync(portFile, 'utf8').split('\n')[0]; } catch (e) { /* not up yet */ }
}
if (!port) { say({ state: 'error', error: 'Chrome did not start.' }); process.exit(2); }

let tabs = null;
for (let i = 0; i < 40 && !tabs; i++) {
  try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); } catch (e) { await sleep(250); }
}
const tab = (tabs || []).find(t => t.type === 'page');
if (!tab) { say({ state: 'error', error: 'Chrome opened without a page.' }); process.exit(2); }

const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
let id = 0;
const waiting = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { waiting.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
const quit = async code => { try { await Promise.race([send('Browser.close'), sleep(1500)]); } catch (e) { /* already gone */ } process.exit(code); };
const html = async () => {
  const d = await send('DOM.getDocument', { depth: 0 });
  if (!d.result) return '';
  const o = await send('DOM.getOuterHTML', { nodeId: d.result.root.nodeId });
  return o.result ? o.result.outerHTML : '';
};

say({ state: 'open' });
await send('Page.navigate', { url });
let page = '', asked = false;
const t0 = Date.now();
// A normal load takes a few seconds. A human check gets three minutes.
while (Date.now() - t0 < (asked ? 180000 : 40000)) {
  await sleep(900);
  page = await html();
  if (/"@type":\s*"Product"/.test(page)) break;
  if (!asked && /captcha-delivery|geo\.captcha|Please enable JS and disable any ad blocker/.test(page) && Date.now() - t0 > 6000) {
    asked = true;
    say({ state: 'captcha' });
    spawn('open', ['-a', app], { stdio: 'ignore' });          // bring the window forward for the person
    await send('Page.bringToFront');
  }
  if (/this item (is|has been) (unavailable|removed)|Sorry, this item is unavailable|page you were looking for was not found/i.test(page)) {
    say({ state: 'error', error: 'Etsy says this listing is not available.' });
    await quit(3);
  }
}
if (!/"@type":\s*"Product"/.test(page)) {
  say({ state: 'error', error: asked ? 'The Etsy check was not finished in time.' : 'Etsy did not show the listing.' });
  await quit(4);
}
fs.writeFileSync(out, page);
say({ state: 'done', bytes: page.length });
await quit(0);
