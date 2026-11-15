/* True Offline studio proxy (Firebase / Cloud Functions v2).
 *
 * Holds the GitHub token so the studio page never has to. The page sends the shared password in an
 * X-Studio-Pass header; if it matches, this forwards the request to GitHub with the real token and
 * returns the answer. The token stays in Secret Manager and never leaves here.
 *
 * Two secrets (set once, see tools/studio/SETUP.md):
 *   GH_TOKEN     a fine-grained GitHub token for the true-offline repo, Contents: Read and write
 *   STUDIO_PASS  the shared password shown on the studio page
 *
 * The token can do nothing but the few calls the studio makes: it only ever touches catalog.json and
 * reads the studio workflow's runs. Everything else is turned away.
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

const GH_TOKEN = defineSecret('GH_TOKEN');
const STUDIO_PASS = defineSecret('STUDIO_PASS');

const OWNER = 'reidwcoleman', REPO = 'true-offline';
const GH = `https://api.github.com/repos/${OWNER}/${REPO}`;

const ALLOW = [
  /^$/,                                               // repo root — used to check the password
  /^\/contents\/catalog\.json(\?.*)?$/,               // read and write the one file
  /^\/actions\/workflows\/studio\.yml\/runs(\?.*)?$/, // watch the build
  /^\/actions\/runs\/\d+\/jobs(\?.*)?$/,              // its steps
];

const okOrigin = o =>
  /^https:\/\/reidwcoleman\.github\.io$/.test(o) ||
  /^http:\/\/localhost(:\d+)?$/.test(o) ||
  /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(o);

exports.studio = onRequest(
  { secrets: [GH_TOKEN, STUDIO_PASS], region: 'us-central1', invoker: 'public', cors: false },
  async (req, res) => {
    const origin = req.get('Origin') || '';
    res.set('Access-Control-Allow-Origin', okOrigin(origin) ? origin : 'https://reidwcoleman.github.io');
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Studio-Pass');
    res.set('Access-Control-Max-Age', '86400');

    if (req.method === 'OPTIONS') return res.status(204).send('');

    if (req.get('X-Studio-Pass') !== STUDIO_PASS.value())
      return res.status(401).json({ message: 'Wrong studio password.' });

    // the path after the function base, GitHub-relative (e.g. /contents/catalog.json?ref=main)
    const raw = req.originalUrl || req.url || '/';
    let [p, qs] = raw.split('?');
    if (p.startsWith('/studio')) p = p.slice('/studio'.length) || '/';   // cloudfunctions.net form
    const path = (p === '/' ? '' : p) + (qs ? '?' + qs : '');

    if (!ALLOW.some(re => re.test(path))) return res.status(403).json({ message: 'That request is not allowed.' });
    if (req.method !== 'GET' && req.method !== 'PUT') return res.status(405).json({ message: 'Method not allowed.' });

    let r;
    try {
      r = await fetch(GH + path, {
        method: req.method,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: 'Bearer ' + GH_TOKEN.value(),
          'User-Agent': 'true-offline-studio',
          ...(req.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: req.method === 'PUT' ? req.rawBody : undefined,
      });
    } catch (e) {
      return res.status(502).json({ message: 'Could not reach GitHub.' });
    }
    const body = await r.text();
    return res.status(r.status).type('application/json').send(body);
  }
);
