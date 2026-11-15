# True Offline

Static storefront for True Offline (Raleigh, NC). No framework and no build step for the page itself: `site/` is the whole site.

```
cd site && python3 -m http.server 4780
```

## How it works

- **Buying** goes to each piece's real Etsy listing. There is no cart or payment code here.
- **The first two sections are one 3D stage** (`tools/hero/main.js`, bundled to `site/hero.js`). A canvas sticks behind `#hero` and `#turn`. The Blossom Baggy Zip Hoodie turns to show both sides, inside a chrome ring of the wordmark taken from the globe and ring in the brand's logo, with blossom branches and falling petals. Scrolling flies into the back print, then four hoodies turn in 3D with their word in chrome. The words stay facing the viewer so they can always be read, and the ring size is solved from the screen so the whole phrase fits. Without WebGL, or if the bundle fails, a flat hero and the 2D turn in `app.js` take over.
- **Touch screens get their own path** (`LITE` in `tools/hero/main.js`, `@media (pointer:coarse)` in the CSS). A still of the scene (`img/poster-*.webp`, from `tools/poster.mjs`) paints first and the live scene fades in over it. The 3D draws straight to the screen with no post-processing, uses lighter meshes and maps (the `-m` files), and only fetches the other hoodies once you start scrolling or tap the picker. Resolution steps down by itself if frames run long. Data saver, 2G and very low memory skip the 3D entirely. Re-run `tools/poster.mjs` (then convert to webp) if the opening shot changes.
- **Fonts** are subset by `tools/build_fonts.sh`; the full files live in `tools/hero/fonts`.
- **The scroll from the first screen** is one continuous move in `frame()`. The hoodie winds onto its back print as the name slips away, then the camera pulls back and up while the other four fly in to form one carousel. Scrolling on spins the carousel to each piece, pushing in and easing back out between them. The camera only ever pulls back from the opening shot, plus a slight ease in, because the photos are 1400 px and go soft up close. Keep it that way.
- **Timelines use the stage height, never `innerHeight`.**
- **On touch screens the body is the scroller** (`html.inner`), not the window. The address bar then never slides or snaps and there is no rubber band, so nothing can shift when a scroll stops. Use `Y()` and `scroller` in `app.js`, never `scrollY`.
- **3D colour:** in the `cloth()` shader, strongly dyed fabric takes its hue from the photo, because the studio lights pushed a wine red to magenta. Greys and charcoals keep a soft tint from the lights, so they read slightly more colourful than the real garment. After changing the look, rerun `tools/poster.mjs`.
- **Showcase falls and type:** `FALLS` in `main.js` holds the four things that can drop: petals, stars, feathers, flames. Which one each piece gets, and its word and colours, come from the catalog (`TO_SHOW`). The first screen always has petals. Each particle has one slot in all four meshes and shrinks away, then returns as the new kind. Keep the beams behind the pieces soft: hard wedges read as the Rising Sun flag on the Japan pieces.
- **Shop tile glow:** `tools/build_glow.py` samples each photo into `window.TO_GLOW` at the end of `site/data.js`. Rerun it after `tools/build_data.py`.
- **Touch rules:** a finger always scrolls the page. The hoodie spins and a shop tile flips only on a clearly sideways swipe, and nothing in the shop animates against the scroll. `overflow-anchor:none` stops the browser nudging the page.
- **Build a fit** draws every piece at one inches-to-pixels scale from its own size chart (`seat` and `inches` in `fit`).
- **Scrolling is always native.** A scroll library was tried and removed: it made the page drift after you stopped. The 3D eases its own copy of the scroll position instead, using `damp()` and `silk()` so it feels the same at 60 and 120 Hz.
- **Sharp prints:** the Etsy photos top out at 1400 px, so `tools/crisp.py` cleans and enlarges the ink only, then a shock filter hardens its edges, and the cloth shader reads textures finer than the mip level asks for. Desktop gets the large colour maps, phones the `-m` ones.
- **The hoodies are real meshes** built from two flat photos by `tools/build_hero.py`. The back photo is bent onto the front outline, volume comes from the medial axis (sleeves are tubes, the body an elliptical barrel), hem and cuffs stay open, and the hood opening is carved in from an outline traced by hand per garment (`hood` in that file). Rings of vertices follow the outline and normals come from the height field, so the side of the garment stays smooth. `tools/hero/garment.js` documents the `.bin` layout. To check one from every angle: `tools/hero/viewer.sh`, then `node tools/meshshot.mjs <out.png> <name> [clay]`.
- **The hero answers you.** The picker swaps between five hoodies with one fast turn, letters lean toward the pointer, a tap flips a letter or throws petals, petals swerve round the pointer and fast movement shakes the branches. `window.TO_hero` is how the page talks to it.
- **The line** has a sticky bar with filters and sorting. Moving across a tile turns the garment and tilts the card, and the price slides over to the size range (`tileMotion`). On touch screens pieces turn over as you scroll past.
- **Build a fit** is two swipeable reels, tops over bottoms, with a running total and a shuffle (`fit`). Each piece still checks out on its own Etsy listing.
- **`wave`** makes `[data-wave]` type react to the pointer, and `[data-magnet]` buttons lean toward it.
- **Turning a garment** in the shop and product sheet is a dissolve between the front and back cutouts while the width dips (`setTurn` in `app.js`).
- **Grid to sheet** uses the View Transitions API, so the garment travels between them. Browsers without it simply open the sheet.
- **The shop layout** is bands of five, from `TO_LINE` in `data.js`. Feature tiles are the `[slug, 1]` entries and lead with the back print. Filtering or sorting drops to a plain even grid.
- **The intro** is CSS only and plays once per visit, so a script failure can never leave it covering the page.
- **`site/sw.js`** only exists to remove the service worker that earlier builds installed. It can go once nobody has that build.

