#!/usr/bin/env bash
# Daily Retention outreach (after TMS so roster/dispatchers are fresh).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

with_lock "daily-retention"

run_step "occasions" retention:occasions
run_step "schedule-surveys" retention:schedule-surveys
run_step "reminders" retention:reminders

finish_pipeline "daily-retention"
