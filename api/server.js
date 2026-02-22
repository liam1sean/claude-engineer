// server.js
// HTTP entry point (ES Module) with config + logging + centralized errors + basic security

import dotenv from "dotenv";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { sendPromptToClaude } from "./src/claudeService.js";
import { config } from "./config/config.js";

dotenv.config();

// Startup guard — fail fast before binding any port
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("FATAL: ANTHROPIC_API_KEY is not set. Add it to .env and restart.");
  process.exit(1);
}
if (!process.env.SERVICE_API_KEY) {
  // In production the API service is protected by Cloud Run IAM (--no-allow-unauthenticated).
  // SERVICE_API_KEY is only required for local development.
  console.warn("WARN: SERVICE_API_KEY not set — x-api-key auth disabled. Relying on Cloud Run IAM.");
}

const app = express();

// Basic hardening
app.disable("x-powered-by");
app.use(helmet());

// Rate limit (simple baseline)
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: 30, // 30 requests per minute per IP
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
app.use(limiter);

app.use(express.json({ limit: "1mb" }));

// Request logger
app.use((req, res, next) => {
  const start = Date.now();

  res.on("finish", () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });

  next();
});

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function requireApiKey(req, res, next) {
  const expected = process.env.SERVICE_API_KEY;
  // If SERVICE_API_KEY is not configured, auth is handled by Cloud Run IAM at the
  // infrastructure layer — skip application-level check.
  if (!expected) return next();
  const key = req.headers["x-api-key"];
  if (!key || key !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Routes
app.get("/", (req, res) => {
  res.status(200).json({
    service: "claude-engineer-api",
    ok: true,
    routes: {
      health: "GET /health",
      claude: 'POST /api/claude  { "prompt": "..." }',
    },
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

app.post(
  "/api/claude",
  requireApiKey,
  asyncHandler(async (req, res) => {
    const { prompt } = req.body || {};

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      const err = new Error('Body must include: { "prompt": "..." }');
      err.status = 400;
      throw err;
    }

    const text = await sendPromptToClaude(prompt);
    res.status(200).json({ text });
  })
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: `Route ${req.method} ${req.path} not found`,
  });
});

// Central error handler
app.use((err, req, res, next) => {
  const status = Number(err?.status) || 500;
  const message = err?.message || "Internal Server Error";

  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : "Bad Request",
    message,
  });
});

app.listen(config.server.port, () => {
  console.log(`Server running on http://localhost:${config.server.port}`);
  console.log(`Health check: http://localhost:${config.server.port}/health`);
});