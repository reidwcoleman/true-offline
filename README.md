# True Offline

Static storefront for True Offline (Raleigh, NC). No framework and no build step for the page itself: `site/` is the whole site.

```
cd site && python3 -m http.server 4780
```

## How it works

- **Buying** goes to each piece's real Etsy listing. There is no cart or payment code here.
- **The first two sections are one 3D stage** (`tools/hero/main.js`, bundled to `site/hero.js`). A canvas sticks behind `#hero` and `#turn`. The Blossom Baggy Zip Hoodie turns to show both sides, inside a chrome ring of the wordmark taken from the globe and ring in the brand's logo, with blossom branches and falling petals. Scrolling flies into the back print, then four hoodies turn in 3D with their word in chrome. The words stay facing the viewer so they can always be read, and the ring size is solved from the screen so the whole phrase fits. Without WebGL, or if the bundle fails, a flat hero and the 2D turn in `app.js` take over.
- **Scrolling** glides with Lenis (`site/lenis.js`, a copy of `lenis.min.js` from the `lenis` package in `tools/hero`), on mouse and trackpad only. The 3D stage eases the scroll value again, so a jump never snaps the scene. Everything in the frame loop uses `damp()` or `silk()` so it feels the same at 60 and 120 Hz.
- **Sharp prints:** the Etsy photos top out at 1400 px, so `tools/crisp.py` cleans and enlarges the ink only, then a shock filter hardens its edges, and the cloth shader reads textures finer than the mip level asks for. Desktop gets the large colour maps, phones the `-m` ones.
- **The hoodies are real meshes** built from two flat photos by `tools/build_hero.py`. The back photo is bent onto the front outline, volume comes from the medial axis (sleeves are tubes, the body an elliptical barrel), hem and cuffs stay open, and the hood opening is carved in from an outline traced by hand per garment (`hood` in that file). Rings of vertices follow the outline and normals come from the height field, so the side of the garment stays smooth. `tools/hero/garment.js` documents the `.bin` layout. To check one from every angle: `tools/hero/viewer.sh`, then `node tools/meshshot.mjs <out.png> <name> [clay]`.
- **The hero answers you.** The picker swaps between five hoodies with one fast turn, letters lean toward the pointer, a tap flips a letter or throws petals, petals swerve round the pointer and fast movement shakes the branches. `window.TO_hero` is how the page talks to it.
- **The line** has a sticky bar with filters and sorting. Moving across a tile turns the garment and tilts the card, and the price slides over to the size range (`tileMotion`). On touch screens pieces turn over as you scroll past.
- **Build a fit** is two swipeable reels, tops over bottoms, with a running total and a shuffle (`fit`). Each piece still checks out on its own Etsy listing.
- **`wave`** makes `[data-wave]` type react to the pointer, and `[data-magnet]` buttons lean toward it.
- **Turning a garment** in the shop and product sheet is a dissolve between the front and back cutouts while the width dips (`setTurn` in `app.js`).
- **Grid to sheet** uses the View Transitions API, so the garment travels between them. Browsers without it simply open the sheet.
- **The shop layout** is four bands of five, set by `ORDER` in `app.js`. Feature tiles are the `[slug, 1]` entries and lead with the back print. Filtering or sorting drops to a plain even grid.
- **The intro** is CSS only and plays once per visit, so a script failure can never leave it covering the page.
- **`site/sw.js`** only exists to remove the service worker that earlier builds installed. It can go once nobody has that build.

## Updating products

Everything in `site/data.js` is generated. Prices, sizes and photos come from Etsy, and the names, categories and one-line notes live in the table in `tools/build_data.py`.

```
swiftc -O tools/vision.swift -o tools/vision   # once, macOS
python3 tools/build_assets.py                  # raw/ photos -> site/img cutouts
python3 tools/build_grain.py                   # film grain tile
python3 tools/parse_charts.py                  # size chart images -> raw/charts.json
python3 tools/build_data.py                    # -> site/data.js
~/Shift/.venv/bin/python tools/hero/glyphs.py  # chrome letter outlines (needs fontTools and the Archivo source font)
python3 tools/build_hero.py                    # 3D hoodie meshes and maps
(cd tools/hero && npm install) && zsh tools/hero/build.sh   # bundle the hero
```

`raw/` holds the downloaded Etsy photos and listing data and is not committed.

## Checks

With the local server running and `CHROME` pointing at a Chromium binary:

```
node tools/shot.mjs <dir>       # screenshots of every section
node tools/heroshot.mjs <dir>   # a tour of the 3D stage, the line and Build a fit on the real GPU, with a frame rate
node tools/interact.mjs <dir>   # meshes, picker, filters, sorting, Build a fit, drag, keyboard, deep links, viewports
```

## Publishing

Pushing `main` deploys `site/` to GitHub Pages through `.github/workflows/pages.yml`.

## Keep in mind

- `og:image` and `og:url` point at the GitHub Pages address. Change them if the site moves to its own domain.
- Prices and shipping terms are a snapshot from 2026-11-05. Re-check them against Etsy when they change.
