import fs from "fs";
import zlib from "zlib";

const buf = fs.readFileSync("C:/Users/123/Downloads/XXII Final Logo White Text.ai");
const text = buf.toString("latin1");
let i = 0;
let n = 0;
while (true) {
  const s = text.indexOf("stream", i);
  if (s < 0) break;
  let start = s + 6;
  if (text[start] === "\r") start++;
  if (text[start] === "\n") start++;
  const e = text.indexOf("endstream", start);
  if (e < 0) break;
  const raw = buf.subarray(start, e - (text[e - 1] === "\n" ? 1 : 0) - (text[e - 2] === "\r" ? 1 : 0));
  let out = raw;
  try {
    out = zlib.inflateSync(raw);
  } catch {
    try {
      out = zlib.inflateRawSync(raw);
    } catch {
      out = null;
    }
  }
  n++;
  if (out) {
    const s = out.toString("latin1");
    const interesting = /rg|RG|scn|CENTURY|Tj|g\b|re\b/.test(s);
    if (interesting) {
      console.log("\n=== stream", n, "len", out.length, "===");
      console.log(s.slice(0, 1500).replace(/[^\x09\x0a\x0d\x20-\x7e]/g, "."));
    }
  }
  i = e + 9;
}
console.log("streams", n);
