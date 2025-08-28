// index.js — FAARIZ License Server v2 (Express only)

const express = require("express");
const fs = require("fs");
const path = require("path");

// ------------------- App & JSON -------------------
const app = express();
app.use(express.json({ limit: "64kb" }));

// ------------------- CORS -------------------
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, x-admin-token, x-health-token"
  );
  if (req.method === "OPTIONS") return res.status(204).end();
  next();
});

// =================== CONFIG ===================
// NOTE: Tokens-ஐ code-ல் hardcode செய்ய வேண்டாம்.
// Render → Environment-ல் அமைக்கவும்.
const ADMIN_TOKEN  = process.env.ADMIN_TOKEN  || ""; // ex: 32127eda533f08...
const HEALTH_TOKEN = process.env.HEALTH_TOKEN || ""; // ex: dd3806fe283a4a...
const PORT = process.env.PORT || 3000;

// Data file (simple JSON store)
const DATA_DIR  = process.env.DATA_DIR  || path.join(__dirname, "data");
const DATA_FILE = process.env.DATA_FILE || path.join(DATA_DIR, "licenses.json");

// =================== STORE ===================
let STORE = {};

function ensureStoreFile() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch {}
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}, null, 2));
  }
}
function loadStore() {
  ensureStoreFile();
  try {
    STORE = JSON.parse(fs.readFileSync(DATA_FILE, "utf8") || "{}");
  } catch {
    STORE = {};
  }
}
function saveStore() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(STORE, null, 2));
  } catch (e) {
    console.error("saveStore error:", e.message);
  }
}
loadStore();

// =================== UTILS ===================
const now = () => Date.now();
const dayMs = 24 * 60 * 60 * 1000;
const pick = (o, ks) => Object.fromEntries(ks.filter(k => k in o).map(k => [k, o[k]]));

function isAdmin(req) {
  const h = (req.header("x-admin-token") || "").trim();
  const q = (req.query.adm || "").trim();
  return ADMIN_TOKEN && (h === ADMIN_TOKEN || q === ADMIN_TOKEN);
}

// Root
app.get("/", (_, res) => res.type("text/plain").send("FAARIZ License Server v2 • OK"));

// =================== HEALTH ===================
// /health & /healthz — query: ?token=... or ?t=...
// or header: x-health-token: ...
function serveHealth(req, res) {
  const qToken = (req.query.token || req.query.t || "").toString();
  const hToken = (req.get("x-health-token") || "").toString();
  if (HEALTH_TOKEN && qToken !== HEALTH_TOKEN && hToken !== HEALTH_TOKEN) {
    return res.status(401).type("text/plain").send("unauthorized");
  }
  return res.type("text/plain").send("OK");
}
app.get("/health", serveHealth);
app.get("/healthz", serveHealth);

// =================== ADMIN: ISSUE ===================
/*
  POST /issue
  Headers: x-admin-token: <ADMIN_TOKEN>
  Body (JSON):
  {
    "key": "FAARIZ-KEY-1234-PRO",
    "scriptId": "FKBP-PRO-1.0",   // "*" என்றால் அனைத்து script-க்கும் செல்லுபடி
    "days": 30,
    "maxDevices": 1,
    "resetDevices": false
  }
*/
app.post("/issue", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok:false, reason:"forbidden" });

  const {
    key,
    scriptId = "FKBP-PRO-1.0",
    days = 30,
    maxDevices = 1,
    resetDevices = false
  } = req.body || {};

  if (!key || typeof key !== "string") {
    return res.status(400).json({ ok:false, reason:"bad_key" });
  }

  const expiresAt = now() + (Number(days) * dayMs);
  const md = Math.max(1, Number(maxDevices) || 1);

  let lic = STORE[key] || { key, devices: [], createdAt: now() };
  lic.scriptId   = scriptId;
  lic.expiresAt  = expiresAt;
  lic.maxDevices = md;
  lic.disabled   = false;
  lic.updatedAt  = now();
  if (resetDevices) lic.devices = [];

  STORE[key] = lic;
  saveStore();

  return res.json({
    ok: true,
    key: lic.key,
    scriptId: lic.scriptId,
    maxDevices: lic.maxDevices,
    expiresAt: lic.expiresAt
  });
});

