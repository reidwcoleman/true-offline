#!/bin/zsh
# Bundles tools/hero/main.js and three.js into site/hero.js
cd "${0:A:h}"
./node_modules/.bin/esbuild main.js --bundle --minify --format=iife --target=es2020 --outfile=../../site/hero.js --log-level=warning
ls -la ../../site/hero.js
