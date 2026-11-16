import https from "https";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const user = process.env.OPENROAD_API_USERNAME;
const pass = process.env.OPENROAD_API_PASSWORD;
const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
const IP = "44.209.76.5";

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: IP,
        servername: "app.openroadtms.com",
        path,
        method: "GET",
        headers: {
          Host: "app.openroadtms.com",
          Authorization: auth,
          Accept: "application/json",
          "User-Agent": "grossprofit-sync/1.0",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          console.log("STATUS", res.statusCode, "LEN", text.length);
          resolve(text);
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

const id = 2361092;
const text = await get(`/api/ext/v1/loads/${id}`);
let json;
try {
  json = JSON.parse(text);
} catch {
  console.log(text.slice(0, 300));
  process.exit(1);
}
const row = json.data && !Array.isArray(json.data) ? json.data : json;
const keys = Object.keys(row);
console.log("KEYS", keys.join(","));
for (const k of keys) {
  const v = row[k];
  if (v == null || ["string", "number", "boolean"].includes(typeof v)) {
    if (/mile|haul|total|rev|rate|del|pu|status|fuel|charge|access|detent/i.test(k)) {
      console.log(k, v);
    }
  }
}
if (Array.isArray(row.additional_charges)) {
  console.log("charges", row.additional_charges.length);
  console.log(JSON.stringify(row.additional_charges[0] || null).slice(0, 500));
}
if (Array.isArray(row.destinations)) {
  for (const d of row.destinations) {
    console.log(
      "STOP",
      d.stop_type,
      d.position,
      "driver",
      d.driver_id,
      "miles",
      d.miles,
      "detention",
      d.driver_detention,
      "app",
      d.app_date,
      "in",
      d.time_in,
      "out",
      d.time_out
    );
  }
}
for (const path of [
  `/api/ext/v1/load_financials/${id}`,
  `/api/ext/v1/loads/${id}/load_financials`,
  `/api/ext/v1/load_financials?load_id=${id}&per_page=1`,
]) {
  console.log("TRY", path);
  const finText = await get(path);
  console.log(finText.slice(0, 400).replace(/\s+/g, " "));
}
