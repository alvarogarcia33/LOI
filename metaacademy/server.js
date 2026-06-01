import { createServer } from "node:http";
import { readFile, readdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = __dirname;
const knowledgeDir = path.resolve(rootDir, "..", "conocimiento");
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

let cachedDocs;

async function walkMarkdown(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkMarkdown(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

function cleanMarkdown(markdown) {
  return markdown
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/[#>*_`|]/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function markdownSections(markdown) {
  const parts = markdown
    .split(/\n(?=#{1,3}\s+)/)
    .map((part) => cleanMarkdown(part))
    .filter(Boolean);

  return parts.length ? parts : [cleanMarkdown(markdown)];
}

function titleFromMarkdown(markdown, filePath) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : path.basename(filePath, ".md");
}

function categoryFromPath(filePath) {
  const relative = path.relative(knowledgeDir, filePath);
  const parts = relative.split(path.sep);
  if (parts[0] === "noticias" && parts.length > 2) return parts[1];
  if (parts[0] === "noticias") return "Noticias";
  if (parts[0] === "maestros-del-juego") return "Maestros del Juego";
  return "Programas";
}

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2);
}

function expandQueryTerms(question) {
  const terms = new Set(tokenize(question));
  const aliases = {
    tierra: ["land", "plot", "plots", "hexagons"],
    tierras: ["land", "plot", "plots", "hexagons"],
    parcela: ["land", "plot", "plots"],
    parcelas: ["land", "plot", "plots"],
    monetiza: ["monetize", "profit", "business", "marketplace"],
    monetizar: ["monetize", "profit", "business", "marketplace"],
    maestro: ["master", "masters", "game"],
    maestros: ["master", "masters", "game"],
    asesor: ["advisor"],
    asesores: ["advisor"],
    recursos: ["resources"],
    recurso: ["resource"],
    objetos: ["objects"],
    objeto: ["object"],
    monedas: ["coin", "coins"],
    moneda: ["coin"],
    orbes: ["orb", "orbs"],
    orbe: ["orb"],
    juego: ["game"],
    jugadores: ["players"],
    jugador: ["player"]
  };

  for (const term of [...terms]) {
    for (const alias of aliases[term] || []) terms.add(alias);
  }

  return [...terms];
}

async function loadDocs() {
  if (cachedDocs) return cachedDocs;

  const files = await walkMarkdown(knowledgeDir);
  cachedDocs = await Promise.all(files.map(async (filePath) => {
    const markdown = await readFile(filePath, "utf8");
    const text = cleanMarkdown(markdown);
    return {
      filePath,
      relativePath: path.relative(knowledgeDir, filePath),
      title: titleFromMarkdown(markdown, filePath),
      category: categoryFromPath(filePath),
      text,
      sections: markdownSections(markdown),
      tokens: tokenize(`${titleFromMarkdown(markdown, filePath)} ${text}`)
    };
  }));

  return cachedDocs;
}

function bestExcerpt(doc, terms) {
  const paragraphs = doc.sections
    .flatMap((section) => section.split(/\n{2,}/))
    .map((item) => item.trim())
    .filter(Boolean);

  let best = paragraphs[0] || doc.text.slice(0, 420);
  let bestScore = -1;
  const asksProduction = terms.some((term) => ["produce", "produccion", "genera", "generar", "dia", "detiene", "detendra"].includes(term));
  const asksActivation = terms.some((term) => ["comision", "activar", "activacion", "cuesta", "pagar"].includes(term));

  for (const paragraph of paragraphs) {
    const normalized = tokenize(paragraph);
    const uniqueMatches = terms.reduce((sum, term) => sum + (normalized.includes(term) ? 1 : 0), 0);
    const repeatedMatches = terms.reduce((sum, term) => sum + normalized.filter((word) => word === term).length, 0);
    const productionBonus = asksProduction && /farming est[aá]ndar|produce|producci[oó]n|genera|generar|d[ií]a|detiene|detendr/i.test(paragraph) ? 14 : 0;
    const activationBonus = asksActivation && /comisi[oó]n|activar|activaci[oó]n|cuesta|pagar/i.test(paragraph) ? 10 : 0;
    const score = uniqueMatches * 5 + Math.min(repeatedMatches, 3) + productionBonus + activationBonus;
    if (score > bestScore && paragraph.length > 40) {
      best = paragraph;
      bestScore = score;
    }
  }

  return best.replace(/\s+/g, " ").slice(0, 560);
}

function scoreDoc(doc, terms, rawQuestion = "") {
  const titleTokens = tokenize(doc.title);
  const rawTokens = tokenize(rawQuestion);
  let score = 0;
  for (const term of terms) {
    score += Math.min(doc.tokens.filter((token) => token === term).length, 8);
    if (titleTokens.includes(term)) score += 8;
    if (doc.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)) score += 5;
  }
  if (titleTokens.some((term) => rawTokens.includes(term))) score += 90;
  if (/(land|tierra|parcela)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("land")) {
    score += 140;
  }
  if (/(advisor|asesor)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("advisor")) {
    score += 140;
  }
  if (/(orb|orbe)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("orb")) {
    score += 140;
  }
  if (/maestr|master|land|tierra|parcela|advisor|asesor|orb|orbe/i.test(rawQuestion) && doc.category === "Maestros del Juego") {
    score += 18;
  }
  return score;
}

async function answerQuestion(question) {
  const docs = await loadDocs();
  const terms = expandQueryTerms(question);

  if (!terms.length) {
    return {
      answer: "Escribe una pregunta sobre Olympia Lab, H-MAP, 7PT, 9PT, MOG, farming, REEX, HMAP o cualquiera de los temas de la base.",
      sources: []
    };
  }

  const results = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, terms, question) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ doc }) => ({
      title: doc.title,
      category: doc.category,
      path: doc.relativePath,
      excerpt: bestExcerpt(doc, terms)
    }));

  if (!results.length) {
    return {
      answer: "No encontré una coincidencia clara en la base de conocimiento. Prueba con términos más específicos, por ejemplo: 7PT, 9PT, H-MAP, Farming Points, REEX, MOG o Creadores de Mercado.",
      sources: []
    };
  }

  const answer = [
    "Según la base de conocimiento, esto es lo más relevante:",
    ...results.slice(0, 3).map((item) => `- ${item.excerpt}`)
  ].join("\n");

  return { answer, sources: results };
}

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
    response.writeHead(200, { "content-type": mimeTypes[ext] || "application/octet-stream" });
    createReadStream(filePath)
      .on("error", () => {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
      })
      .pipe(response);
  } catch (error) {
    await sendJson(response, 500, { error: "Server error", detail: error.message });
  }
});

server.listen(port, () => {
  console.log(`MetaAcademy running at http://localhost:${port}`);
});
