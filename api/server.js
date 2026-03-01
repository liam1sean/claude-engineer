// server.js
// HTTP entry point (ES Module) with config + logging + centralized errors + basic security

// Load environment variables BEFORE other modules evaluate (ESM-safe)
// Force .env to override any Windows/User/Machine ANTHROPIC_API_KEY
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load api/.env explicitly (avoids wrong working directory issues)
dotenv.config({
  path: path.resolve(__dirname, ".env"),
  override: true,
});

// Safe key fingerprint (no full key)
const _k = process.env.ANTHROPIC_API_KEY || "";
console.log(
  "[anthropic] key fingerprint:",
  _k.slice(0, 8),
  "...",
  _k.slice(-6),
  "len=",
  _k.length
);

import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { sendPromptToClaude } from "./src/claudeService.js";
import { config } from "./config/config.js";

// ── Startup validation ─────────────────────────────────────────────────────────

/**
 * Validate ANTHROPIC_API_KEY format without logging the actual key.
 * Anthropic keys start with "sk-ant-" prefix.
 */
function validateAnthropicKey(key) {
  if (!key) return { valid: false, reason: "ANTHROPIC_API_KEY is not set" };
  if (typeof key !== "string")
    return { valid: false, reason: "ANTHROPIC_API_KEY must be a string" };
  if (!key.startsWith("sk-ant-"))
    return { valid: false, reason: "ANTHROPIC_API_KEY must start with 'sk-ant-'" };
  if (key.length < 20)
    return { valid: false, reason: "ANTHROPIC_API_KEY appears too short" };
  return { valid: true };
}

// Fail fast before binding any port
const keyValidation = validateAnthropicKey(process.env.ANTHROPIC_API_KEY);
if (!keyValidation.valid) {
  console.error(`FATAL: ${keyValidation.reason}`);
  console.error("Add a valid ANTHROPIC_API_KEY to api/.env and restart.");
  console.error("Get your key at: https://console.anthropic.com/settings/keys");
  process.exit(1);
}

// Log key presence without exposing it
const key = process.env.ANTHROPIC_API_KEY;
const keyPreview = key.slice(0, 10) + "..." + key.slice(-4);
console.log(`ANTHROPIC_API_KEY loaded: ${keyPreview}`);

if (!process.env.SERVICE_API_KEY) {
  // In production the API service is protected by Cloud Run IAM (--no-allow-unauthenticated).
  // SERVICE_API_KEY is only required for local development.
  console.warn("WARN: SERVICE_API_KEY not set — x-api-key auth disabled. Relying on Cloud Run IAM.");
}

// ── Express app setup ──────────────────────────────────────────────────────────

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
  // If SERVICE_API_KEY is not configured, auth is handled by Cloud Run IAM — skip app-level check.
  if (!expected) return next();

  const provided = req.headers["x-api-key"];
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// ── Routes ─────────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.status(200).json({
    service: "claude-engineer-api",
    ok: true,
    routes: {
      health: "GET /health",
      claude: 'POST /api/claude  { "prompt": "..." }',
    },
  });
});

app.get("/health", (_req, res) => {
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
app.use((err, req, res, _next) => {
  const status = Number(err?.status) || 500;
  const message = err?.message || "Internal Server Error";

  if (status >= 500) {
    console.error(`[ERROR] ${req.method} ${req.originalUrl}: ${message}`);
  }

  res.status(status).json({
    error: status >= 500 ? "Internal Server Error" : "Bad Request",
    message,
  });
});

// ── Start server ───────────────────────────────────────────────────────────────

app.listen(config.server.port, () => {
  console.log(`Server running on http://localhost:${config.server.port}`);
  console.log(`Health check: http://localhost:${config.server.port}/health`);
});