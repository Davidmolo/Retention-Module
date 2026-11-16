import {
  isUsableOpenRoadLoadUrl,
  openRoadLoadHref,
  parseOpenRoadDetentionEmail,
} from "../lib/detention/parseOpenRoadEmail.ts";

const logo =
  "https://app.openroadtms.com/media/abc/XXII%20Final%20Logo%20v1%20no%20BG%20black.png";
const html = `<img src="${logo}"><a href="https://app.openroadtms.com/loads/99123">load</a>`;
const parsed = parseOpenRoadDetentionEmail({
  subject: "Detention completed: Load #1",
  plainBody:
    "Dear X, detention. Load Number: #2609-01029 ( https://url.us.m.mimecastprotect.com/s/abc?domain=app.openroadtms.com ) Shipment #: 1 Type of stop-off: Delivery Appointment Time: 08:00 MDT / 2026-09-29 Driver Arrival Time: 18:37 MDT / 2026-09-28 Detention start time: 10:00 MDT / 2026-09-29 Total time of the detention: 1 hour.",
  htmlBody: html,
});
if (parsed?.loadLink !== "https://app.openroadtms.com/loads/99123") {
  console.error("bad parse", parsed?.loadLink);
  process.exit(1);
}
if (openRoadLoadHref(logo, 55) !== "https://app.openroadtms.com/loads/55") {
  console.error("bad fallback", openRoadLoadHref(logo, 55));
  process.exit(1);
}
if (isUsableOpenRoadLoadUrl(logo)) {
  console.error("logo treated as usable");
  process.exit(1);
}
console.log("ok");
