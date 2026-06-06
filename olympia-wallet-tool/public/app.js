const state = {
  records: []
};

const meta = document.querySelector("#meta");
const statusBox = document.querySelector("#status");
const openOlympia = document.querySelector("#openOlympia");
const sync = document.querySelector("#sync");
const searchForm = document.querySelector("#searchForm");
const wallet = document.querySelector("#wallet");
const result = document.querySelector("#result");

function normalizeWallet(value) {
  const match = String(value || "").match(/0x[a-fA-F0-9]{40}/);
  return (match ? match[0] : String(value || "").trim()).toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDate(value) {
  if (!value) return "sin sincronización";
  return new Date(value).toLocaleString("es-UY", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

async function api(path, options) {
  const response = await fetch(path, options);
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Error del sistema");
  }
  return data;
}

async function loadRecords() {
  const data = await api("/api/records");
  state.records = data.records || [];
  meta.textContent = `${state.records.length} wallets cargadas · ${formatDate(data.updatedAt)}`;
}

function renderMatch(record) {
  result.innerHTML = `
    <div class="badge">Encontrado</div>
    <div class="person">
      <div class="field">
        <span>Nombre Usuario</span>
        <strong>${escapeHtml(record.name)}</strong>
      </div>
      <div class="field">
        <span>UID</span>
        <strong>${escapeHtml(record.uid)}</strong>
      </div>
      <div class="field wide">
        <span>Dirección de Cartera</span>
        <strong>${escapeHtml(record.wallet)}</strong>
      </div>
    </div>
  `;
}

function renderMiss() {
  result.innerHTML = `
    <div class="badge bad">Sin coincidencia</div>
    <div class="empty">No aparece en la base local actual.</div>
  `;
}

function search() {
  const normalized = normalizeWallet(wallet.value);

  if (!normalized) {
    result.innerHTML = '<div class="empty">Pegá una dirección de cartera.</div>';
    return;
  }

  const match = state.records.find((record) => normalizeWallet(record.wallet) === normalized);
  if (match) renderMatch(match);
  else renderMiss();
}

async function pollStatus() {
  const data = await api("/api/status");
  statusBox.textContent = data.error ? `${data.message}: ${data.error}` : data.message;
  sync.disabled = data.running;

  if (data.running) {
    window.setTimeout(pollStatus, 1200);
  } else {
    await loadRecords();
  }
}

openOlympia.addEventListener("click", async () => {
  openOlympia.disabled = true;
  statusBox.textContent = "Abriendo Olympia...";
  try {
    const data = await api("/api/open-olympia");
    statusBox.textContent = data.message;
  } catch (error) {
    statusBox.textContent = error.message;
  } finally {
    openOlympia.disabled = false;
  }
});

sync.addEventListener("click", async () => {
  sync.disabled = true;
  statusBox.textContent = "Sincronizando...";
  try {
    await api("/api/extract");
    await pollStatus();
  } catch (error) {
    statusBox.textContent = error.message;
    sync.disabled = false;
  }
});

searchForm.addEventListener("submit", (event) => {
  event.preventDefault();
  search();
});

wallet.addEventListener("input", () => {
  if (wallet.value.includes("0x") && wallet.value.length >= 42) {
    search();
  }
});

loadRecords().catch((error) => {
  meta.textContent = error.message;
});
