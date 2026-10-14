import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // process.loadEnvFile() never overrides variables that are already set,
    // so these win over a developer's .env (no real API key in tests).
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgres://drape:drape@localhost:5433/drape",
      ANTHROPIC_API_KEY: "sk-ant-test-placeholder",
    },
  },
});
