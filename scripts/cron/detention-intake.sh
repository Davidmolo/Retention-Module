#!/usr/bin/env bash
# Poll ar@ for OpenRoad Detention completed emails → XXII Detention board.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

with_lock "detention-intake"
run_step "detention-intake" detention:intake
finish_pipeline "detention-intake"
