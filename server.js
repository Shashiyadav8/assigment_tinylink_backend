require("dotenv").config();
const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

// Initialize app FIRST
const app = express();

// ---------- Middlewares ----------
app.use(cors({
  origin: ["http://localhost:3000"],
  methods: ["GET", "POST", "DELETE"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());
app.use(morgan("tiny"));

// ---------- Routes ----------
app.use("/api/links", require("./routes/links"));

// HEALTH CHECK — must be AFTER CORS middleware
app.get("/healthz", (req, res) => {
  res.json({
    status: "ok",
    db: process.env.DATABASE_URL ? "connected" : "missing"
  });
});

// ---------- Redirect short code ----------
const db = require("./db");

app.get("/:code", async (req, res) => {
  try {
    const code = req.params.code;
    const link = await db.getLinkByCode(code);

    if (!link) return res.status(404).send("Not found");

    await db.incrementClick(code);
    return res.redirect(302, link.target);
  
  } catch (err) {
    console.error("Redirect error:", err);
    res.status(500).send("Internal server error");
  }
});

// ---------- Start Server ----------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
