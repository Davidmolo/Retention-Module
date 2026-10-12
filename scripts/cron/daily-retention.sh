#!/usr/bin/env bash
# Daily Retention outreach.
# Refresh OpenRoad drivers first so status / date_removed are current —
# Retention only texts active (non-terminated) roster drivers.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

with_lock "daily-retention"

# Soft-fail OK: even if OpenRoad blips, still attempt occasions/surveys
# against the last known roster (daily-tms also syncs drivers at 3am ET).
run_step "tms-drivers" sync:tms-drivers
run_step "occasions" retention:occasions
run_step "schedule-surveys" retention:schedule-surveys
run_step "reminders" retention:reminders

finish_pipeline "daily-retention"
