const fs = require("node:fs/promises");
const path = require("node:path");

const knowledgeDir = path.resolve(__dirname, "..", "conocimiento");
let cachedDocs;
const stopwords = new Set([
  "que", "como", "cual", "cuales", "donde", "cuando", "porque", "por", "para",
  "con", "sin", "una", "uno", "unos", "unas", "del", "las", "los", "sobre",
  "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "hay",
  "ser", "soy", "era", "fue", "son", "qué", "cómo", "cuál", "cuáles", "en"
]);

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
    .replace(/factory\.dronex|factory\.drone?x/gi, " factorydronex ")
    .replace(/factory\.dron|factory\.drone/gi, " factorydrone ")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));
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
    jugadores: ["players"],
    dron: ["drone", "drones", "dronex", "factorydronex", "factorydrone"],
    drones: ["drone", "dron", "dronex", "factorydronex", "factorydrone"],
    drone: ["dron", "drones", "dronex", "factorydronex", "factorydrone"],
    dronex: ["factorydronex", "drone", "dron", "drones"],
    factory: ["factorydronex", "factorydrone"]
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

function emptyQuestionResponse() {
  return {
    answer: "Escribe una pregunta sobre Olympia Lab, Legends of Interactions, H-MAP, Jugadores, Maestros del Juego o Creadores de Mercado.",
    sources: []
  };
}

function trimToSentence(text, maxLength = 420) {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;

  const slice = compact.slice(0, maxLength);
  const lastSentence = Math.max(slice.lastIndexOf("."), slice.lastIndexOf("!"), slice.lastIndexOf("?"));
  if (lastSentence > 120) return slice.slice(0, lastSentence + 1).trim();
  return `${slice.trim()}...`;
}

function bestExcerpt(doc, terms, rawQuestion = "") {
  const paragraphs = doc.sections
    .flatMap((section) => section.split(/\n{2,}/))
    .map((item) => item.trim())
    .filter((item) => item && item.length > 20);

  let best = paragraphs[0] || doc.text.slice(0, 420);
  let bestScore = -1;
  const normalizedQuestion = rawQuestion
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const asksDefinition = /\bque es\b|\bque significa\b|\ben que consiste\b|\bque hace\b/.test(normalizedQuestion);

  for (const paragraph of paragraphs) {
    const normalized = tokenize(paragraph);
    const uniqueMatches = terms.reduce((sum, term) => sum + (normalized.includes(term) ? 1 : 0), 0);
    const repeatedMatches = terms.reduce((sum, term) => sum + normalized.filter((word) => word === term).length, 0);
    const definitionBonus = asksDefinition && /(es |son |consiste|permite|sirve|produce)/i.test(paragraph) ? 10 : 0;
    const metadataPenalty = /Categoria:|Fuente:|Publicado:|Capturado:/i.test(paragraph) ? 20 : 0;
    const score = uniqueMatches * 5 + Math.min(repeatedMatches, 3) + definitionBonus - metadataPenalty;
    if (score > bestScore && paragraph.length > 40) {
      best = paragraph;
      bestScore = score;
    }
  }

  return trimToSentence(best, 520);
}

function scoreDoc(doc, terms, rawQuestion = "") {
  const titleTokens = tokenize(doc.title);
  const rawTokens = tokenize(rawQuestion);
  const normalizedQuestion = rawQuestion
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
  const normalizedTitle = doc.title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
  const normalizedPath = doc.relativePath
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();
  const asksFactory = normalizedQuestion.includes("factory");
  const asksDrone = normalizedQuestion.includes("dron") || normalizedQuestion.includes("drone");
  let score = 0;

  for (const term of terms) {
    score += Math.min(doc.tokens.filter((token) => token === term).length, 8);
    if (titleTokens.includes(term)) score += 8;
    if (doc.category.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(term)) score += 5;
  }

  if (titleTokens.some((term) => rawTokens.includes(term))) score += 90;
  if (normalizedQuestion.includes("factory dron") || normalizedQuestion.includes("factory drone")) {
    if (/factory.*dron|dronex|drone/i.test(normalizedTitle)) score += 220;
    if (/factory.*dron|dronex|drone/i.test(doc.relativePath)) score += 120;
  }
  if (normalizedQuestion.includes("dron") || normalizedQuestion.includes("drone")) {
    if (/dronex|drone|dron/i.test(normalizedTitle)) score += 80;
  }
  if (asksFactory && !/factory/.test(normalizedTitle) && !/factory/.test(normalizedPath)) score -= 220;
  if (asksDrone && !/dron|drone|dronex/.test(normalizedTitle) && !/dron|drone|dronex/.test(normalizedPath)) score -= 120;
  if (/factory dronex/.test(normalizedTitle) || /factory dronex/.test(normalizedPath)) score += 80;
  if (/(land|tierra|parcela)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("land")) score += 140;
  if (/(advisor|asesor)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("advisor")) score += 140;
  if (/(orb|orbe)/i.test(rawQuestion) && doc.category === "Maestros del Juego" && titleTokens.includes("orb")) score += 140;
  if (/maestr|master|land|tierra|parcela|advisor|asesor|orb|orbe/i.test(rawQuestion) && doc.category === "Maestros del Juego") score += 18;

  return score;
}

