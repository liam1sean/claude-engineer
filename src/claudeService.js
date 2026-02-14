import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";
import { config } from "../config/config.js";

dotenv.config({ quiet: true });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function sendPromptToClaude(prompt) {
  try {
    const message = await anthropic.messages.create({
      model: config.claude.model,
      max_tokens: config.claude.maxTokens,
      messages: [{ role: "user", content: prompt }],
    });

    return message.content?.[0]?.text ?? "";
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    const msg = err?.message ?? "Unknown error calling Claude";

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "Missing API key. Add ANTHROPIC_API_KEY to your .env file and restart the server."
      );
    }

    if (status === 401) {
      throw new Error("Claude auth failed (401). Your API key is invalid or revoked.");
    }

    if (status === 429) {
      throw new Error("Rate limited (429). Slow down or check your plan/quota.");
    }

    throw new Error(`Claude request failed${status ? ` (${status})` : ""}: ${msg}`);
  }
}