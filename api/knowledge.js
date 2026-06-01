const fs = require("node:fs/promises");
const path = require("node:path");

const knowledgeDir = path.join(process.cwd(), "conocimiento");
let cachedDocs;

async function walkMarkdown(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await walkMarkdown(fullPath));
    else if (entry.isFile() && entry.name.endsWith(".md")) files.push(fullPath);
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
    tierra: ["land", "plot", "plots"],
    tierras: ["land", "plot", "plots"],
    parcela: ["land", "plot", "plots"],
    parcelas: ["land", "plot", "plots"],
    monetizar: ["monetize", "profit", "business", "marketplace"],
    monetiza: ["monetize", "profit", "business", "marketplace"],
    maestro: ["master", "masters", "game"],
    maestros: ["master", "masters", "game"],
    asesor: ["advisor"],
    recursos: ["resources"],
    objetos: ["objects"],
    monedas: ["coin", "coins"],
    orbes: ["orb", "orbs"],
    juego: ["game"],
    jugadores: ["players"]
  };

  for (const term of [...terms]) {
    for (const alias of aliases[term] || []) terms.add(alias);
  }

  return [...terms];
}

function markdownSections(markdown) {
  const sections = markdown
    .split(/\n(?=#{1,3}\s+)/)
    .map((part) => cleanMarkdown(part))
    .filter(Boolean);

  return sections.length ? sections : [cleanMarkdown(markdown)];
}

async function loadDocs() {
  if (cachedDocs) return cachedDocs;
  const files = await walkMarkdown(knowledgeDir);

  cachedDocs = await Promise.all(files.map(async (filePath) => {
    const markdown = await fs.readFile(filePath, "utf8");
    const title = titleFromMarkdown(markdown, filePath);
    const text = cleanMarkdown(markdown);
    return {
      filePath,
      relativePath: path.relative(knowledgeDir, filePath),
      title,
      category: categoryFromPath(filePath),
      text,
      sections: markdownSections(markdown),
      tokens: tokenize(`${title} ${text}`)
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

  for (const paragraph of paragraphs) {
    const normalized = tokenize(paragraph);
    const uniqueMatches = terms.reduce((sum, term) => sum + (normalized.includes(term) ? 1 : 0), 0);
    const repeatedMatches = terms.reduce((sum, term) => sum + normalized.filter((word) => word === term).length, 0);
    const score = uniqueMatches * 5 + Math.min(repeatedMatches, 3);
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
  if (/(land|tierra|parcela)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("land")) score += 140;
  if (/(advisor|asesor)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("advisor")) score += 140;
  if (/(orb|orbe)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("orb")) score += 140;
  if (/maestr|master|land|tierra|parcela|advisor|asesor|orb|orbe/i.test(rawQuestion) && doc.category === "Maestros del Juego") score += 18;

  return score;
}

async function answerQuestion(question) {
  const docs = await loadDocs();
  const terms = expandQueryTerms(question);

  if (!terms.length) {
    return {
      answer: "Escribe una pregunta sobre Olympia Lab, Legends of Interactions, H-MAP, Jugadores, Maestros del Juego o Creadores de Mercado.",
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
      answer: "No encontré una coincidencia clara en la base de conocimiento. Prueba con términos más específicos.",
      sources: []
    };
  }

  return {
    answer: [
      "Según la base de conocimiento, esto es lo más relevante:",
      ...results.slice(0, 3).map((item) => `- ${item.excerpt}`)
    ].join("\n"),
    sources: results
  };
}

module.exports = { answerQuestion, loadDocs };
