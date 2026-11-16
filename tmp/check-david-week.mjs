function addDaysYmd(ymd, days) {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
function previousMondaySunday(todayYmd) {
  const [y, m, d] = todayYmd.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const back = dow === 0 ? 7 : dow;
  const end = addDaysYmd(todayYmd, -back);
  return { start: addDaysYmd(end, -6), end, dow };
}
for (const day of ["2026-11-04", "2026-11-02", "2026-11-01", "2026-11-05"]) {
  console.log(day, previousMondaySunday(day));
}
