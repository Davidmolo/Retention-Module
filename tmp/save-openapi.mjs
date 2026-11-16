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
          Accept: "application/yaml, text/yaml, */*",
          "User-Agent": "grossprofit-sync/1.0",
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () =>
          resolve({ status: res.statusCode, buf: Buffer.concat(chunks) })
        );
      }
    );
    req.on("error", reject);
    req.setTimeout(40000, () => req.destroy(new Error("timeout")));
    req.end();
  });
}

const r = await get("/api-docs/ext/v1/openapi.yaml");
fs.writeFileSync("tmp/or-openapi.yaml", r.buf);
console.log("status", r.status, "bytes", r.buf.length);
