Objective:
Implement three production-safe refactors in sequence as three separate commits
with verification gates after each commit.

Repository:
claude-engineer

Primary Target:
api/server.js
Secondary file may include api/src/claudeService.js ONLY if required.

Environment:
Node 24 (ESM)
Express 5
Cloud Run deployment
Vitest + Supertest tests
Existing smoke test: tools/smoke.js

Branching Discipline:
- Create or use a feature branch (do NOT commit to main or develop).
- Produce exactly 3 commits.
- One concern per commit.
- Do not squash commits.
- Do not modify unrelated files.

Security Constraints (non-negotiable):
- Do NOT remove requireApiKey middleware.
- Do NOT weaken rate limiting.
- Do NOT remove helmet.
- Do NOT expose secret values in logs.
- Do NOT remove main-guard pattern.
- Preserve export { app }.
- Preserve /health endpoint behavior.
- Do not introduce security regressions.

--------------------------------------------------
COMMIT 1 — Runtime Key Validation Refactor
--------------------------------------------------

Change:
- Move ANTHROPIC_API_KEY validation from startup-time to request-time.
- Validation must occur inside POST /api/claude.
- If key missing/invalid:
    HTTP 503
    {
      "error": "Service Unavailable",
      "message": "Claude is not configured",
      "detail": "<validation reason>"
    }

Requirements:
- Service must still start even if key missing.
- /health must remain functional.
- 400 for missing prompt must remain intact.
- No logging of secret values.

Gate After Commit 1:
1. npm test (must pass)
2. Route checks:
   - GET /health returns 200
   - POST /api/claude with no prompt returns 400
   - POST /api/claude with prompt and no ANTHROPIC_API_KEY returns 503

If any gate fails:
- Fix before proceeding to Commit 2.

--------------------------------------------------
COMMIT 2 — dotenv Production Discipline
--------------------------------------------------

Change:
- dotenv must NOT override environment variables in production.
- If NODE_ENV === "production", dotenv must not override Cloud Run injected vars.
- Local development behavior must remain unchanged.
- No secret values logged.

Gate After Commit 2:
1. npm test passes
2. All route checks from Commit 1 still pass
3. Confirm behavior identical in non-production

If any gate fails:
- Fix before proceeding.

--------------------------------------------------
COMMIT 3 — CI Test Stability (Test Mode Stub)
--------------------------------------------------

Change:
- If NODE_ENV === "test":
    - Skip Anthropic key validation.
    - Stub sendPromptToClaude to return:
        "test-response"
- Production and development behavior must remain unchanged.
- No runtime security weakening outside test mode.

Gate After Commit 3:
1. Tests pass without ANTHROPIC_API_KEY present.
2. Route behavior unchanged for non-test environments.
3. No bypass exists when NODE_ENV != "test".

--------------------------------------------------
OUTPUT REQUIREMENTS
--------------------------------------------------

For each commit:
- Provide summary of changes (diff-style explanation).
- Provide FULL updated file(s) as complete replacements.
- Provide gate command outputs.
- Stop if any gate fails.

Do NOT:
- Collapse commits.
- Combine concerns.
- Modify unrelated code.
- Remove security controls.

This is an enterprise-scale orchestration test.
Behavior correctness and discipline are more important than speed.
