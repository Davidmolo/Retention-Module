# XXII Driver Retention Module (Next.js)

Portable standalone module under `d:\azfs\driver-retention`.

Built with **Next.js App Router + Tailwind + Framer Motion + Recharts** so the UI can ship before the Gross Profit repo/framework is known. GP metrics use a **mock adapter** (`frontend/src/lib/adapters/gp/`).

## Folders

| Folder | Role |
|--------|------|
| `frontend/` | Next.js app (UI + API routes) — **this is the only app** |
| `docs/` | Migration notes |

## Run

```bash
cd d:\azfs\driver-retention\frontend
npm install
npm run dev
```

Open http://localhost:3000 → redirects to `/retention`

## What’s included (Day 1 foundation)

- Professional animated **Retention Dashboard** (KPIs, charts, recent responses)
- **Driver detail** with mock 6-week GP metrics, case status, internal notes, Send Survey
- **Mobile survey** at `/s/[token]` (4–5 → Google review, 1–3 → departments + comment)
- API routes under `/api/retention/*` and `/api/survey/*`
- Demo seed data so the dashboard looks like the approved UI mockup

## Portable for later GP merge

| Keep / move | Purpose |
|-------------|---------|
| `frontend/src/lib/adapters/gp/` | Swap `mockGpAdapter` for live GP |
| `frontend/src/lib/retention/` | Domain, store, services |
| `frontend/src/app/retention/` | Admin UI routes |
| `frontend/src/app/s/` | Driver survey |
| `frontend/src/app/api/` | APIs |
| `frontend/src/components/admin/` | Dashboard UI |

See `docs/MIGRATION-TO-GP.md` and `docs/10-DAY-PLAN.md`.
