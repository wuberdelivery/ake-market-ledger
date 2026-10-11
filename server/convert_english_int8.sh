#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ ! -f server/.env ]]; then
  echo "Missing server/.env" >&2
  exit 1
fi
set -a
# shellcheck disable=SC1091
source server/.env
set +a

if [[ -z "${HF_TOKEN:-}" ]]; then
  echo "HF_TOKEN is not configured" >&2
  exit 1
fi

SNAPSHOT=$(server/.venv/bin/python - <<'PY'
import os
from huggingface_hub import snapshot_download
print(snapshot_download("NCAIR1/NigerianAccentedEnglish", token=os.environ["HF_TOKEN"]))
PY
)

rm -rf server/models/english-asr-int8
server/.venv/bin/ct2-transformers-converter \
  --model "$SNAPSHOT" \
  --output_dir server/models/english-asr-int8 \
  --quantization int8 \
  --copy_files tokenizer.json preprocessor_config.json \
  --force

echo "Official Nigerian English ASR converted to CPU INT8: server/models/english-asr-int8"
