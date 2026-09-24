#!/usr/bin/env bash
# Fuel .dat SFTP import (every 30 minutes). Locked so runs never overlap.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib.sh
source "$SCRIPT_DIR/lib.sh"

with_lock "fuel"

run_step "fuel-sftp" sync:fuel

finish_pipeline "fuel"
