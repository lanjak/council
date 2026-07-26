#!/usr/bin/env bash
# Proves the published package is importable by a real consumer. Unit tests
# pass against a broken exports map or a missing .d.ts; only this catches that.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

cd "$ROOT"
npm run build
TARBALL="$(npm pack --silent --pack-destination "$WORK")"

cd "$WORK"
cat > package.json <<'JSON'
{ "name": "smoke", "version": "1.0.0", "type": "module", "private": true }
JSON
npm install --silent --no-audit --no-fund "$WORK/$TARBALL"

cat > smoke.mjs <<'JS'
import { runReview, parseHardBlocks, KEY_LABEL, exitCodeFor } from 'council-axi';

if (typeof runReview !== 'function') throw new Error('runReview is not exported');
if (typeof exitCodeFor !== 'function') throw new Error('exitCodeFor is not exported');

const key = 'abc12345';
const parsed = parseHardBlocks(`x\n${KEY_LABEL}: ${key}\nBLOCKERS: none`, key);
if (parsed.status !== 'parsed') throw new Error(`expected parsed, got ${parsed.status}`);

console.log('package smoke test passed');
JS
node smoke.mjs

cd "$ROOT"
npx publint --strict "$WORK/$TARBALL"
npx attw --profile esm-only --pack "$WORK/$TARBALL"
