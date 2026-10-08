import { parseOpenRoadDetentionEmail, isBelowMinBillable } from "../lib/detention/parseOpenRoadEmail.ts";

const subject = "Detention completed: Load #9679192 | XXII Century";
const plain = `Dear Arrive Logistics,

We would like to inform you that our driver #1021 (Carlos Crayton) with Truck #270 completed detention time on your shipment #9679192:

Type of stop-off: Delivery at MicroStar Quality Services - Fort Collins, (Fort Collins, CO)

Appointment Time: 08:00 MDT / 2026-09-29

Driver Arrival Time: 18:37 MDT / 2026-09-28

Detention start time: 10:00 MDT / 2026-09-29

Total time of the detention: 1 hour and 30 minutes.

Your shipment details:

Shipment #: 9679192

Load Number: #2609-01029 
( https://url.us.m.mimecastprotect.com/s/x8XCCERMPYT7PMEtNfGGi7BGda?domain=app.openroadtms.com )
(1) Pick up: ADMIRAL BEVERAGE CORPORATION, 531 W 600 N, Salt Lake City, UT

(2) Delivery: MicroStar Quality Services - Fort Collins, 3620 Weicker Dr # Bay Door B, Fort Collins, CO

If you have any additional questions, do not hesitate to contact our driver manager Alex Mladenovski at 630-948-0501.
`;

const parsed = parseOpenRoadDetentionEmail({
  subject,
  plainBody: plain,
  to: "billing@arrivelogistics.com, ar@goxxii.com",
});

console.log(JSON.stringify(parsed, null, 2));
console.log("amount", parsed?.amount, "belowMin", isBelowMinBillable(parsed?.amount ?? 0));
if (!parsed || parsed.detentionMins !== 90 || parsed.amount !== 37.5) {
  console.error("PARSE_ASSERT_FAIL");
  process.exit(1);
}
// 90 min * 25/hr = 37.5 → below $50 minimum (should be skipped in intake)
console.log("PARSE_OK");
