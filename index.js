import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getUserPrompt() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    return "Explain what an API is in simple terms.";
  }
  return args.join(" ");
}

async function run() {
  try {
    const userPrompt = getUserPrompt();

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 800,
      messages: [{ role: "user", content: userPrompt }],
    });

    console.log(message.content[0].text);
  } catch (err) {
    console.error(err);
  }
}

run();