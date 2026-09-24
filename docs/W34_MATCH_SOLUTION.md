# Week 34 — How we make our report match the client sheet

**Client file:** `C:\Users\HP\Desktop\week34.xlsx`  
**Week:** Tue 11 Aug 2026 – Mon 17 Aug 2026  

## What we already fixed (working)

| Issue | Fix | Proof |
|-------|-----|--------|
| Split-haul miles/gross (Daud 245) | Solo + helper/owner via `driver_routes` | Sheet **4,843.7 / $12,007.60** = ours **4,843.65 / $12,007.60** |
| Stale stored report | Regenerated W34 (`generate:report 2026 34`) | UI now has live numbers |
| Route revenue $100 floors | Re-ran `allocateRouteRevenueForLoads` for W34 loads | Multi-driver shares refreshed |

After regenerate + compare to `week34.xlsx`: **Daud matches**. Miles still strong on most matched drivers.

---

## Why it is still not 100% identical

Gaps fall into **3 buckets** (not one bug):

### A) Miles match, gross different (~10+ drivers, e.g. Norton 254)

Example **Norton**:
- Miles: sheet 3005.1 ≈ ours 3005.05  
- Gross: sheet **$8,000** vs ours **$8,514**

Ours **$8,514** = exact sum of OpenRoad **load.total** for his 5 W34 deliveries.  
So the **client sheet is lower than the client’s own TMS load totals**.  
We cannot “code-fix” OpenRoad to invent $8,000 without ignoring the API.

**Fix options:**
1. Ask client which source is correct for gross (TMS load total vs payroll export).  
2. Or **import sheet overrides** for gross (and optionally miles) after generate so the app displays their card numbers.

### B) Large mile gaps (few drivers)

| Driver | Sheet mi | Ours | Action |
|--------|----------|------|--------|
| Sadler 688 | 1,538 | 427 | Find which loads sheet counts that miss our Tue–Mon window |
| Chambers 256 | 3,000 | 1,915 | Same — sheet implies extra haul(s) |
| (others) | small Δ | | Rounding / edge |

**Fix:** Load-by-load audit against OpenRoad + sheet; adjust week rule only if client confirms different week cut.

### C) Expense lines (pay / fuel / PrePass)

Even when miles+gross match, green MPG/PPG and PrePass can differ.  
**Fix:** Optional — copy fuel MPG/PPG + PrePass from client sheet into stored report (hand-edit API already exists), or leave as secondary.

---

## Recommended plan for the frustrated client

**Immediate (this week):**
1. Send them the reconciliation doc (already on Desktop) showing **Daud is fixed** and **93%-class mile alignment**.  
2. For Norton-style cases, show: “OpenRoad loads sum to $X; sheet shows $Y — please confirm source of truth.”  
3. If they insist the **sheet is golden**, we add a one-click **“Apply client sheet overrides for week”** that writes their mileage + gross into `gross_profit_reports` and recomputes rate/factoring/expenses/GP.

**Proper long-term:**
1. Get payroll / settlement amounts API or export if load.total ≠ paid gross.  
2. Keep `driver_routes` rules for split hauls.  
3. Close Sadler/Chambers with explicit load lists both sides.

---

## What we need from you / client

Reply with one choice:

1. **OpenRoad is truth** — we keep API numbers; client updates sheet where it disagrees with load.total (Norton).  
2. **Sheet is truth** — we implement W34 override import from `week34.xlsx` so the app matches their cards for send-out.  
3. **Hybrid** — OpenRoad miles; sheet gross overrides only where Δ > $1.

Until that choice, regenerating alone cannot force Norton’s $8,000 if TMS loads total $8,514.
