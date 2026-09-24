#!/usr/bin/env bash
# Shared helpers for Gross Profit / Retention cron pipelines.
# shellcheck disable=SC2034

set -u

APP_DIR="${APP_DIR:-/app}"
LOG_DIR="${LOG_DIR:-$APP_DIR/logs}"
LOCK_DIR="${LOCK_DIR:-/tmp/gp-cron-locks}"
# Prefer bun in worker image; fall back to pnpm/npm locally
if command -v bun >/dev/null 2>&1; then
  RUNNER=(bun run)
elif command -v pnpm >/dev/null 2>&1; then
  RUNNER=(pnpm)
else
  RUNNER=(npm run)
fi

mkdir -p "$LOG_DIR" "$LOCK_DIR"
cd "$APP_DIR" || exit 1

ts() { date -u +"%Y-%m-%dT%H:%M:%SZ"; }

log() {
  local msg="[$(ts)] $*"
  echo "$msg"
  if [[ -n "${JOB_LOG:-}" ]]; then
    echo "$msg" >>"$JOB_LOG"
  fi
}

# run_step <name> <pnpm-script> [args...]
# Continues on failure; increments FAIL_COUNT. Returns step exit code.
run_step() {
  local name="$1"
  shift
  local script="$1"
  shift
  log "START $name ($script $*)"
  set +e
  "${RUNNER[@]}" "$script" "$@" >>"$JOB_LOG" 2>&1
  local rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    log "OK    $name"
  else
    log "FAIL  $name exit=$rc"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    FAILED_STEPS+=("$name")
  fi
  return 0
}

# run_step_critical <name> <script> — aborts pipeline on failure
run_step_critical() {
  local name="$1"
  shift
  local script="$1"
  shift
  log "START $name (critical) ($script $*)"
  set +e
  "${RUNNER[@]}" "$script" "$@" >>"$JOB_LOG" 2>&1
  local rc=$?
  set -e
  if [[ $rc -eq 0 ]]; then
    log "OK    $name"
    return 0
  fi
  log "FAIL  $name exit=$rc (critical — aborting pipeline)"
  FAIL_COUNT=$((FAIL_COUNT + 1))
  FAILED_STEPS+=("$name")
  return "$rc"
}

# with_lock <job-name> <fn>
# Skip cleanly if previous run still holds the lock (no crash).
with_lock() {
  local job="$1"
  local lock="$LOCK_DIR/$job.lock"
  exec 9>"$lock"
  if ! flock -n 9; then
    log "SKIP  $job — previous run still holding lock"
    exit 0
  fi
  JOB_LOG="$LOG_DIR/$job.log"
  FAIL_COUNT=0
  FAILED_STEPS=()
  log "===== BEGIN $job ====="
}

finish_pipeline() {
  local job="$1"
  if [[ $FAIL_COUNT -eq 0 ]]; then
    log "===== END $job — all steps OK ====="
    exit 0
  fi
  log "===== END $job — $FAIL_COUNT step(s) failed: ${FAILED_STEPS[*]} ====="
  # Non-zero so monitoring can alert, but lock is released via process exit
  exit 1
}
