#!/usr/bin/env bash
# Weekly Gross Profit report pipeline (Tuesday after daily TMS).
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

with_lock "weekly-gp"

run_step "samsara-mpg" sync:samsara-mpg
run_step "fuel-driver-link" backfill:drivers
# Relay is optional — skip quietly if key missing (script handles it)
run_step "relay-fuel" sync:relay-fuel
# Report is critical for Retention 6-week averages
if ! run_step_critical "generate-report" generate:report; then
  finish_pipeline "weekly-gp"
fi

finish_pipeline "weekly-gp"
