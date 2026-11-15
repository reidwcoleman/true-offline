/* True Offline studio server (Firebase / Cloud Functions v2).
 *
 * One function, four jobs, all under the studio URL:
 *   POST /track          record a site visit (no password — the public site calls it)
 *   GET  /stats          read the visit numbers for the studio dashboard (password)
 *   GET  /etsy/<id>      pull a listing's photos + details from Etsy by its id (password)
 *   GET|PUT /contents/.. proxy to GitHub with the real token (password), for catalog.json + the build
 *
 * Secrets (set once, see tools/studio/SETUP.md):
 *   GH_TOKEN      fine-grained GitHub token, true-offline repo, Contents: Read and write
 *   STUDIO_PASS   the shared password shown on the studio page
 *   ETSY_API_KEY  an Etsy Open API keystring (public listing reads)
 */

const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();
const inc = admin.firestore.FieldValue.increment(1);

const GH_TOKEN = defineSecret('GH_TOKEN');
const STUDIO_PASS = defineSecret('STUDIO_PASS');
const ETSY_API_KEY = defineSecret('ETSY_API_KEY');

const OWNER = 'reidwcoleman', REPO = 'true-offline';
const GH = `https://api.github.com/repos/${OWNER}/${REPO}`;

const ALLOW = [
  /^$/,
  /^\/contents\/catalog\.json(\?.*)?$/,
  /^\/actions\/workflows\/studio\.yml\/runs(\?.*)?$/,
  /^\/actions\/runs\/\d+\/jobs(\?.*)?$/,
];

const okOrigin = o =>
  /^https:\/\/reidwcoleman\.github\.io$/.test(o) ||
  /^http:\/\/localhost(:\d+)?$/.test(o) ||
  /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(o);

const docId = s => (String(s || '').replace(/[^\w.-]/g, '_').slice(0, 200)) || 'home';
const refHost = r => { try { const h = new URL(r).hostname.replace(/^www\./, ''); return /reidwcoleman\.github\.io/.test(h) ? '' : h; } catch (e) { return ''; } };
const day = () => new Date().toISOString().slice(0, 10);

exports.studio = onRequest(
  { secrets: [GH_TOKEN, STUDIO_PASS, ETSY_API_KEY], region: 'us-central1', invoker: 'public', cors: false },
  async (req, res) => {
    const origin = req.get('Origin') || '';
    res.set('Access-Control-Allow-Origin', okOrigin(origin) ? origin : 'https://reidwcoleman.github.io');
    res.set('Vary', 'Origin');
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, X-Studio-Pass');
    res.set('Access-Control-Max-Age', '86400');
    if (req.method === 'OPTIONS') return res.status(204).send('');

    // path after the function base, e.g. /contents/catalog.json?ref=main
    const raw = req.originalUrl || req.url || '/';
    let [p0, qs] = raw.split('?');
    if (p0.startsWith('/studio')) p0 = p0.slice('/studio'.length) || '/';
    const route = p0 === '/' ? '' : p0;
    const path = route + (qs ? '?' + qs : '');

    // --- visit beacon: no password, fire and forget ---
    if (req.method === 'POST' && route === '/track') {
      try {
        const b = req.body || {};
        const batch = db.batch();
        batch.set(db.collection('stats').doc(day()), { day: day(), views: inc, ...(b.n ? { visits: inc } : {}) }, { merge: true });
        batch.set(db.collection('paths').doc(docId(b.p || '/')), { path: String(b.p || '/').slice(0, 160), views: inc }, { merge: true });
        const rh = refHost(b.r);
        if (rh) batch.set(db.collection('refs').doc(docId(rh)), { ref: rh.slice(0, 80), views: inc }, { merge: true });
        await batch.commit();
      } catch (e) { /* a dropped beacon never matters */ }
      return res.status(204).send('');
    }

    // everything below needs the password
    if (req.get('X-Studio-Pass') !== STUDIO_PASS.value())
      return res.status(401).json({ message: 'Wrong studio password.' });

    // --- the visit dashboard ---
    if (req.method === 'GET' && route === '/stats') {
      try {
        const snap = await db.collection('stats').get();
        const byDay = {}; snap.forEach(d => (byDay[d.id] = d.data()));
        const days = [...Array(30)].map((_, i) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - (29 - i)); return d.toISOString().slice(0, 10); });
        const series = days.map(d => ({ day: d, views: (byDay[d] || {}).views || 0, visits: (byDay[d] || {}).visits || 0 }));
        const sum = k => Object.values(byDay).reduce((a, d) => a + (d[k] || 0), 0);
        const top = async (c) => (await db.collection(c).orderBy('views', 'desc').limit(10).get()).docs.map(d => d.data());
        return res.status(200).json({
          series, allViews: sum('views'), allVisits: sum('visits'),
          today: (byDay[day()] || {}).views || 0,
          topPaths: await top('paths'), topRefs: await top('refs'),
        });
      } catch (e) { return res.status(500).json({ message: 'Could not read the visit numbers.' }); }
    }

    // --- pull a listing from Etsy by id ---
    const em = route.match(/^\/etsy\/(\d+)$/);
    if (req.method === 'GET' && em) {
      const key = ETSY_API_KEY.value();
      if (!key || key === 'SET_ME') return res.status(503).json({ message: 'The Etsy key is not set up yet.' });
      let data;
      try {
        const r = await fetch(`https://openapi.etsy.com/v3/application/listings/${em[1]}?includes=Images`, { headers: { 'x-api-key': key } });
        if (r.status === 404) return res.status(404).json({ message: 'No Etsy listing with that number.' });
        if (!r.ok) { const t = await r.text(); return res.status(r.status === 401 || r.status === 403 ? 502 : r.status).json({ message: 'Etsy would not hand over that listing.', detail: t.slice(0, 160) }); }
        data = await r.json();
      } catch (e) { return res.status(502).json({ message: 'Could not reach Etsy.' }); }
      const photos = (data.images || []).map(i => i.url_fullxfull || i.url_570xN).filter(Boolean);
      const price = data.price ? Number(data.price.amount) / Number(data.price.divisor) : 0;
      return res.status(200).json({
        url: `https://www.etsy.com/listing/${em[1]}`,
        name: data.title || '',
        price,
        photos,
        description: String(data.description || '').slice(0, 3000),
        sizes: [], colours: [],
      });
    }

    // --- GitHub proxy ---
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
    } catch (e) { return res.status(502).json({ message: 'Could not reach GitHub.' }); }
    const body = await r.text();
    return res.status(r.status).type('application/json').send(body);
  }
);
