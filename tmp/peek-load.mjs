import nextEnv from "@next/env";
import dns from "dns";

nextEnv.loadEnvConfig(process.cwd());
try { dns.setServers(["8.8.8.8", "1.1.1.1"]); } catch {}

async function fetchOpenRoadJson(url) {
  const user = process.env.OPENROAD_API_USERNAME;
  const pass = process.env.OPENROAD_API_PASSWORD;
  const res = await fetch(url, {
    headers: {
      Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"),
      Accept: "application/json",
      "User-Agent": "grossprofit-sync/1.0",
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 160)}`);
  return res.json();
}

const loadsUrl = process.env.OPENROAD_LOADS_URL;
const finUrl = process.env.OPENROAD_LOAD_FINANCIALS_URL;
const id = 2361092;

function moneyKeys(obj, prefix = "") {
  if (!obj || typeof obj !== "object") return;
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      if (/line|haul|total|revenue|rate|amount|detention|access/i.test(k) || prefix === "") {
        moneyKeys(v, path);
      }
      continue;
    }
    if (Array.isArray(v)) {
      console.log(path, `array(${v.length})`);
      if (v[0] && typeof v[0] === "object") {
        console.log("  item keys", Object.keys(v[0]).join(","));
      }
      continue;
    }
    if (/line|haul|total|revenue|rate|mile|del|pu_|status|amount|detention|access/i.test(k)) {
      console.log(path, v);
    }
  }
}

for (const url of [`${loadsUrl}/${id}`, `${loadsUrl}?id=${id}`]) {
  try {
    const json = await fetchOpenRoadJson(url);
    const row = json?.data ?? json?.load ?? (Array.isArray(json) ? json[0] : json);
    const one = Array.isArray(row) ? row[0] : row;
    console.log("URL_OK", url.split("?")[0].replace(id, ":id"));
    console.log("TOP_KEYS", Object.keys(one || json).join(","));
    moneyKeys(one || json);
    break;
  } catch (e) {
    console.log("FAIL", url.includes("?") ? "query" : "path", e.cause?.code || e.cause?.message || e.message);
  }
}
