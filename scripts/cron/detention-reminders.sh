#!/usr/bin/env bash
# Daily Detention follow-up reminder emails (Art + ar + dispatchers).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

with_lock "detention-reminders"
run_step "detention-reminders" detention:reminders
finish_pipeline "detention-reminders"
