#!/usr/bin/env bash
# Re-sync deployment files from source repos.
# Run from the dsm-demo-deploy/ directory.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"
DPM_SRC="$ROOT/Decision-Process-Model/server/src"
UI_SRC="$ROOT/DSM-Testing-UI"

echo "=== Syncing engine files ==="
for f in model.py event.py actor.py commitment.py temporal.py data_classes.py enums.py helpers.py event_data_checker.py exogenous.py cdl_stub.py; do
  cp "$DPM_SRC/$f" "$SCRIPT_DIR/engine/"
  echo "  engine/$f"
done

echo "=== Syncing scenarios ==="
cp "$DPM_SRC/scenarios/"*.json "$SCRIPT_DIR/scenarios/"
ls "$SCRIPT_DIR/scenarios/"

echo "=== Syncing data files ==="
cp "$DPM_SRC/parameter_regimes.csv" "$SCRIPT_DIR/data/"
cp "$DPM_SRC/calibrated_defaults.json" "$SCRIPT_DIR/data/"

echo "=== Syncing frontend source ==="
rsync -a --exclude='node_modules' --exclude='.git' --exclude='dist' --delete "$UI_SRC/" "$SCRIPT_DIR/frontend/"

echo "=== Done ==="
echo "To rebuild the UI locally: cd frontend && npm install && npm run build"
echo "To deploy: git add -A && git commit -m 'sync from source' && git push"
