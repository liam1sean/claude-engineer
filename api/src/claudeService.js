// src/claudeService.js
// Anthropic Claude API integration
// Note: dotenv is loaded in server.js before this module is imported

import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/config.js";

// Optional: keep a cached client, but recreate if the key changes
let cachedClient = null;
let cachedKey = null;

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;

  if (!key || typeof key !== "string" || !key.startsWith("sk-ant-")) {
    throw new Error("ANTHROPIC_API_KEY is missing or malformed in process.env");
  }

  // Recreate client if first time OR key rotated
  if (!cachedClient || cachedKey !== key) {
    cachedClient = new Anthropic({ apiKey: key });
    cachedKey = key;
  }

  return cachedClient;
}

export async function sendPromptToClaude(prompt) {
  try {
    const anthropic = getAnthropicClient();

    const message = await anthropic.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    return message.content?.[0]?.text ?? "";
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    const errType = err?.error?.type ?? err?.type;
    const msg = err?.message ?? "Unknown error calling Claude";

    console.error(`[Claude API Error] status=${status ?? "N/A"} type=${errType ?? "N/A"}`);

    if (status === 401) {
      console.error("[Claude API Error] Authentication failed — check ANTHROPIC_API_KEY");
      throw new Error("Claude auth failed (401). Your API key is invalid or revoked.");
    }

    if (status === 403) {
      console.error("[Claude API Error] Forbidden — key may lack required permissions");
      throw new Error("Claude forbidden (403). Your API key may lack permissions for this model.");
    }

    if (status === 429) {
      console.error("[Claude API Error] Rate limited — too many requests or quota exceeded");
      throw new Error("Rate limited (429). Slow down or check your plan/quota.");
    }

    if (status === 400) {
      console.error(`[Claude API Error] Bad request: ${msg}`);
      throw new Error(`Claude request invalid (400): ${msg}`);
    }

    if (status >= 500) {
      console.error(`[Claude API Error] Server error: ${msg}`);
      throw new Error(`Claude server error (${status}). Try again later.`);
    }

    console.error(`[Claude API Error] Unexpected: ${msg}`);
    throw new Error(`Claude request failed${status ? ` (${status})` : ""}: ${msg}`);
  }
}