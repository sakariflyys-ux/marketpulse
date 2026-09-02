import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Tests use fixtures only; nothing here needs a database or network.
    env: { DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused" },
  },
});
