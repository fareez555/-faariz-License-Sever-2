// index.js
const express = require("express");
const cors = require("cors");
const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ---- CONFIG ----
// இந்த SCRIPT_ID Userscript-ல இருக்கும் SCRIPT_ID உடன் ஒரே மாதிரியாக இருக்க வேண்டும்.
const SCRIPT_ID = "FKBP-PRO-1.0";

// உங்கள் keys இங்கே. (தேவைப்பட்டால் மேலும் சேர்க்கலாம்)
const KEYS = {
  // Lifetime (owner) – உங்களுக்கான master key
  "FAARIZ-LIFE-OWNER-0001": {
    scriptId: SCRIPT_ID,
    issuedAt: "2025-08-21T00:00:00Z",
    durationDays: 36500,               // ~100 years
    owner: "faariz-owner"
  },

  // 30 days demo key – customerக்கு sample
  "FAARIZ-DEMO-1111-2222": {
    scriptId: SCRIPT_ID,
    issuedAt: "2025-08-21T00:00:00Z",
    durationDays: 30,
    owner: "demo-user"
  }
};
// ---- /CONFIG ----

// helpers
const DAY_MS = 24 * 60 * 60 * 1000;

function checkKey(key, scriptId) {
  if (!key || !scriptId) return { ok: false, reason: "MISSING" };
  const rec = KEYS[key];
  if (!rec) return { ok: false, reason: "INVALID" };
  if (rec.scriptId !== scriptId) return { ok: false, reason: "WRONG_SCRIPT" };

  const issued = new Date(rec.issuedAt).getTime();
  const expiry = issued + (rec.durationDays * DAY_MS);
  const now = Date.now();
  const daysLeft = Math.max(0, Math.ceil((expiry - now) / DAY_MS));
  const expired = now > expiry;

  return {
    ok: !expired,
    reason: expired ? "EXPIRED" : "OK",
    daysLeft,
    owner: rec.owner
  };
}

// routes
app.get("/", (_req, res) => {
  res.type("text/plain").send("FAARIZ License Server is running ✅");
});

app.post("/verify", (req, res) => {
  try {
    const { key, scriptId } = req.body || {};
    const result = checkKey(String(key || "").trim(), String(scriptId || "").trim());
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, reason: "SERVER_ERROR", error: String(e && e.message) });
  }
});

app.listen(PORT, () => {
  console.log(`License server listening on ${PORT}`);
});
