#!/usr/bin/env bash
# Deploy the internal (tailnet) QuettaBoard dashboard — one command, safe by construction.
#
# Flow:
#   1. typecheck (tsc -b)
#   2. build the INTERNAL variant into a temp dir (never the live dir)
#   3. carry forward data artifacts (gpu-state.json, coverage-blockers.*.json, ...) that a
#      separate data-refresh drops into the served dir, so a frontend rebuild never wipes them
#   4. atomically swap the temp build into the served dir, keeping the prior build as dist.bak
#
# Because nothing touches the live dir until the build is verified complete, an OOM/failed
# build leaves the running dashboard untouched. serve-control.mjs serves dist/ statically and
# reads it per request, so the swap goes live immediately — no restart.
#
# Usage:
#   npm run deploy                          # from the QuettaBoard dir
#   DASHBOARD_BASE_PATH=/foo npm run deploy # override the served base path (default /quettaboard)
#
# Rollback (printed on success too):
#   rm -rf dist && mv dist.bak dist
set -euo pipefail

cd "$(dirname "$0")/.."   # QuettaBoard repo root

BASE_PATH="${DASHBOARD_BASE_PATH:-/quettaboard}"
LIVE="${DASHBOARD_DIST:-dist}"
TMP="${LIVE}_new"
BAK="${LIVE}.bak"
PORT="${PORT:-4180}"

echo "==> typecheck (tsc -b)"
npx tsc -b

echo "==> building internal dashboard (base=${BASE_PATH}/)"
rm -rf "$TMP"
VITE_INTERNAL=1 \
VITE_DASHBOARD_API_BASE="${BASE_PATH}" \
VITE_GPU_STATE_JSON_URL="${BASE_PATH}/gpu-state.json" \
VITE_COVERAGE_BLOCKERS_JSON_URL="${BASE_PATH}/coverage-blockers.synthetic_distributional.json" \
VITE_COVERAGE_BLOCKERS_MOE_EP_JSON_URL="${BASE_PATH}/coverage-blockers.moe_ep.json" \
  npx vite build --base="${BASE_PATH}/" --outDir="$TMP" --emptyOutDir

# Verify the build actually produced a page + assets before touching the live dir.
if [[ ! -f "$TMP/index.html" || -z "$(ls -A "$TMP/assets" 2>/dev/null || true)" ]]; then
  echo "!! build output incomplete (${TMP}); live dashboard left untouched" >&2
  rm -rf "$TMP"
  exit 1
fi

# Link the runtime data artifacts the dashboard fetches locally under the base path
# (gpu-state.json + coverage-blockers.*.json). They are produced out-of-band by the bench
# pipeline in LOCAL_ARTIFACTS_DIR and updated live, so we SYMLINK rather than copy — the served
# dir always resolves to the current file (same as the postbuild:internal hook). Everything else
# (data.json, sweep-state.json, predictions) is fetched from R2, not from here.
ARTIFACTS_DIR="${LOCAL_ARTIFACTS_DIR:-/mnt/100g/agent-bench/artifacts}"
LOCAL_JSON=(gpu-state.json coverage-blockers.synthetic_distributional.json coverage-blockers.moe_ep.json)
linked=0
if [[ -d "$ARTIFACTS_DIR" ]]; then
  for f in "${LOCAL_JSON[@]}"; do
    if [[ -e "$ARTIFACTS_DIR/$f" ]]; then
      ln -sfn "$ARTIFACTS_DIR/$f" "$TMP/$f"
      linked=$((linked + 1))
    else
      echo "note: ${ARTIFACTS_DIR}/${f} missing — /${f#/} will 404 until the data refresh writes it"
    fi
  done
  echo "==> linked ${linked}/${#LOCAL_JSON[@]} data artifacts from ${ARTIFACTS_DIR}"
else
  echo "note: LOCAL_ARTIFACTS_DIR (${ARTIFACTS_DIR}) not found — carrying forward any data JSON from the live build"
fi
# Fallback: if we linked nothing, preserve whatever data files the previous build already served.
if [[ "$linked" -eq 0 && -d "$LIVE" ]]; then
  shopt -s nullglob
  for f in "$LIVE"/*.json; do cp -a "$f" "$TMP/"; done
  shopt -u nullglob
fi

echo "==> swapping into ${LIVE} (previous build -> ${BAK})"
rm -rf "$BAK"
[[ -d "$LIVE" ]] && mv "$LIVE" "$BAK"
mv "$TMP" "$LIVE"

echo "==> deployed: $(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$LIVE/index.html" | head -1)"

# Best-effort liveness check (no restart needed — serve-control reads dist/ per request).
if curl -sf -o /dev/null "http://127.0.0.1:${PORT}${BASE_PATH}/"; then
  echo "==> live on http://127.0.0.1:${PORT}${BASE_PATH}/"
else
  echo "note: local server on :${PORT} not reachable; dist swapped regardless"
fi
echo "==> rollback if needed:  rm -rf ${LIVE} && mv ${BAK} ${LIVE}"
echo "DEPLOYED"
