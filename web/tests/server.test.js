import { vi, describe, it, expect, beforeEach } from "vitest";

// Set required env before web/server.js evaluates.
vi.hoisted(() => {
  process.env.API_CLAUDE_URL = "http://localhost:3000";
});

// Intercept all global fetch calls made by the proxy handler.
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import request from "supertest";
import { app } from "../server.js";

describe("GET /health", () => {
  it("returns 200 { status: ok }", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("POST /api/ask", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.API_SERVICE_KEY;
  });

  it("returns 400 when prompt is missing", async () => {
    const res = await request(app).post("/api/ask").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when prompt is whitespace only", async () => {
    const res = await request(app).post("/api/ask").send({ prompt: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 400 when prompt is not a string", async () => {
    const res = await request(app).post("/api/ask").send({ prompt: 99 });
    expect(res.status).toBe(400);
  });

  it("returns 200 with text from upstream on a valid prompt", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "proxied response" }),
    });
    const res = await request(app).post("/api/ask").send({ prompt: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("proxied response");
  });

  it("calls the API at /api/claude with the prompt in the body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "ok" }),
    });
    await request(app).post("/api/ask").send({ prompt: "test prompt" });
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://localhost:3000/api/claude");
    expect(JSON.parse(opts.body)).toEqual({ prompt: "test prompt" });
  });

  it("forwards x-api-key when API_SERVICE_KEY is set (localhost target)", async () => {
    process.env.API_SERVICE_KEY = "local-secret";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ text: "ok" }),
    });
    await request(app).post("/api/ask").send({ prompt: "hello" });
    const [, opts] = mockFetch.mock.calls[0];
    expect(opts.headers["x-api-key"]).toBe("local-secret");
  });

  it("mirrors upstream error status when the API returns non-ok", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: () => Promise.resolve({ message: "Service Unavailable" }),
    });
    const res = await request(app).post("/api/ask").send({ prompt: "hello" });
    expect(res.status).toBe(503);
  });

  it("returns 502 when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await request(app).post("/api/ask").send({ prompt: "hello" });
    expect(res.status).toBe(502);
  });
});

describe("unknown routes", () => {
  it("returns 404 for unregistered paths", async () => {
    const res = await request(app).get("/no-such-route");
    expect(res.status).toBe(404);
  });
});
