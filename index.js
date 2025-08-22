// index.js — FAARIZ License Server (Option 2 - full replace)
const express = require("express");
const app = express();
const PORT = process.env.PORT || 3000;

// Basic JSON & CORS (no extra deps)
app.use(express.json());
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ====== CONFIG: keys database (simple) ======
// ஒவ்வொரு customer-க்கும் தனி key + எந்த scriptId-க்கு valid என map செய்யலாம்.
// காலாவதி தேதியும் சேர்க்கலாம் (ISO date). தேவைக்கு ஏற்ப புதிய key-களை சேர்த்துக்கொள்ளலாம்.
const KEYS = {
  // EXAMPLE KEYS:
  "FAARIZ-DEMO-1111-2222": {
    scriptId: "FKBP-PRO-1.0",
    expiresAt: "2099-12-31T23:59:59Z",
    note: "Demo key for testing"
  },
  "FAARIZ-USER-ABCD-1234": {
    scriptId: "FKBP-PRO-1.0",
    expiresAt: "2026-01-01T00:00:00Z",
    note: "Customer A"
  }
};

// Utility
const isExpired = (iso) => {
  if (!iso) return false; // expiry not set => never expire
  return Date.now() > Date.parse(iso);
};

// Health
app.get("/", (_req, res) => {
  res.type("text").send("FAARIZ License Server is running ✅");
});

// Verify endpoint
// Body: { key: "FAARIZ-XXXX-XXXX", scriptId: "FKBP-PRO-1.0" }
app.post("/verify", (req, res) => {
  const { key, scriptId } = req.body || {};
  if (!key || !scriptId) {
    return res.status(400).json({ ok: false, reason: "missing_fields" });
  }

  const rec = KEYS[String(key).trim()];
  if (!rec) {
    return res.json({ ok: false, reason: "invalid_key" });
  }

  if (rec.scriptId !== scriptId) {
    return res.json({ ok: false, reason: "script_mismatch" });
  }

  if (isExpired(rec.expiresAt)) {
    return res.json({ ok: false, reason: "expired" });
  }

  // success
  const msLeft = rec.expiresAt ? Date.parse(rec.expiresAt) - Date.now() : null;
  const daysLeft = msLeft != null ? Math.max(0, Math.ceil(msLeft / 86400000)) : null;
  res.json({
    ok: true,
    scriptId: rec.scriptId,
    expiresAt: rec.expiresAt || null,
    daysLeft
  });
});

app.listen(PORT, () => {
  console.log(`FAARIZ License Server on ${PORT}`);
});
