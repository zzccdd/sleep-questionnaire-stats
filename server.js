const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const rootDir = __dirname;
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(rootDir, "data");
const dataFile = path.join(dataDir, "reports.json");
const port = Number(process.env.PORT || 8080);
const host = process.env.HOST || "127.0.0.1";
const adminPin = process.env.ADMIN_PIN || "";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

ensureDataFile();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === "/api/reports" && req.method === "GET") {
      if (!requireAdmin(req, res)) return;
      return sendJson(res, readReports());
    }
    if (url.pathname === "/api/reports" && req.method === "POST") {
      const payload = await readJsonBody(req);
      const reports = readReports();
      const report = {
        ...payload,
        id: payload.id || crypto.randomUUID(),
        createdAt: payload.createdAt || new Date().toISOString(),
      };
      reports.push(report);
      writeReports(reports);
      return sendJson(res, adminPin ? { ok: true, id: report.id } : reports);
    }
    if (url.pathname === "/api/reports" && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      writeReports([]);
      return sendJson(res, []);
    }
    if (url.pathname.startsWith("/api/reports/") && req.method === "DELETE") {
      if (!requireAdmin(req, res)) return;
      const id = decodeURIComponent(url.pathname.replace("/api/reports/", ""));
      const reports = readReports().filter((report) => report.id !== id);
      writeReports(reports);
      return sendJson(res, reports);
    }
    return serveStatic(url.pathname, res);
  } catch (error) {
    sendJson(res, { error: error.message || "Server error" }, 500);
  }
});

server.listen(port, host, () => {
  console.log(`Sleep questionnaire site running at http://${host}:${port}`);
});

function ensureDataFile() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "[]\n", "utf8");
}

function readReports() {
  ensureDataFile();
  return JSON.parse(fs.readFileSync(dataFile, "utf8") || "[]");
}

function writeReports(reports) {
  ensureDataFile();
  fs.writeFileSync(dataFile, `${JSON.stringify(reports, null, 2)}\n`, "utf8");
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function serveStatic(urlPath, res) {
  const safePath = path
    .normalize(decodeURIComponent(urlPath === "/" ? "/index.html" : urlPath))
    .replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(rootDir, safePath);
  if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  const ext = path.extname(filePath);
  res.writeHead(200, {
    "Content-Type": mimeTypes[ext] || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  fs.createReadStream(filePath).pipe(res);
}

function sendJson(res, data, status = 200) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function requireAdmin(req, res) {
  if (!adminPin) return true;
  if (req.headers["x-admin-pin"] === adminPin) return true;
  sendJson(res, { error: "Admin PIN required" }, 401);
  return false;
}
