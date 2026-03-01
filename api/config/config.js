// config/config.js
// Centralized configuration layer
// Note: dotenv must be loaded BEFORE this module is imported (done in server.js)

export const config = {
  server: {
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
  },
  claude: {
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514",
    maxTokens: process.env.CLAUDE_MAX_TOKENS
      ? Number(process.env.CLAUDE_MAX_TOKENS)
      : 800,
  },
};