const express = require("express");
const cors = require("cors");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(rateLimit({ windowMs: 60_000, max: 90 }));

app.get("/", (req, res) => {
  res.json({ ok: true, name: "FAARIZ KING BOT PRO License Server" });
});

app.listen(PORT, () => console.log("License server on " + PORT));
