# Studio password server — one-time setup

This puts a password on the studio's **Enter the studio** page that helpers just press Enter on.
The real GitHub token lives on a tiny free Cloudflare Worker, not on the site, so GitHub never
revokes it and nobody has to paste a token.

You do this once. It takes about five minutes and needs no command line.

## 1. Make a fresh GitHub token

The one that was shared in chat must be treated as burned — make a new one.

1. Go to <https://github.com/settings/personal-access-tokens/new>
2. Name it `True Offline Studio`. Set **Expiration** to a year (or longer).
3. **Repository access** → **Only select repositories** → **true-offline**.
4. **Permissions** → **Repository permissions** → **Contents** → **Read and write**.
5. **Generate token** and copy it. You will paste it into Cloudflare in step 3, and nowhere else.

## 2. Create the worker (no command line)

1. Sign in (free) at <https://dash.cloudflare.com>. In the sidebar: **Workers & Pages** → **Create** → **Create Worker**.
2. Name it `true-offline-studio`, click **Deploy**, then **Edit code**.
3. Delete whatever is in the editor and paste the whole of [`worker.js`](./worker.js). Click **Deploy**.
4. Copy the worker's address — it looks like `https://true-offline-studio.YOURNAME.workers.dev`.

## 3. Add the two secrets

In the worker's page: **Settings** → **Variables and Secrets** → **Add**. Add two, each as a
**Secret** (not plain text):

| Name          | Value                                         |
| ------------- | --------------------------------------------- |
| `GH_TOKEN`    | the GitHub token from step 1                  |
| `STUDIO_PASS` | the password helpers will use, e.g. `offline` |

Click **Deploy** to save.

## 4. Turn it on in the site

Send me (or edit yourself, near the top of `site/studio/index.html`):

- the worker address from step 2, and
- the password you chose in step 3.

In the script there are two lines:

```js
const WORKER = (window.TO_STUDIO_WORKER || 'https://REPLACE-ME.workers.dev').replace(/\/+$/, '');
const PASS   = 'offline';
```

Set `WORKER` to your `https://…workers.dev` address and `PASS` to your password. Push to `main`.
From then on the studio opens with the password already filled in — anyone presses Enter and is in,
on any computer, and the token stays hidden on the worker.

## If you ever want to change the password

Change `STUDIO_PASS` in the worker (step 3) **and** `PASS` in the page (step 4) to the same new word.

## Doing step 2–3 from the command line instead

```
cd tools/studio
npx wrangler deploy
npx wrangler secret put GH_TOKEN      # paste the token when asked
npx wrangler secret put STUDIO_PASS   # type the password when asked
```
