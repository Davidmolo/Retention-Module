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
          Accept: "*/*",
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
    req.setTimeout(25000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

const html = await get("/api-docs/ext/v1/index.html");
fs.writeFileSync("tmp/or-docs.html", html.text);
const urls = [...html.text.matchAll(/["']([^"']+\.(?:json|yaml|yml))["']/g)].map((m) => m[1]);
const src = [...html.text.matchAll(/src="([^"]+)"/g)].map((m) => m[1]);
console.log("urls", urls.slice(0, 20));
console.log("src", src.slice(0, 20));
console.log("pay mentions", (html.text.match(/driver_pay/g) || []).length);
