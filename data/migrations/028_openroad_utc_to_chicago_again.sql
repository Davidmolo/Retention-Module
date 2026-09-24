-- NOTE: Prefer re-syncing OpenRoad loads after toSqlDateTimeUtc (API sends …Z).
-- This CONVERT is only for DBs that still hold naive UTC wall-clock values
-- (no Z on ingest). If CONVERT_TZ is unavailable it is a no-op (COALESCE).
-- Do NOT re-run on data already stored as America/Chicago.

UPDATE loads
   SET pickup_at = COALESCE(CONVERT_TZ(pickup_at, '+00:00', 'America/Chicago'), pickup_at),
       delivery_at = COALESCE(CONVERT_TZ(delivery_at, '+00:00', 'America/Chicago'), delivery_at),
       source_created_at = COALESCE(CONVERT_TZ(source_created_at, '+00:00', 'America/Chicago'), source_created_at),
       source_updated_at = COALESCE(CONVERT_TZ(source_updated_at, '+00:00', 'America/Chicago'), source_updated_at);

UPDATE driver_routes
   SET source_created_at = COALESCE(CONVERT_TZ(source_created_at, '+00:00', 'America/Chicago'), source_created_at),
       source_updated_at = COALESCE(CONVERT_TZ(source_updated_at, '+00:00', 'America/Chicago'), source_updated_at);
