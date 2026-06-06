const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = Number(process.env.PORT || 4317);
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, "public");
const DATA_DIR = path.join(ROOT, "data");
const CSV_PATH = path.join(DATA_DIR, "team.csv");
const JSON_PATH = path.join(DATA_DIR, "team.json");
const PROFILE_DIR = path.join(DATA_DIR, "browser-profile");

let browserPromise = null;
let extractStatus = {
  running: false,
  message: "Listo",
  count: 0,
  updatedAt: null,
  error: null
};

function sendJson(res, data, status = 200) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body)
  });
  res.end(body);
}

function sendText(res, text, status = 200, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        value += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        value += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(value);
      value = "";
    } else if (char === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows
    .slice(1)
    .map(([name, uid, wallet]) => ({ name, uid, wallet }))
    .filter((record) => record.name && record.uid && record.wallet);
}

function csvEscape(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function recordsToCsv(records) {
  return [
    "Nombre Usuario,UID,Dirección de Cartera",
    ...records.map((record) => [record.name, record.uid, record.wallet].map(csvEscape).join(","))
  ].join("\r\n") + "\r\n";
}

function loadRecords() {
  if (fs.existsSync(JSON_PATH)) {
    return JSON.parse(fs.readFileSync(JSON_PATH, "utf8"));
  }

  if (fs.existsSync(CSV_PATH)) {
    return parseCsv(fs.readFileSync(CSV_PATH, "utf8"));
  }

  return [];
}

function saveRecords(records) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(JSON_PATH, JSON.stringify(records, null, 2), "utf8");
  fs.writeFileSync(CSV_PATH, recordsToCsv(records), "utf8");
}

function normalizeWallet(value) {
  const match = String(value || "").match(/0x[a-fA-F0-9]{40}/);
  return (match ? match[0] : String(value || "").trim()).toLowerCase();
}

function findChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA || "", "Google\\Chrome\\Application\\chrome.exe"),
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function requirePlaywright() {
  try {
    return require("playwright");
  } catch (error) {
    const Module = require("module");
    const bundledNodeModules = path.join(
      process.env.USERPROFILE || "",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "node_modules"
    );
    const bundledPnpmModules = path.join(bundledNodeModules, ".pnpm", "node_modules");
    process.env.NODE_PATH = [process.env.NODE_PATH, bundledPnpmModules, bundledNodeModules]
      .filter(Boolean)
      .join(path.delimiter);
    Module._initPaths();

    const bundled = path.join(
      process.env.USERPROFILE || "",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "node_modules",
      "playwright"
    );
    if (fs.existsSync(bundled)) {
      return require(bundled);
    }
    throw error;
  }
}

async function getBrowserContext() {
  if (!browserPromise) {
    const { chromium } = requirePlaywright();
    const executablePath = findChromeExecutable();
    const options = {
      headless: false,
      viewport: { width: 1500, height: 1000 }
    };

    if (executablePath) {
      options.executablePath = executablePath;
    }

    browserPromise = chromium.launchPersistentContext(PROFILE_DIR, options);
  }

  return browserPromise;
}

