#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 -m venv .venv
.venv/bin/python -m pip install --disable-pip-version-check --cache-dir /tmp/ieum-pip-cache -r backend/requirements.txt
npm ci --cache /tmp/ieum-npm-cache --no-audit --no-fund
npm run build
