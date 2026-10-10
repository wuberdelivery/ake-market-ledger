#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

rm -rf server/.venv
if ! python3 -m venv server/.venv 2>/dev/null; then
  echo "python3-venv is unavailable; installing user-local virtualenv fallback."
  rm -rf server/.venv
  python3 -m pip install --user --break-system-packages virtualenv
  python3 -m virtualenv server/.venv
fi
server/.venv/bin/python -m pip install --upgrade pip wheel setuptools
server/.venv/bin/pip install --index-url https://download.pytorch.org/whl/cpu torch
server/.venv/bin/pip install -r server/requirements.txt

echo "VPS Python environment is ready."
echo "Next: configure server/.env, then run 'pm2 start server/ecosystem.config.cjs'."
