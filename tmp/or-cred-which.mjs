import fs from "fs";
import crypto from "crypto";
import nextEnv from "@next/env";

function grab(file) {
  if (!fs.existsSync(file)) return null;
  const t = fs.readFileSync(file, "utf8");
  const u = t.match(/^OPENROAD_API_USERNAME=(.*)$/m);
  const p = t.match(/^OPENROAD_API_PASSWORD=(.*)$/m);
  const clean = (s) => (s || "").trim().replace(/^"|"$/g, "");
  const user = clean(u?.[1]);
  const pass = clean(p?.[1]);
  const id = (s) => crypto.createHash("sha256").update(s).digest("hex").slice(0, 8);
  return { userLen: user.length, passLen: pass.length, userId: user ? id(user) : "", passId: pass ? id(pass) : "" };
}
const env = grab(".env");
const local = grab(".env.local");
nextEnv.loadEnvConfig(process.cwd());
const loadedUser = process.env.OPENROAD_API_USERNAME || "";
const loadedId = crypto.createHash("sha256").update(loadedUser).digest("hex").slice(0, 8);
console.log("env", JSON.stringify(env));
console.log("env.local", JSON.stringify(local));
console.log("loaded_user_id", loadedId, "len", loadedUser.length);
console.log("same_user", env?.userId === local?.userId);
console.log("loaded_is_env", loadedId === env?.userId);
console.log("loaded_is_local", loadedId === local?.userId);
