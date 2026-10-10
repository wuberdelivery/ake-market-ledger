#!/usr/bin/env bash
set -euo pipefail

SOURCE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/nginx-ake-ledger.conf"
SNIPPET=/etc/nginx/snippets/ake-ledger.conf
VHOST=/etc/nginx/sites-available/wuber.com.ng
STAMP="$(date +%Y%m%d-%H%M%S)"

if [[ ! -f "$VHOST" ]]; then
  echo "Expected Nginx vhost not found: $VHOST" >&2
  exit 1
fi

sudo cp "$VHOST" "$VHOST.backup-$STAMP"
sudo cp "$SOURCE" "$SNIPPET"

if ! sudo grep -qF 'include /etc/nginx/snippets/ake-ledger.conf;' "$VHOST"; then
  sudo python3 - "$VHOST" <<'PY'
from pathlib import Path
import sys
path = Path(sys.argv[1])
text = path.read_text()
needle = "    client_max_body_size 50M;\n"
insert = needle + "\n    # AKE Market Ledger N-ATLaS ASR gateway\n    include /etc/nginx/snippets/ake-ledger.conf;\n"
if needle not in text:
    raise SystemExit("Could not find insertion point in Nginx vhost")
path.write_text(text.replace(needle, insert, 1))
PY
fi

sudo nginx -t
sudo systemctl reload nginx
echo "Nginx route enabled: https://wuber.com.ng/ake-ledger/health"