## The studio

https://reidwcoleman.github.io/true-offline/studio/

A page for running the shop from any computer, with no code. It lives in this repo (`site/studio/index.html`) and saves to this repo; GitHub does the work.

- **Connect.** The **Enter the studio** page shows a shared password already filled in; a helper presses Enter and is in, on any computer. The real GitHub token is held by a small Firebase function (`tools/studio/firebase/functions/index.js`, project `trueoffline-studio-rc26`), never on the site, so GitHub never revokes it. `WORKER` and `PASS` near the top of `site/studio/index.html` point at it; see `tools/studio/SETUP.md` to change the password or token. (A test can force the old paste-a-key flow with `window.TO_STUDIO_API`.)
- **Add a piece.** Drag the Add to True Offline button to the bookmarks bar once. On an Etsy listing, press it: the studio opens with the piece ready, and Add to the site sends it off. About three minutes later it is on the site, made the same way as the rest: photos sorted into front, back, colours and size chart, cut out, measurements read. Its one-line note is drafted from the Etsy text and is the one thing worth rewriting by hand.
- **On show.** Choose which pieces are in the scrolling 3D section and in what order (two to eight). The first one opens the site. Each has a word, a glow colour, a word colour and what falls around it. A piece that has never been on show gets its 3D model built when you publish.
- **The line.** Drag to reorder. Click a piece to edit its name, note, type, price, fabric and so on, to make it a big tile, to hide it from the site, to change which photos are used, or to remove it.
- **Publish** lists what changed and saves it. Nothing is live until then; the site follows about three minutes later, and the page shows the progress.

How it works:

