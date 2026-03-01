// tools/smoke.js
// Usage:
//   WEB_SERVICE_URL=https://... node tools/smoke.js
//   node tools/smoke.js https://...

import assert from "node:assert/strict";

const RETRY_ATTEMPTS = Number(process.env.RETRY_ATTEMPTS ?? 3);

// This script historically calls whatever base URL you provide.
// Despite the name WEB_SERVICE_URL, it can point at either the Web service or the API service.
const WEB_URL = (process.env.WEB_SERVICE_URL ?? process.argv[2] ?? "").replace(/\/$/, "");

if (!WEB_URL) {
  console.error("Usage: WEB_SERVICE_URL=https://<url> node tools/smoke.js");
  process.exit(1);
}

// Optional API-key auth for environments that enforce it (e.g., prod API).
// If SERVICE_API_KEY is not set, behavior remains unchanged.
function buildHeaders(extra = {}) {
  const headers = { "Content-Type": "application/json", ...extra };
  const apiKey = process.env.SERVICE_API_KEY;
  if (apiKey && apiKey.trim().length > 0) {
    headers["x-api-key"] = apiKey.trim();
  }
  return headers;
}

async function fetchWithRetry(url, opts, attempts = RETRY_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
    } catch (err) {
      if (i === attempts - 1) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  // Unreachable, but keeps TypeScript/linters happy if added later.
  throw new Error("fetchWithRetry: exhausted attempts");
}

async function main() {
  console.log(`\nSmoke test: ${WEB_URL}\n`);
  let passed = 0;

  // 1) Health
  {
    const res = await fetchWithRetry(`${WEB_URL}/health`, {});
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    console.log(`✓ GET /health → ${res.status} { status: ${body.status} }`);
    passed++;
  }

  // 2) POST empty prompt should return 400 (after auth, if required)
  {
    const res = await fetchWithRetry(`${WEB_URL}/api/claude`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, `Expected 400 for empty prompt, got ${res.status}`);
    console.log(`✓ POST /api/claude (no prompt) → ${res.status}`);
    passed++;
  }

  // 3) Valid prompt should return 200
  {
    console.log(`  Calling Claude (may take a few seconds)…`);
    const res = await fetchWithRetry(`${WEB_URL}/api/claude`, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({ prompt: "smoke test passed" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const text = await res.text();
    console.log(`✓ POST /api/claude → ${res.status} ("${text.slice(0, 40)}${text.length > 40 ? "…" : ""}")`);
    passed++;
  }

  console.log(`\nAll ${passed} smoke tests passed.\n`);
}

main().catch((err) => {
  console.error(`\nSmoke test FAILED: ${err.message}\n`);
  process.exit(1);
});