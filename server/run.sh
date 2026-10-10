#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f server/.env ]]; then
  echo "Missing server/.env. Copy server/.env.example and configure HF_TOKEN." >&2
  exit 1
fi
if [[ ! -x server/.venv/bin/python ]]; then
  echo "Missing server virtual environment. Run server/setup_vps.sh first." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
source server/.env
set +a

export HF_HOME="${HF_HOME:-$HOME/.cache/huggingface}"
export TORCH_HOME="${TORCH_HOME:-$HOME/.cache/torch}"
export OMP_NUM_THREADS="${OMP_NUM_THREADS:-6}"
mkdir -p "$HF_HOME" "$TORCH_HOME"

exec server/.venv/bin/python -m uvicorn server.app:app \
  --host 127.0.0.1 \
  --port 8787 \
  --workers 1 \
  --proxy-headers \
  --forwarded-allow-ips 127.0.0.1
