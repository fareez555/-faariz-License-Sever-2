const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Allow all origins for now (you can restrict later)
app.use(cors());
app.use(express.json());

// === Basic time helpers ===
const DAY = 24 * 60 * 60 * 1000;

// === IMPORTANT: Tie keys to a specific build of your script ===
// Change this whenever you ship a new protected script build.
const SCRIPT_ID = "FKBP-PRO-1.0";

// === In-memory key store (demo). For production, move to DB or Render env. ===
// durationDays: 30 => monthly. 36500 => lifetime.
const KEYS = {
  // Monthly demo key (replace with your customer keys)
  "FAARIZ-DEMO-1111-2222": {
    scriptId: SCRIPT_ID,
    issuedAt: "2025-08-15T00:00:00Z",
    durationDays: 30,
    owner: "demo-user"
  },

  // Lifetime owner key (for you)
  "FAARIZ-LIFE-OWNER-0001": {
    scriptId: SCRIPT_ID,
    issuedAt: "2025-01-01T00:00:00Z",
    durationDays: 36500,
    owner: "owner"
  }
};

// Health
app.get('/', (req, res) => {
  res.send('FAARIZ License Server is running ✅');
});

// Verify endpoint
// Body: { key: "FAARIZ-XXXX-XXXX", scriptId: "FKBP-PRO-1.0" }
app.post('/verify', (req, res) => {
  const { key, scriptId } = req.body || {};
  if (!key || !scriptId) {
    return res.status(400).json({ ok: false, reason: "MISSING_FIELDS" });
  }

  const meta = KEYS[(key || '').trim()];
  if (!meta) {
    return res.json({ ok: false, reason: "KEY_NOT_FOUND" });
  }

  if (meta.scriptId !== scriptId) {
    return res.json({ ok: false, reason: "WRONG_SCRIPT" });
  }

  const issued = new Date(meta.issuedAt).getTime();
  if (!Number.isFinite(issued)) {
    return res.json({ ok: false, reason: "BAD_ISSUED_AT" });
  }

  const expiresAt = issued + (meta.durationDays * DAY);
  const now = Date.now();
  const expired = now > expiresAt;
  const daysLeft = Math.max(0, Math.ceil((expiresAt - now) / DAY));

  return res.json({
    ok: !expired,
    reason: expired ? "EXPIRED" : "OK",
    expiresAt,
    daysLeft,
    owner: meta.owner || null,
    scriptId: meta.scriptId
  });
});

// 404 fallback
app.use((req, res) => res.status(404).json({ ok: false, reason: "NOT_FOUND" }));

app.listen(PORT, () => {
  console.log(`License server running on port ${PORT}`);
});
