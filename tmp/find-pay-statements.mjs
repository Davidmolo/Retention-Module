import https from "https";
import nextEnv from "@next/env";
import fs from "fs";

nextEnv.loadEnvConfig(process.cwd());
const user = process.env.OPENROAD_API_USERNAME;
const pass = process.env.OPENROAD_API_PASSWORD;
const auth = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

function get(path) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        host: "44.209.76.5",
        servername: "app.openroadtms.com",
        path,
        method: "GET",
        headers: {
          Host: "app.openroadtms.com",
          Authorization: auth,
          Accept: "application/json, text/html",
          "User-Agent": "grossprofit-sync/1.0",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString("utf8") })
        );
      }
    );
    req.on("error", reject);
    req.setTimeout(20000, () => {
      req.destroy(new Error("timeout"));
    });
    req.end();
  });
}

const paths = [
  "/api-docs/ext/v1/swagger.json",
  "/api-docs/ext/v1/openapi.json",
  "/api/ext/v1/openapi.json",
  "/api-docs/ext/v1/index.html",
];
for (const p of paths) {
  try {
    const r = await get(p);
    console.log(p, r.status, r.text.slice(0, 120).replace(/\s+/g, " "));
    if (r.status === 200 && r.text.includes("driver_pay")) {
      fs.writeFileSync("tmp/or-docs-snippet.txt", r.text);
      console.log("saved", p, r.text.length);
      break;
    }
  } catch (e) {
    console.log(p, e.message);
  }
}