- **`catalog.json` is the one source of truth**: every product, the order of the line, what is on show, each 3D model's settings, and a `queue` of listings waiting to be made. The page only ever edits that one file, through the GitHub API. `tools/build_data.py` turns it into `site/data.js` (`TO_PRODUCTS`, `TO_LINE`, `TO_SHOW`, `TO_FIT`, `TO_GLOW`) and keeps the piece count and cache version in `site/index.html` right. Nothing about which pieces exist is written into `app.js` or `tools/hero/main.js`.
- **The worker.** A push that changes `catalog.json` starts `.github/workflows/studio.yml`, which runs `tools/studio/run.py` on one of GitHub's Mac runners (Apple Vision does the cutouts and reads the size charts, so it has to be a Mac). It makes queued pieces, remakes cutouts when the chosen photos change, builds 3D models for pieces newly on show, sweeps away files of removed pieces, rebuilds `data.js`, retakes the still that phones open on if the opening piece changed, commits, and deploys the site. Trouble with one piece is written to `problems` in the catalog, where the page shows it, and the rest carries on. `run.py` trusts nothing in the catalog: every field is checked and put in shape first.
- **Why a bookmark button and not just a pasted link.** Etsy turns away anything that is not a real person's browser. Plain requests get a 403, and a real Chrome on GitHub's runners (Linux and Mac both tried, 2026-11-15) is stopped at Etsy's bot check. So the listing is read where it can be: in the browser of whoever is adding it. The button reads the listing's own data from the page (name, price, photos, description, sizes, colours) and hands it to the studio in the address. Photos are then fetched from Etsy's image host, which is open. Only photos on `i.etsystatic.com` are accepted. An Etsy API key would make a bare pasted link work; that is not set up.
- **Saving is merge-safe.** On publish the page fetches the newest catalog, lays its own changes over it field by field, and saves. So it does not matter if the worker, or another computer, saved in between.
- **Hidden pieces** stay in the catalog and keep their images, but are left out of `data.js`.
- **Cutouts** use Apple Vision. A pale garment on a white ground (the white tee) gives Vision nothing to find, so `plain_ground()` in `tools/build_assets.py` takes over: everything the background colour cannot reach from the border.
- **3D models for any piece.** `tools/build_hero.py` builds hoodies, tops and bottoms. For a hoodie nobody has traced, the neck line and hood opening come from the outline (`auto_hood`): the row where the outline widens from hood to shoulders is the landmark, and on the five hand-traced pieces it lands within a few percent of where they were set by hand. Tops have no hood to carve. Trousers and shorts are open at the waist and at each leg (`extend_bottoms`). The first five keep their hand-traced settings in `catalog.json`.
- **The grid** is laid out by `layout()` in `build_data.py`: bands of five, one big tile and four smalls, the big one alternating sides. A piece only gets its big tile while there are four smalls to go with it.
- **Trying changes safely.** The workflow also runs for a branch called `studio-test` (without deploying), and the page takes `?branch=studio-test`. The page can be pointed at a stand-in for GitHub by setting `window.TO_STUDIO_API` before it loads.
- **The key and other sites.** Browser storage is shared by everything under `reidwcoleman.github.io`, so keep the key fine-grained and limited to this one repo.
- Locally, `tools/vision mask` hangs inside some command sandboxes. Run the build scripts from a normal terminal.

## Rebuilding by hand

The studio's worker does all of this on GitHub. The steps, for when something needs redoing on a Mac:

```
pip install -r tools/requirements.txt
swiftc -O tools/vision.swift -o tools/vision   # once, macOS
python3 tools/studio/run.py                    # everything the worker does: queue, cutouts, models, data.js
python3 tools/build_data.py                    # catalog.json -> site/data.js (add --bump for a new cache version)
python3 tools/build_hero.py [slug ...]         # 3D models and maps; no names rebuilds every piece that has one
python3 tools/build_grain.py                   # film grain tile
~/Shift/.venv/bin/python tools/hero/glyphs.py  # chrome letter outlines (needs fontTools and the Archivo source font)
(cd tools/hero && npm install) && zsh tools/hero/build.sh   # bundle the hero
```

`raw/` holds the downloaded Etsy photos and is not committed. Each product keeps its photo links in `catalog.json`, so they can be fetched again.

## Checks

With the local server running and `CHROME` pointing at a Chromium binary:

```
node tools/shot.mjs <dir>       # screenshots of every section
node tools/heroshot.mjs <dir>   # a tour of the 3D stage, the line and Build a fit on the real GPU, with a frame rate
node tools/interact.mjs <dir>   # meshes, picker, filters, sorting, Build a fit, drag, keyboard, deep links, viewports (reads counts from the data)
```

## Publishing

Pushing `main` deploys `site/` to GitHub Pages through `.github/workflows/pages.yml`. A push that only changes `catalog.json` is left to `.github/workflows/studio.yml`, which deploys when the worker is done.

## Keep in mind

- `og:image` and `og:url` point at the GitHub Pages address. Change them if the site moves to its own domain.
- Prices and shipping terms are a snapshot from 2026-11-05. Re-check them against Etsy when they change.
