import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { execa } from "execa";
import Anthropic from "@anthropic-ai/sdk";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

// Reduce noisy hard-crashes on Windows when async errors occur
process.on("unhandledRejection", (err) => {
  console.error("❌ Unhandled promise rejection:", err?.message ?? err);
  process.exitCode = 1;
});
process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught exception:", err?.message ?? err);
  process.exitCode = 1;
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "../../");

const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) {
  console.error("❌ Missing ANTHROPIC_API_KEY in environment (.env).");
  process.exit(1);
}

const anthropic = new Anthropic({ apiKey });

const userRequest = process.argv.slice(2).join(" ").trim();
if (!userRequest) {
  console.error('❌ Usage: node tools/agent/builder.js "your request here"');
  process.exit(1);
}

function extractJsonObject(raw) {
  if (!raw) return null;

  // 1) If Claude returned a fenced JSON block ```json ... ```
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();

  // 2) Otherwise, try to find the first top-level JSON object by scanning braces
  const start = raw.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") depth--;

    if (depth === 0) {
      return raw.slice(start, i + 1).trim();
    }
  }

  return null;
}

async function main() {
  console.log("🧠 Sending request to Claude...");
  console.log("Request:", userRequest);

  const response = await anthropic.messages.create({
    // Opus 4.6 API model ID per Anthropic docs
    model: "claude-opus-4-6",
    max_tokens: 4000,
    temperature: 0.2,
    system: `
You are an autonomous senior software engineer working inside an existing Node.js repo.

CRITICAL OUTPUT RULE:
- Output ONLY raw JSON. No markdown. No code fences. No commentary.

Return JSON with this exact shape:

{
  "branchName": "feature/some-short-name",
  "commitMessage": "feat: ...",
  "files": [
    { "path": "relative/path/from/repo/root.js", "content": "FULL FILE CONTENTS" }
  ]
}

Engineering rules:
- This repo uses ESM ("type":"module"). Use import/export only. Never use require/module.exports.
- Prefer modifying existing server entry (likely server.js) rather than inventing a new app in index.js unless explicitly requested.
- Provide FULL file contents for each changed/created file (no diffs).
- Keep changes minimal to satisfy the request.
- Do NOT modify CI/CD workflow files unless explicitly requested.
`,
    messages: [{ role: "user", content: userRequest }],
  });

  const raw = response.content?.[0]?.text ?? "";
  const jsonText = extractJsonObject(raw);

  if (!jsonText) {
    console.error("❌ Could not find JSON in Claude output:");
    console.error(raw);
    process.exit(1);
  }

  let plan;
  try {
    plan = JSON.parse(jsonText);
  } catch {
    console.error("❌ Claude output was not valid JSON after extraction:");
    console.error(jsonText);
    process.exit(1);
  }

  if (!plan?.branchName || !plan?.commitMessage || !Array.isArray(plan?.files)) {
    console.error("❌ Claude JSON missing required fields:");
    console.error(JSON.stringify(plan, null, 2));
    process.exit(1);
  }

  console.log("📂 Writing files...");
  for (const f of plan.files) {
    if (!f?.path || typeof f?.content !== "string") {
      console.error("❌ Invalid file entry:");
      console.error(JSON.stringify(f, null, 2));
      process.exit(1);
    }

    const fullPath = path.join(ROOT, f.path);
    const resolved = path.resolve(fullPath);

    // Safety: prevent writing outside repo root
    if (!resolved.startsWith(ROOT + path.sep) && resolved !== ROOT) {
      console.error("❌ Refusing to write outside repo root:", f.path);
      process.exit(1);
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, f.content, "utf8");
    console.log("✔", f.path);
  }

  console.log("🧪 Running tests...");
  await execa("npm", ["test"], { cwd: ROOT, stdio: "inherit" });

  console.log("🌿 Creating branch...");
  await execa("git", ["checkout", "-b", plan.branchName], { cwd: ROOT, stdio: "inherit" });

  await execa("git", ["add", "."], { cwd: ROOT, stdio: "inherit" });
  await execa("git", ["commit", "-m", plan.commitMessage], { cwd: ROOT, stdio: "inherit" });

  console.log("🚀 Pushing branch...");
  await execa("git", ["push", "-u", "origin", plan.branchName], { cwd: ROOT, stdio: "inherit" });

  console.log("🔁 Opening PR...");
  await execa("gh", ["pr", "create", "--base", "develop", "--fill"], { cwd: ROOT, stdio: "inherit" });

  console.log("✅ Done. PR created.");
}

main().catch((err) => {
  console.error("❌ Error:", err?.message ?? err);
  setTimeout(() => process.exit(1), 50);
});