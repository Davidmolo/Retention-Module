import fs from "fs";

const p = "C:/Users/123/Downloads/XXII Final Logo White Text.ai";
const buf = fs.readFileSync(p);
const text = buf.toString("latin1");
console.log("bytes", buf.length);
console.log("header", buf.subarray(0, 16).toString("latin1"));
const png = buf.indexOf(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
const jpg = buf.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
console.log("pngAt", png, "jpgAt", jpg);
for (const key of ["MediaBox", "ArtBox", "BleedBox", "TrimBox", "White", "navy", "0B1437"]) {
  const i = text.indexOf(key);
  console.log(key, i);
}
const boxes = [...text.matchAll(/MediaBox\s*\[([^\]]+)\]/g)].slice(0, 5);
console.log("media", boxes.map((m) => m[1]));
