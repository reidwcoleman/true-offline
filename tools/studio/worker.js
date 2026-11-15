// The gatekeeper for the hosted studio. Runs on Cloudflare Workers (free). Deploy once; see the README.
//
// It holds the GitHub token as a Worker secret, so the studio page never has to. Anyone can then use
// the studio from any computer with nothing to paste. The token never leaves the server, and this
// gatekeeper can do five things and nothing else: read and write catalog.json, and read the Studio
// workflow's progress, on this one repo. So the worst anyone reaching it can do is edit the public
// shop catalog, which is kept in git and can be rolled back. Nothing else in the repo, and nothing in
// the GitHub account, is reachable through it.
//
// Secrets and variables (set at deploy time):
//   GH_TOKEN          (secret, required)  a fine-grained token for the true-offline repo, Contents: read and write
//   STUDIO_PASSWORD   (secret, optional)  if set, the studio must send it; leave unset for no password
//   ALLOW_ORIGINS     (var, optional)     comma-separated sites allowed to call it; defaults to the Pages site
//   GITHUB_API        (var, optional)     only for testing; defaults to https://api.github.com

const OWNER = 'reidwcoleman';
const REPO = 'true-offline';
const BRANCHES = new Set(['main', 'studio-test']);   // studio-test is for trying changes without publishing
const MAX_BODY = 4_000_000;

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    let res;
    try {
      res = await route(request, env);
    } catch (e) {
      res = json({ message: 'The studio server hit an error.' }, 500);
    }
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOW_ORIGINS || 'https://reidwcoleman.github.io').split(',').map(s => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  // Echo back whichever headers the page asks to send; the origin allowlist is what actually guards it.
  const want = request.headers.get('Access-Control-Request-Headers');
  return {
    'Access-Control-Allow-Origin': ok ? origin : (allowed[0] || '*'),
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS',
    'Access-Control-Allow-Headers': want || 'Content-Type, X-Studio-Pass',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin, Access-Control-Request-Headers',
  };
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

async function route(request, env) {
  if (!env.GH_TOKEN) return json({ message: 'The studio server has no GitHub key set.' }, 500);

  // The password, when the owner has set one. Its own 401 is marked so the page knows to ask for it,
  // and not confuse it with a GitHub problem.
  if (env.STUDIO_PASSWORD) {
    if (!safeEqual(request.headers.get('X-Studio-Pass') || '', env.STUDIO_PASSWORD)) {
      return json({ error: 'password', message: 'This studio needs its password.' }, 401);
    }
  }

  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const base = `/repos/${OWNER}/${REPO}`;
  const gh = (p, opts) => callGitHub(p, opts, env);

  // a cheap check the page uses to see it is connected
  if (request.method === 'GET' && path === base) return relay(await gh(base));

  if (request.method === 'GET' && path === `${base}/contents/catalog.json`) {
    return relay(await gh(`${base}/contents/catalog.json?ref=${branchOf(url)}`));
  }

  if (request.method === 'PUT' && path === `${base}/contents/catalog.json`) {
    const text = await request.text();
    if (text.length > MAX_BODY) return json({ message: 'That is too large to save.' }, 413);
    let body;
    try { body = JSON.parse(text); } catch (e) { return json({ message: 'The save was not understood.' }, 400); }
    if (!BRANCHES.has(body.branch)) return json({ message: 'That branch is not allowed.' }, 400);
    if (typeof body.content !== 'string' || typeof body.sha !== 'string' || typeof body.message !== 'string') {
      return json({ message: 'The save was missing something.' }, 400);
    }
    // Only ever these four fields reach GitHub, and only for catalog.json on an allowed branch.
    const clean = { message: String(body.message).slice(0, 200), branch: body.branch, sha: body.sha, content: body.content };
    return relay(await gh(`${base}/contents/catalog.json`, { method: 'PUT', body: JSON.stringify(clean) }));
  }

  if (request.method === 'GET' && path === `${base}/actions/workflows/studio.yml/runs`) {
    const per = Math.min(Math.max(parseInt(url.searchParams.get('per_page') || '5', 10) || 5, 1), 20);
    return relay(await gh(`${base}/actions/workflows/studio.yml/runs?branch=${branchOf(url)}&per_page=${per}`));
  }

  const m = path.match(new RegExp(`^${base}/actions/runs/(\\d{1,20})/jobs$`));
  if (request.method === 'GET' && m) return relay(await gh(`${base}/actions/runs/${m[1]}/jobs`));

  return json({ message: 'Not found.' }, 404);
}

function branchOf(url) {
  const ref = url.searchParams.get('ref') || url.searchParams.get('branch') || 'main';
  return BRANCHES.has(ref) ? ref : 'main';
}

function callGitHub(path, opts = {}, env) {
  const api = env.GITHUB_API || 'https://api.github.com';
  return fetch(api + path, {
    ...opts,
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      Authorization: 'Bearer ' + env.GH_TOKEN,
      'User-Agent': 'true-offline-studio',
      ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
}

// GitHub's status and JSON body only. Its own headers (which can carry account and rate-limit hints)
// are dropped, so nothing about the account leaks through.
async function relay(r) {
  return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json' } });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
