const form = document.querySelector("#ask-form");
const question = document.querySelector("#question");
const statusEl = document.querySelector("#answer-status");
const bodyEl = document.querySelector("#answer-body");
const sourcesEl = document.querySelector("#sources");
const statsEl = document.querySelector("#stats");

function renderSources(sources) {
  sourcesEl.innerHTML = "";

  for (const source of sources) {
    const item = document.createElement("article");
    item.className = "source";

    const title = document.createElement("strong");
    title.textContent = source.title;

    const meta = document.createElement("span");
    meta.textContent = `${source.category} · ${source.path}`;

    item.append(title, meta);

    if (source.excerpt) {
      const excerpt = document.createElement("p");
      excerpt.textContent = source.excerpt;
      item.append(excerpt);
    }

    sourcesEl.append(item);
  }
}

async function loadStats() {
  try {
    const response = await fetch("/api/stats");
    const stats = await response.json();
    const categories = Object.entries(stats.byCategory)
      .map(([name, count]) => `${name}: ${count}`)
      .join(" · ");
    statsEl.textContent = `${stats.total} documentos indexados · ${categories}`;
  } catch {
    statsEl.textContent = "Base documental disponible. Las estadísticas se actualizarán cuando el servidor responda.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = question.value.trim();

  statusEl.textContent = "Consultando la base documental de MetaAcademy...";
  bodyEl.textContent = "";
  sourcesEl.innerHTML = "";

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value })
    });

    const data = await response.json();
    if (data.mode === "ai") {
      statusEl.textContent = "Respuesta generada con IA a partir de la base documental de MetaAcademy.";
    } else if (data.mode === "fallback") {
      statusEl.textContent = "Respuesta generada con el modo documental de respaldo.";
    } else if (data.sources?.length) {
      statusEl.textContent = "Respuesta generada desde la base documental de MetaAcademy.";
    } else {
      statusEl.textContent = "No encontré coincidencias fuertes en la base documental.";
    }
    bodyEl.textContent = data.answer;
    renderSources(data.sources || []);
  } catch {
    statusEl.textContent = "No pude consultar la base documental en este momento.";
    bodyEl.textContent = "Revisa la conexión o intenta nuevamente en unos segundos.";
  }
});

loadStats();
