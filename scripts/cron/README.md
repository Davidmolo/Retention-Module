# Cron pipelines (Gross Profit + Retention)
#
# Files
#   scripts/cron/lib.sh              shared lock + logging
#   scripts/cron/daily-tms.sh        OpenRoad / TMS syncs
#   scripts/cron/weekly-gp.sh        Tuesday report
#   scripts/cron/daily-retention.sh  occasions + surveys + reminders
#   scripts/cron/fuel.sh             SFTP fuel
#   crontab                          supercronic schedule
#
# Guarantees
# - flock: overlapping runs are skipped (exit 0), never double-run
# - ordered steps inside each pipeline
# - soft-fail: one bad OpenRoad endpoint continues the rest
# - weekly generate:report is critical (pipeline fails if it fails)
# - logs: /app/logs/<pipeline>.log
#
# Schedule (container TZ America/New_York)
# | When            | Pipeline         |
# |-----------------|------------------|
# | */30            | fuel             |
# | Daily 03:00     | daily-tms        |
# | Tue 05:00       | weekly-gp        |
# | Daily 08:00     | daily-retention  |
#
# Manual
#   bash scripts/cron/daily-tms.sh
#   pnpm cron:daily-retention
