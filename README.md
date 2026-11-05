# True Offline

Static storefront for True Offline (Raleigh, NC). No framework and no build step for the page itself: `site/` is the whole site.

```
cd site && python3 -m http.server 4780
```

## How it works

- **Buying** goes to each piece's real Etsy listing. There is no cart or payment code here.
- **Offline** is real: `site/sw.js` saves the page, fonts and all grid images on first visit. It needs https or localhost.
- **Turning a garment** is a dissolve between the front and back cutouts while the width dips (`setTurn` in `app.js`).

## Updating products

Everything in `site/data.js` is generated. Prices, sizes and photos come from Etsy, and the names, categories and one-line notes live in the table in `tools/build_data.py`.

```
swiftc -O tools/vision.swift -o tools/vision   # once, macOS
python3 tools/build_assets.py                  # raw/ photos -> site/img cutouts
python3 tools/parse_charts.py                  # size chart images -> raw/charts.json
python3 tools/build_data.py                    # -> site/data.js
python3 tools/build_sw.py                      # run after any change to site/, or returning visitors keep the old cache
```

`raw/` holds the downloaded Etsy photos and listing data and is not committed.

## Checks

With the local server running and `CHROME` pointing at a Chromium binary:

```
node tools/shot.mjs <dir>       # screenshots, plus a real offline reload
node tools/interact.mjs <dir>   # filters, drag, keyboard, deep links, viewports
```

## Before going live

- Set `og:image` in `index.html` to the absolute URL once there is a domain.
- Prices and shipping terms are a snapshot from 2026-11-05. Re-check them against Etsy when they change.
