import { configDefaults, defineConfig } from "vitest/config";

export const TEST_DATABASE_URL = "postgres://drape:drape@localhost:5433/drape_test";

export default defineConfig({
  test: {
    globalSetup: ["test/global-setup.ts"],
    // The frontend has its own Vitest setup in web/.
    exclude: [...configDefaults.exclude, "web/**"],
    // Item tests share one database, so run test files one at a time.
    fileParallelism: false,
    // process.loadEnvFile() never overrides variables that are already set,
    // so these win over a developer's .env (no real API key in tests).
    env: {
      NODE_ENV: "test",
      DATABASE_URL: TEST_DATABASE_URL,
      ANTHROPIC_API_KEY: "sk-ant-test-placeholder",
    },
  },
});
