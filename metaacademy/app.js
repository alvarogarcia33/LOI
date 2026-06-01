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
    statsEl.textContent = "Base lista, pero no pude leer las estadísticas.";
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = question.value.trim();

  statusEl.textContent = "Consultando conocimiento...";
  bodyEl.textContent = "";
  sourcesEl.innerHTML = "";

  try {
    const response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: value })
    });

    const data = await response.json();
    statusEl.textContent = data.sources?.length ? "Respuesta generada desde la base local." : "Sin coincidencias fuertes.";
    bodyEl.textContent = data.answer;
    renderSources(data.sources || []);
  } catch {
    statusEl.textContent = "No pude consultar la base.";
    bodyEl.textContent = "Revisa que el servidor local de MetaAcademy siga activo.";
  }
});

loadStats();
