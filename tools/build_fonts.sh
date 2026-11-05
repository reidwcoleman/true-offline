#!/bin/zsh
# Subsets the two variable fonts to the characters the site uses. Needs fontTools with brotli.
# usage: tools/build_fonts.sh <python>   (run from the repo root; originals kept in tools/hero/fonts)
PY=${1:-python3}
for f in archivo archivo-italic; do
  $PY -m fontTools.subset "tools/hero/fonts/$f.woff2" --flavor=woff2 --layout-features='kern,liga,tnum' \
    --unicodes='U+0020-007E,U+00A0,U+00B7,U+00D7,U+2013,U+2014,U+2018,U+2019,U+201C,U+201D,U+2026,U+2190-2193' \
    --output-file="site/fonts/$f.woff2"
done
ls -la site/fonts
