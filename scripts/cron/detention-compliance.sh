#!/usr/bin/env bash
# Scan detention Gmail threads for dispatcher replies (48h compliance).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

with_lock "detention-compliance"
run_step "detention-compliance-scan" detention:compliance-scan
finish_pipeline "detention-compliance"
