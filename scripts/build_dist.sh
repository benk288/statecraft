#!/bin/sh
# Assembles the publishable static site in dist/ (drag this folder onto Netlify).
set -e
cd "$(dirname "$0")/.."
rm -rf dist && mkdir -p dist/data
cp index.html app.js dist/
cp -R vendor dist/
cp data/bills.js data/analysis.js data/sponsors.js data/texts.js dist/data/; [ -f data/headlines.js ] && cp data/headlines.js dist/data/; [ -f data/sessions.js ] && cp data/sessions.js dist/data/
du -sh dist