async function searchKnowledge(question) {
  const docs = await loadDocs();
  const terms = expandQueryTerms(question);

  if (!terms.length) {
    return { terms, results: [] };
  }

  const results = docs
    .map((doc) => ({ doc, score: scoreDoc(doc, terms, question) }))
    .filter((item) => item.score >= 10)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(({ doc, score }) => ({
      title: doc.title,
      category: doc.category,
      path: doc.relativePath,
      excerpt: bestExcerpt(doc, terms, question),
      score
    }));

  return { terms, results };
}

function buildFocusedFallbackAnswer(question, results) {
  const normalizedQuestion = question
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  const top = results[0];
  const second = results[1];
  const isEntityQuestion = /\bque es\b|\ben que consiste\b|\bque hace\b/.test(normalizedQuestion);
  const dominantResult = !second || top.score >= second.score + 80;
  const questionTerms = new Set(tokenize(question));

  const definitionCandidate = isEntityQuestion
    ? results
      .slice(0, 3)
      .map((item) => {
        const normalizedExcerpt = item.excerpt
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const normalizedTitle = item.title
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        const excerptTokens = new Set(tokenize(item.excerpt));
        let score = item.score;

        if (/\bes\b|\bson\b|\bconsiste\b|\bpermite\b|\bproduce\b/.test(normalizedExcerpt)) score += 120;
        if (/^factory/.test(normalizedExcerpt)) score += 160;
        if (normalizedExcerpt.includes("factory.dronex es") || normalizedExcerpt.includes("factory dronex es")) score += 220;
        if (normalizedTitle.includes("factory") && normalizedTitle.includes("dron")) score += 80;
        if (questionTerms.has("factory") && !excerptTokens.has("factorydronex") && !excerptTokens.has("factorydrone")) score -= 120;
        if ((questionTerms.has("dron") || questionTerms.has("drone")) && !excerptTokens.has("dron") && !excerptTokens.has("drone") && !excerptTokens.has("dronex")) score -= 120;

        return { item, score };
      })
      .sort((a, b) => b.score - a.score)[0]?.item
    : null;

  if (isEntityQuestion && dominantResult) {
    return `Según la base de conocimiento, ${top.excerpt}`;
  }

  if (definitionCandidate) {
    return `Según la base de conocimiento, ${definitionCandidate.excerpt}`;
  }

  return null;
}

async function answerQuestionFallback(question) {
  const { terms, results } = await searchKnowledge(question);

  if (!terms.length) return emptyQuestionResponse();

  if (!results.length) {
    return {
      answer: "No encontré una coincidencia clara en la base de conocimiento. Prueba con términos más específicos.",
      sources: []
    };
  }

  const focusedAnswer = buildFocusedFallbackAnswer(question, results);
  if (focusedAnswer) {
    const focusedSources = [results[0]];
    const definitionSource = results.find((item) => focusedAnswer.includes(item.excerpt));
    if (definitionSource && definitionSource.path !== results[0].path) focusedSources.unshift(definitionSource);

    return {
      answer: focusedAnswer,
      sources: focusedSources.map(({ score, ...source }) => source)
    };
  }

  return {
    answer: [
      "Según la base de conocimiento, esto es lo más relevante:",
      ...results.slice(0, 3).map((item) => `- ${item.excerpt}`)
    ].join("\n"),
    sources: results.map(({ score, ...source }) => source)
  };
}

module.exports = {
  answerQuestionFallback,
  emptyQuestionResponse,
  loadDocs,
  searchKnowledge
};
