import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { getPool } from "../lib/db.ts";
const p = getPool();
const [t] = await p.query("SHOW TABLES");
console.log(t.map((r) => Object.values(r)[0]).join("\n"));
await p.end();
