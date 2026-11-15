/* True Offline studio worker.
 *
 * A tiny Cloudflare Worker that holds the GitHub token so nobody has to paste one. The studio page
 * sends the shared password in an X-Studio-Pass header; if it matches, this worker forwards the
 * request to GitHub with the real token and returns the answer. The token never leaves here.
 *
 * Two secrets, set once after deploying (see tools/studio/SETUP.md):
 *   GH_TOKEN     a fine-grained GitHub token for the true-offline repo, Contents: Read and write
 *   STUDIO_PASS  the shared password shown on the studio page
 *
 * The token can do nothing but the handful of calls the studio makes: it only ever touches
 * catalog.json and reads the studio workflow's runs. Everything else is turned away.
 */

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

const cors = origin => ({
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Studio-Pass',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
});

const say = (status, message, head) =>
  new Response(JSON.stringify({ message }), { status, headers: { ...head, 'Content-Type': 'application/json' } });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const head = cors(okOrigin(origin) ? origin : 'https://reidwcoleman.github.io');

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: head });

    if (!env.STUDIO_PASS || request.headers.get('X-Studio-Pass') !== env.STUDIO_PASS)
      return say(401, 'Wrong studio password.', head);

    const path = (url.pathname === '/' ? '' : url.pathname) + url.search;
    if (!ALLOW.some(re => re.test(path))) return say(403, 'That request is not allowed.', head);
    if (request.method !== 'GET' && request.method !== 'PUT') return say(405, 'Method not allowed.', head);
    if (!env.GH_TOKEN) return say(500, 'The studio server has no GitHub token set.', head);

    let r;
    try {
      r = await fetch(GH + path, {
        method: request.method,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          Authorization: 'Bearer ' + env.GH_TOKEN,
          'User-Agent': 'true-offline-studio',
          ...(request.method === 'PUT' ? { 'Content-Type': 'application/json' } : {}),
        },
        body: request.method === 'PUT' ? await request.text() : undefined,
      });
    } catch (e) {
      return say(502, 'Could not reach GitHub.', head);
    }
    const body = await r.text();
    return new Response(body, { status: r.status, headers: { ...head, 'Content-Type': 'application/json' } });
  },
};
