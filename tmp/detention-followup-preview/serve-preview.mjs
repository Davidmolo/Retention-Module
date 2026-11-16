import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(fileURLToPath(import.meta.url));
const server = http.createServer((req, res) => {
  let rel = decodeURIComponent((req.url || "/").split("?")[0]);
  if (rel === "/") rel = "/01-dispatcher-felix.html";
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    res.end();
    return;
  }
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    const ext = path.extname(file);
    const type = ext === ".png" ? "image/png" : "text/html; charset=utf-8";
    res.writeHead(200, { "content-type": type });
    res.end(buf);
  });
});
server.listen(8766, "127.0.0.1", () => {
  console.log("listening 8766");
});
