#!/bin/zsh
cd "${0:A:h}"
./node_modules/.bin/esbuild viewer.js --bundle --format=iife --target=es2020 --outfile=../../site/_viewer.js --log-level=warning
echo '<!doctype html><meta charset=utf-8><body><script src=_viewer.js></script>' > ../../site/_viewer.html
