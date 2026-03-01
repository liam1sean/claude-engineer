#!/usr/bin/env node
// tools/smoke.js — post-deploy smoke test for the web service.
// Usage:
//   WEB_SERVICE_URL=https://... node tools/smoke.js
//   node tools/smoke.js https://...

import { strict as assert } from "assert";

const WEB_URL = (process.env.WEB_SERVICE_URL ?? process.argv[2] ?? "").replace(/\/$/, "");

if (!WEB_URL) {
  console.error("Usage: WEB_SERVICE_URL=https://<url> node tools/smoke.js");
  process.exit(1);
}

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 4000;

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchWithRetry(url, opts, attempts = RETRY_ATTEMPTS) {
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetch(url, { ...opts, signal: AbortSignal.timeout(15000) });
    } catch (err) {
      if (i === attempts - 1) throw err;
      console.log(`  Retry ${i + 1}/${attempts - 1} after ${RETRY_DELAY_MS}ms… (${err.message})`);
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function run() {
  console.log(`\nSmoke test: ${WEB_URL}\n`);
  let passed = 0;

  // ── Test 1: Health check ──────────────────────────────────────────────
  {
    const res = await fetchWithRetry(`${WEB_URL}/health`, {});
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.status, "ok", `Unexpected health body: ${JSON.stringify(body)}`);
    console.log("✓ GET /health → 200 { status: ok }");
    passed++;
  }

  // ── Test 2: Missing prompt returns 400 ───────────────────────────────
  {
    const res = await fetchWithRetry(`${WEB_URL}/api/claude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, `Expected 400 for empty prompt, got ${res.status}`);
    console.log("✓ POST /api/claude (no prompt) → 400");
    passed++;
  }

  // ── Test 3: Valid prompt returns a Claude response ────────────────────
  {
    console.log("  Calling Claude (may take a few seconds)…");
    const res = await fetchWithRetry(`${WEB_URL}/api/claude`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "Reply with exactly three words: smoke test passed" }),
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const body = await res.json();
    assert.ok(typeof body.text === "string" && body.text.length > 0, "Response missing text");
    console.log(`✓ POST /api/claude → 200 ("${body.text.slice(0, 80).replace(/\n/g, " ")}")`);
    passed++;
  }

  console.log(`\nAll ${passed} smoke tests passed.\n`);
}

run().catch((err) => {
  console.error(`\nSmoke test FAILED: ${err.message}\n`);
  process.exit(1);
});
