// services/web/server.js
// Web frontend service — serves UI and proxies prompts to the API service.
// Production auth: Cloud Run IAM identity token (no shared secrets).
// Local dev auth: x-api-key header via API_SERVICE_KEY env var (optional).

import dotenv from "dotenv";
import express from "express";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const API_URL = process.env.API_CLAUDE_URL;
if (!API_URL) {
  console.error("FATAL: API_CLAUDE_URL is not set. Set it in .env and restart.");
  process.exit(1);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT ?? 8080;

app.use(express.json());
app.use(express.static(join(__dirname, "public")));

// Request logger (matches API service style)
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - start}ms)`);
  });
  next();
});

/**
 * Fetch a GCP OIDC identity token scoped to `audience` from the metadata server.
 * Only available when running on Cloud Run / GCE. Not called for localhost targets.
 */
async function fetchIdentityToken(audience) {
  const url =
    `http://metadata.google.internal/computeMetadata/v1/instance/` +
    `service-accounts/default/identity?audience=${encodeURIComponent(audience)}`;

  const res = await fetch(url, {
    headers: { "Metadata-Flavor": "Google" },
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`Metadata server returned ${res.status}`);
  return res.text();
}

function isLocalTarget(url) {
  return url.startsWith("http://localhost") || url.startsWith("http://127.");
}

// POST /api/ask — accepts { prompt } and returns { text }
app.post("/api/ask", async (req, res) => {
  const { prompt } = req.body ?? {};
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "prompt required" });
  }

  try {
    const headers = { "Content-Type": "application/json" };

    if (isLocalTarget(API_URL)) {
      // Local dev: forward x-api-key if the API service requires it
      if (process.env.API_SERVICE_KEY) {
        headers["x-api-key"] = process.env.API_SERVICE_KEY;
      }
    } else {
      // Production: Cloud Run IAM identity token
      // Cloud Run validates this before the request reaches the API service code.
      const token = await fetchIdentityToken(API_URL);
      headers["Authorization"] = `Bearer ${token}`;
    }

    const upstream = await fetch(`${API_URL}/api/claude`, {
      method: "POST",
      headers,
      body: JSON.stringify({ prompt }),
      signal: AbortSignal.timeout(30000),
    });

    const body = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: body.message ?? "upstream error" });
    }
    res.json({ text: body.text });
  } catch (err) {
    console.error("ask error:", err.message);
    res.status(502).json({ error: "Failed to reach API service" });
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

export { app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  app.listen(PORT, () => {
    console.log(`Web service running on http://localhost:${PORT}`);
    console.log(`API backend: ${API_URL}`);
  });
}
