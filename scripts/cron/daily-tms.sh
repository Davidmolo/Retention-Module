#!/usr/bin/env bash
# Daily TMS / source sync pipeline (ordered, locked, resilient).
# Continuable: one failed OpenRoad endpoint does not skip the rest.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

with_lock "daily-tms"

# Order matters for FKs / joins
run_step "tolls" sync:tolls
run_step "tms-compensations" sync:tms-compensations
run_step "tms-drivers" sync:tms-drivers
run_step "tms-users" sync:tms-users
run_step "tms-trucks" sync:tms-trucks
run_step "tms-loads" sync:tms-loads
run_step "tms-driver-routes" sync:tms-driver-routes --all
run_step "tms-assignments" sync:tms-assignments
run_step "tms-load-financials" sync:tms-load-financials

finish_pipeline "daily-tms"
