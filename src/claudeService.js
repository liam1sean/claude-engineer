import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function sendPromptToClaude(prompt) {
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{ role: "user", content: prompt }],
    });

    return message.content?.[0]?.text ?? "";
  } catch (err) {
    const status = err?.status ?? err?.response?.status;
    const msg = err?.message ?? "Unknown error calling Claude";

    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        'Missing API key. Add ANTHROPIC_API_KEY to your .env file (and restart the terminal).'
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