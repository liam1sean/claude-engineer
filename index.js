import { sendPromptToClaude } from "./src/claudeService.js";

function parseArguments() {
  const args = process.argv.slice(2);

  if (args.includes("--help")) {
    return { mode: "help" };
  }

  if (args.length === 0) {
    return { mode: "run", prompt: "Explain what an API is in simple terms." };
  }

  return { mode: "run", prompt: args.join(" ") };
}

async function run() {
  try {
    const { mode, prompt } = parseArguments();

    if (mode === "help") {
      console.log(`
Usage:
  node index.js "Your prompt here"

Examples:
  node index.js "Explain APIs simply"
  node index.js --help
`);
      return;
    }

    const responseText = await sendPromptToClaude(prompt);
    console.log(responseText);
  } catch (err) {
    console.error(`ERROR: ${err?.message ?? err}`);
    process.exitCode = 1;
  }
}

run();