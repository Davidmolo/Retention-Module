# Migrating into the future GP / XXII Admin repo

Framework of the GP repo is unknown — this module is **Next.js** on purpose and isolated under `frontend/`.

## Copy these folders

```
frontend/src/lib/adapters/gp/
frontend/src/lib/retention/
frontend/src/app/retention/
frontend/src/app/s/
frontend/src/app/api/retention/
frontend/src/app/api/survey/
frontend/src/components/admin/
```

## Wire-up checklist

1. Replace `mockGpAdapter` with live GP queries (same method names).
2. Replace in-memory `retentionStore` with Mongo/Postgres matching GP’s DB.
3. Mount Retention under existing admin shell/nav (or keep `AdminShell` temporarily).
4. Reuse GP auth instead of open local routes.
5. Point SMS adapter at Twilio/SimpleTexting once chosen.
6. Confirm phone + CPM field sources.

## Adapter contract (do not break)

```ts
listDrivers({ includeInactive?: boolean })
getDriver(driverId)
getSixWeekAverages(driverId) // milesPerWeek, driverPayroll, grossMarginPct, cpm
```
