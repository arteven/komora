import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/integration/**/*.e2e.test.ts"],
    environment: "node",
    globalSetup: ["./tests/integration/global-setup.ts"],
    testTimeout: 1_800_000,
    hookTimeout: 1_800_000,
    fileParallelism: false,
    sequence: { concurrent: false },
    reporters: ["verbose"],
  },
});
