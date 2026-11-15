# Studio password server (Firebase)

The studio's **Enter the studio** page shows a shared password that helpers just press Enter on. The
real GitHub token lives on a small Firebase function (`firebase/functions/index.js`), never on the
site, so GitHub never revokes it and nobody has to paste a token.

**This is already set up and live** — you don't need to do anything to use it. This file is only for
changing the password or the token later.

## What's running

- **Project:** `trueoffline-studio-rc26` (Firebase / Google Cloud, owner reidwcoleman@gmail.com).
- **Function URL:** `https://us-central1-trueoffline-studio-rc26.cloudfunctions.net/studio` — this is
  the `WORKER` value near the top of `site/studio/index.html`.
- **Password:** `offline` — the `PASS` value in the same file, and the `STUDIO_PASS` secret.
- **Token:** a fine-grained GitHub token for the true-offline repo (Contents: Read and write), kept as
  the `GH_TOKEN` secret in Google Secret Manager. Never in the repo, never on the page.
- Cost is effectively nothing: the proxy runs a few times a day, well inside the free tier.

The function is a locked-down proxy: it only passes through the password-checked calls the studio
makes (read/write `catalog.json`, read the studio build), and turns everything else away.

## Change the password

```
cd tools/studio/firebase
printf '%s' 'NEWPASSWORD' | firebase functions:secrets:set STUDIO_PASS --project trueoffline-studio-rc26 --data-file -
firebase deploy --only functions --project trueoffline-studio-rc26
```

Then change `PASS` near the top of `site/studio/index.html` to the same word and push `main`.

## Change the GitHub token (e.g. after making a fresh one)

```
cd tools/studio/firebase
printf '%s' 'github_pat_NEWTOKEN' | firebase functions:secrets:set GH_TOKEN --project trueoffline-studio-rc26 --data-file -
firebase deploy --only functions --project trueoffline-studio-rc26
```

Nothing in the site changes — the new token just takes over inside the server.

## Redeploy the function after editing its code

```
cd tools/studio/firebase
firebase deploy --only functions --project trueoffline-studio-rc26
```