// =================== VERIFY ===================
/*
  POST /verify
  Body: { key, scriptId, fingerprint }
*/
app.post("/verify", (req, res) => {
  const { key, scriptId, fingerprint } = req.body || {};
  if (!key) return res.status(400).json({ ok:false, reason:"invalid_key" });

  const lic = STORE[key];
  if (!lic || lic.disabled) return res.json({ ok:false, reason:"invalid_key" });

  const left = (lic.expiresAt || 0) - now();
  if (left <= 0) return res.json({ ok:false, reason:"expired" });

  const any = lic.scriptId === "*" || lic.scriptId === "any";
  if (!any && scriptId !== lic.scriptId) {
    return res.json({ ok:false, reason:"wrong_script" });
  }

  const fp = (fingerprint || "unknown-device").toString().trim();
  if (!lic.devices.includes(fp)) {
    if ((lic.devices || []).length >= (lic.maxDevices || 1)) {
      return res.json({ ok:false, reason:"device_limit" });
    }
    lic.devices.push(fp);
    lic.updatedAt = now();
    saveStore();
  }

  return res.json({
    ok: true,
    leftMs: left,
    expiresAt: lic.expiresAt,
    devices: (lic.devices || []).slice(0)
  });
});

// =================== ADMIN: REVOKE DEVICE ===================
/*
  POST /revoke-device
  Headers: x-admin-token
  Body: { key, fingerprint }
*/
app.post("/revoke-device", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok:false, reason:"forbidden" });

  const { key, fingerprint } = req.body || {};
  const lic = STORE[key];
  if (!lic) return res.json({ ok:false, reason:"invalid_key" });
  if (!fingerprint) return res.status(400).json({ ok:false, reason:"bad_fingerprint" });

  lic.devices = (lic.devices || []).filter(d => d !== fingerprint);
  lic.updatedAt = now();
  saveStore();

  res.json({ ok:true, devices: lic.devices });
});

// =================== ADMIN: TOGGLE KEY ===================
/*
  POST /toggle
  Headers: x-admin-token
  Body: { key, disabled: true|false }
*/
app.post("/toggle", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok:false, reason:"forbidden" });

  const { key, disabled = true } = req.body || {};
  const lic = STORE[key];
  if (!lic) return res.json({ ok:false, reason:"invalid_key" });

  lic.disabled = !!disabled;
  lic.updatedAt = now();
  saveStore();

  res.json({ ok:true, disabled: lic.disabled });
});

// =================== ADMIN: INFO/LIST ===================
app.get("/info", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok:false, reason:"forbidden" });
  const key = (req.query.key || "").toString();
  const lic = STORE[key];
  if (!lic) return res.json({ ok:false, reason:"invalid_key" });
  res.json({
    ok: true,
    license: pick(lic, [
      "key", "scriptId", "expiresAt", "maxDevices",
      "devices", "disabled", "createdAt", "updatedAt"
    ])
  });
});

app.get("/list", (req, res) => {
  if (!isAdmin(req)) return res.status(403).json({ ok:false, reason:"forbidden" });
  const items = Object.values(STORE).map(l =>
    pick(l, ["key", "scriptId", "expiresAt", "maxDevices", "devices", "disabled"])
  );
  res.json({ ok:true, count: items.length, items });
});

// =================== (Optional) Self ping ===================
// Render Free sleep-ஆகலாம். வெளிப் பிங்குடன் சேர்த்து விருப்பமாக உள் self-ping.
// ENV: SELF_PING_URL=https://<your-app>.onrender.com/health?token=xxxx
if (process.env.SELF_PING_URL) {
  setInterval(() => {
    try { fetch(process.env.SELF_PING_URL).catch(() => {}); } catch {}
  }, 5 * 60 * 1000);
}

// ------------------- 404 & Error -------------------
app.use((req, res) => res.status(404).json({ ok:false, reason:"not_found" }));
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ ok:false, reason:"server_error" });
});

// ------------------- Start -------------------
app.listen(PORT, () => {
  console.log(`FAARIZ License Server v2 running on port ${PORT}`);
});
