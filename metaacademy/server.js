import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { answerQuestion } = require("../api/answer");
const { loadDocs } = require("../api/knowledge");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml; charset=utf-8"
};

async function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function safeStaticPath(urlPath) {
  const requested = urlPath === "/" ? "/index.html" : decodeURIComponent(urlPath);
  const normalized = path.normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const fullPath = path.join(rootDir, normalized);
  if (!fullPath.startsWith(rootDir)) return null;
  return fullPath;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (request.method === "POST" && url.pathname === "/api/ask") {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
        if (body.length > 1_000_000) request.destroy();
      });
      request.on("end", async () => {
        const payload = JSON.parse(body || "{}");
        const result = await answerQuestion(String(payload.question || ""));
        await sendJson(response, 200, result);
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/stats") {
      const docs = await loadDocs();
      const byCategory = docs.reduce((acc, doc) => {
        acc[doc.category] = (acc[doc.category] || 0) + 1;
        return acc;
      }, {});
      await sendJson(response, 200, { total: docs.length, byCategory });
      return;
    }

    const filePath = safeStaticPath(url.pathname);
    if (!filePath) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const ext = path.extname(filePath);
    try {
      await access(filePath);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    response.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    createReadStream(filePath)
      .on("error", () => {
        if (!response.headersSent) {
          response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        }
        if (!response.writableEnded) response.end("Not found");
      })
      .pipe(response);
  } catch (error) {
    await sendJson(response, 500, { error: "Server error", detail: error.message });
  }
});

server.listen(port, () => {
  console.log(`MetaAcademy running at http://localhost:${port}`);
});
