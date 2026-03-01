import { vi, describe, it, expect, beforeEach } from "vitest";

vi.hoisted(() => {
  process.env.ANTHROPIC_API_KEY = "sk-ant-test1234567890123456";
});

// Hoist the mock fn so the vi.mock factory can close over it.
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}));

import { sendPromptToClaude } from "../src/claudeService.js";

describe("sendPromptToClaude", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it("returns the text from a successful API response", async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ text: "Claude says hi" }],
    });
    const result = await sendPromptToClaude("Say hi");
    expect(result).toBe("Claude says hi");
  });

  it("returns empty string when content array is empty", async () => {
    mockCreate.mockResolvedValueOnce({ content: [] });
    const result = await sendPromptToClaude("hello");
    expect(result).toBe("");
  });

  it("throws a user-readable error on 401", async () => {
    const err = Object.assign(new Error("auth failed"), { status: 401 });
    mockCreate.mockRejectedValueOnce(err);
    await expect(sendPromptToClaude("hello")).rejects.toThrow("401");
  });

  it("throws a user-readable error on 429 rate limit", async () => {
    const err = Object.assign(new Error("rate limited"), { status: 429 });
    mockCreate.mockRejectedValueOnce(err);
    await expect(sendPromptToClaude("hello")).rejects.toThrow("429");
  });

  it("throws a user-readable error on 403 forbidden", async () => {
    const err = Object.assign(new Error("forbidden"), { status: 403 });
    mockCreate.mockRejectedValueOnce(err);
    await expect(sendPromptToClaude("hello")).rejects.toThrow("403");
  });

  it("throws a user-readable error on 500 server error", async () => {
    const err = Object.assign(new Error("server error"), { status: 500 });
    mockCreate.mockRejectedValueOnce(err);
    await expect(sendPromptToClaude("hello")).rejects.toThrow("500");
  });

  it("throws a user-readable error on 400 bad request", async () => {
    const err = Object.assign(new Error("bad request"), { status: 400 });
    mockCreate.mockRejectedValueOnce(err);
    await expect(sendPromptToClaude("hello")).rejects.toThrow("400");
  });
});