function cleanUrl(href) {
  try {
    return new URL(href, "https://olympia-lab.com").href.replace(/#.*$/, "");
  } catch {
    return "";
  }
}

async function openOlympia() {
  const context = await getBrowserContext();
  const page = context.pages()[0] || await context.newPage();
  await page.goto("https://olympia-lab.com/es/my-team/", {
    waitUntil: "domcontentloaded",
    timeout: 60000
  });
  return page;
}

async function extractTeam() {
  if (extractStatus.running) return;

  extractStatus = {
    running: true,
    message: "Abriendo Olympia",
    count: 0,
    updatedAt: null,
    error: null
  };

  try {
    const page = await openOlympia();
    await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});

    const needsLogin = await page.getByRole("textbox", { name: /nombre de usuario/i }).count();
    if (needsLogin) {
      extractStatus.message = "Iniciá sesión en la ventana de Olympia y luego apretá Sincronizar otra vez";
      extractStatus.running = false;
      return;
    }

    const visited = new Set();
    const queue = [
      { url: "https://olympia-lab.com/es/my-team/" },
      { url: "https://olympia-lab.com/es/my-team/2/" },
      { url: "https://olympia-lab.com/es/my-team/3/" }
    ];
    const byUid = new Map();

    while (queue.length) {
      const item = queue.shift();
      const url = cleanUrl(item.url);
      if (!url || visited.has(url)) continue;

      visited.add(url);
      extractStatus.message = `Leyendo ${visited.size} páginas`;

      await page.goto(url, { waitUntil: "networkidle", timeout: 60000 }).catch(async () => {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      });
      await page.waitForSelector(".myTeam__row", { timeout: 20000 }).catch(() => {});

      const extracted = await page.evaluate(() => {
        const tidy = (value) => (value || "").replace(/\s+/g, " ").trim();
        return Array.from(document.querySelectorAll(".myTeam__row"))
          .filter((row) => row.querySelector(".myTeam__rowWrapper"))
          .map((row) => {
            const name = tidy(row.querySelector(".myTeam__col-user .myTeam__name, .myTeam__name")?.textContent);
            const uid = tidy(row.querySelector(".myTeam__toggleCol-uid .toggleCol__val, .myTeam__uid")?.textContent);
            const wallet = tidy(
              row.querySelector(".toggleCol__val-address input")?.value ||
              row.querySelector(".toggleCol__val-address .toggleCol__val-ellipsis")?.textContent
            );
            const invited = row.querySelector(".myTeam__bttn");
            const invitedText = tidy(invited?.textContent);
            const match = invitedText.match(/Invitados\s*\(\s*(\d+)\s*\)/i);
            const invitedCount = match ? Number(match[1]) : 0;
            const invitedHref = invited && !invited.classList.contains("myTeam__bttn-disabled") ? invited.href : "";

            return { name, uid, wallet, invitedCount, invitedHref };
          })
          .filter((record) => record.name && record.uid && record.wallet);
      });

      for (const record of extracted) {
        if (!byUid.has(record.uid)) {
          byUid.set(record.uid, {
            name: record.name,
            uid: record.uid,
            wallet: record.wallet
          });
        }

        if (record.invitedHref && record.invitedCount > 0) {
          queue.push({ url: record.invitedHref });
        }
      }

      const pagination = await page.evaluate(() => {
        return Array.from(document.querySelectorAll("nav.pagination a.pagination__link[href]"))
          .map((link) => link.href);
      });

      for (const href of pagination) {
        const normalized = cleanUrl(href);
        if (/\/es\/my-team\/(detail\/\d+\/)?\d+\/?$/.test(normalized) && !visited.has(normalized)) {
          queue.push({ url: normalized });
        }
      }
    }

    const records = Array.from(byUid.values()).sort((a, b) => a.name.localeCompare(b.name, "es"));
    saveRecords(records);
    extractStatus = {
      running: false,
      message: "Sincronización completa",
      count: records.length,
      updatedAt: new Date().toISOString(),
      error: null
    };
  } catch (error) {
    extractStatus = {
      running: false,
      message: "Error",
      count: 0,
      updatedAt: null,
      error: error.message
    };
  }
}

function serveStatic(req, res, pathname) {
  const relative = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.join(PUBLIC_DIR, relative);

  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) {
    sendText(res, "No encontrado", 404);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const types = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8"
  };

  sendText(res, fs.readFileSync(filePath), 200, types[ext] || "application/octet-stream");
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/records") {
    sendJson(res, {
      records: loadRecords(),
      updatedAt: fs.existsSync(JSON_PATH) ? fs.statSync(JSON_PATH).mtime.toISOString() : null
    });
    return;
  }

  if (url.pathname === "/api/search") {
    const wallet = normalizeWallet(url.searchParams.get("wallet"));
    const records = loadRecords();
    const match = records.find((record) => normalizeWallet(record.wallet) === wallet);
    sendJson(res, { match: match || null });
    return;
  }

  if (url.pathname === "/api/open-olympia") {
    try {
      await openOlympia();
      sendJson(res, { ok: true, message: "Olympia abierto" });
    } catch (error) {
      sendJson(res, { ok: false, error: error.message }, 500);
    }
    return;
  }

  if (url.pathname === "/api/extract") {
    extractTeam();
    sendJson(res, { ok: true, status: extractStatus });
    return;
  }

  if (url.pathname === "/api/status") {
    sendJson(res, extractStatus);
    return;
  }

  if (url.pathname === "/download/team.csv") {
    if (!fs.existsSync(CSV_PATH)) {
      sendText(res, "No hay CSV generado", 404);
      return;
    }

    const body = fs.readFileSync(CSV_PATH);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"olympia-mi-equipo.csv\"",
      "Content-Length": body.length
    });
    res.end(body);
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`Olympia Wallet Tool: http://localhost:${PORT}/`);
});

process.on("SIGINT", async () => {
  if (browserPromise) {
    const context = await browserPromise.catch(() => null);
    if (context) await context.close().catch(() => {});
  }
  process.exit(0);
});
