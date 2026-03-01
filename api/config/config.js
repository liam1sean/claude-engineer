// config/config.js
// Centralized configuration layer
// All process.env reads are lazy (via getters) so this module is safe to
// import before dotenv loads — values are resolved at access time, not at
// module evaluation time.

export const config = {
  server: {
    get port() {
      return process.env.PORT ? Number(process.env.PORT) : 3000;
    },
  },
  claude: {
    get model() {
      return process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
    },
    get maxTokens() {
      return process.env.CLAUDE_MAX_TOKENS
        ? Number(process.env.CLAUDE_MAX_TOKENS)
        : 800;
    },
  },
};
