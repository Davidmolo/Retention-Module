import fs from "fs";
const t = fs.readFileSync(".env", "utf8");
function val(name) {
  const m = t.match(new RegExp("^" + name + "=(.*)$", "m"));
  return (m?.[1] || "").trim().replace(/^"|"$/g, "");
}
process.stdout.write(val("OPENROAD_API_USERNAME") + "\n" + val("OPENROAD_API_PASSWORD") + "\n");
