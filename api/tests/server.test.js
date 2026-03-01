import { vi, describe, it, expect, beforeEach } from "vitest";

// Set the required env var before server.js is evaluated (vi.hoisted runs before imports).
vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test1234567890123456";
});

// Mock claudeService so no real Anthropic calls happen.
vi.mock("../src/claudeService.js", () => ({
  sendPromptToClaude: vi.fn(),
}));

import request from "supertest";
import { app } from "../server.js";
import { sendPromptToClaude } from "../src/claudeService.js";

describe("GET /", () => {
  it("returns service info with ok:true", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.body.service).toBe("claude-engineer-api");
    expect(res.body.ok).toBe(true);
  });
});

describe("GET /health", () => {
  it("returns 200 { status: ok }", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("POST /api/claude", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.SERVICE_API_KEY;
  });

  it("returns 400 when body has no prompt", async () => {
    const res = await request(app).post("/api/claude").send({});
    expect(res.status).toBe(400);
  });

  it("returns 400 when prompt is empty string", async () => {
    const res = await request(app).post("/api/claude").send({ prompt: "   " });
    expect(res.status).toBe(400);
  });

  it("returns 400 when prompt is not a string", async () => {
    const res = await request(app).post("/api/claude").send({ prompt: 42 });
    expect(res.status).toBe(400);
  });

  it("returns 200 with Claude text on a valid prompt", async () => {
    sendPromptToClaude.mockResolvedValueOnce("Hello from Claude");
    const res = await request(app)
      .post("/api/claude")
      .send({ prompt: "Say hello" });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("Hello from Claude");
    expect(sendPromptToClaude).toHaveBeenCalledWith("Say hello");
  });

  it("returns 500 when claudeService throws an unhandled error", async () => {
    sendPromptToClaude.mockRejectedValueOnce(new Error("API down"));
    const res = await request(app)
      .post("/api/claude")
      .send({ prompt: "hello" });
    expect(res.status).toBe(500);
  });

  it("returns 401 when SERVICE_API_KEY is set and x-api-key header is missing", async () => {
    process.env.SERVICE_API_KEY = "secret-key";
    const res = await request(app)
      .post("/api/claude")
      .send({ prompt: "hello" });
    expect(res.status).toBe(401);
  });

  it("returns 401 when x-api-key header is wrong", async () => {
    process.env.SERVICE_API_KEY = "secret-key";
    const res = await request(app)
      .post("/api/claude")
      .set("x-api-key", "wrong")
      .send({ prompt: "hello" });
    expect(res.status).toBe(401);
  });

  it("returns 200 when x-api-key header matches SERVICE_API_KEY", async () => {
    process.env.SERVICE_API_KEY = "secret-key";
    sendPromptToClaude.mockResolvedValueOnce("authorized");
    const res = await request(app)
      .post("/api/claude")
      .set("x-api-key", "secret-key")
      .send({ prompt: "hello" });
    expect(res.status).toBe(200);
    expect(res.body.text).toBe("authorized");
  });
});

describe("unknown routes", () => {
  it("returns 404 for unregistered path", async () => {
    const res = await request(app).get("/does-not-exist");
    expect(res.status).toBe(404);
  });
});
