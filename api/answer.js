const {
  answerQuestionFallback,
  emptyQuestionResponse,
  searchKnowledge
} = require("./knowledge");

const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_MODEL = sanitizeEnvValue(process.env.OPENAI_MODEL) || "gpt-4.1-mini";

function sanitizeEnvValue(value) {
  if (!value) return "";

  return String(value)
    .split(/\r?\n/)
    .map((part) => part.trim())
    .filter((part) => part && part.toLowerCase() !== "yes" && part.toLowerCase() !== "y")
    .at(-1) || "";
}

function buildKnowledgePrompt(question, sources) {
  const formattedSources = sources
    .slice(0, 4)
    .map((source, index) => [
      `[${index + 1}] ${source.title}`,
      `Categoria: ${source.category}`,
      `Ruta: ${source.path}`,
      `Fragmento: ${source.excerpt}`
    ].join("\n"))
    .join("\n\n");

  return [
    "Responde en español de forma natural, clara y útil.",
    "Usa solo la información de las fuentes proporcionadas.",
    "Si las fuentes no alcanzan para responder con seguridad, dilo con honestidad.",
    "No inventes hechos, fechas, reglas ni beneficios no mencionados en las fuentes.",
    "No des instrucciones para realizar transacciones, staking, farming o movimientos de fondos como si ya fueran confirmados.",
    "Si aplica, termina con una breve sección 'Fuentes:' usando [1], [2], etc.",
    "",
    `Pregunta del usuario: ${question}`,
    "",
    "Fuentes recuperadas:",
    formattedSources
  ].join("\n");
}

async function generateWithOpenAI(question, sources) {
  const apiKey = sanitizeEnvValue(process.env.OPENAI_API_KEY);
  if (!apiKey) return null;

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: buildKnowledgePrompt(question, sources),
      max_output_tokens: 700
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI API ${response.status}: ${detail}`);
  }

  const data = await response.json();
  const answer = extractResponseText(data);
  return answer || null;
}

function extractResponseText(data) {
  if (typeof data?.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }

  if (!Array.isArray(data?.output)) return "";

  return data.output
    .flatMap((item) => Array.isArray(item?.content) ? item.content : [])
    .filter((content) => content?.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

async function answerQuestion(question) {
  const normalizedQuestion = String(question || "").trim();
  if (!normalizedQuestion) {
    return { ...emptyQuestionResponse(), mode: "empty" };
  }

  const { terms, results } = await searchKnowledge(normalizedQuestion);
  if (!terms.length) {
    return { ...emptyQuestionResponse(), mode: "empty" };
  }

  if (!results.length) {
    return {
      answer: "No encontré una coincidencia clara en la base de conocimiento. Prueba con términos más específicos.",
      sources: [],
      mode: "no_match"
    };
  }

  try {
    const aiAnswer = await generateWithOpenAI(normalizedQuestion, results);
    if (aiAnswer) {
      return {
        answer: aiAnswer,
        sources: results,
        mode: "ai"
      };
    }
  } catch (error) {
    console.error("OpenAI answer fallback:", error.message);
  }

  const fallback = await answerQuestionFallback(normalizedQuestion);
  return {
    ...fallback,
    mode: "fallback"
  };
}

module.exports = { answerQuestion };
