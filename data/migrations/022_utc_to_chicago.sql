-- One-time: OpenRoad datetimes were stored as UTC wall-clock with Z stripped.
-- Convert to America/Chicago so DATE() week buckets match the US fleet calendar.
-- Safe to skip if CONVERT_TZ is unavailable (returns NULL) — app also writes Chicago going forward.

UPDATE loads
   SET pickup_at = COALESCE(CONVERT_TZ(pickup_at, '+00:00', 'America/Chicago'), pickup_at),
       delivery_at = COALESCE(CONVERT_TZ(delivery_at, '+00:00', 'America/Chicago'), delivery_at),
       source_created_at = COALESCE(CONVERT_TZ(source_created_at, '+00:00', 'America/Chicago'), source_created_at),
       source_updated_at = COALESCE(CONVERT_TZ(source_updated_at, '+00:00', 'America/Chicago'), source_updated_at);

UPDATE driver_routes
   SET source_created_at = COALESCE(CONVERT_TZ(source_created_at, '+00:00', 'America/Chicago'), source_created_at),
       source_updated_at = COALESCE(CONVERT_TZ(source_updated_at, '+00:00', 'America/Chicago'), source_updated_at);
