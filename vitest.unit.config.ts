import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/modules/policy-rule/**/*.test.ts",
      "src/modules/policy/**/*.test.ts",
      "src/modules/warp-demo/**/*.test.ts",
      "src/modules/employee/**/*.test.ts",
      "src/modules/audit-feed/**/*.test.ts",
      "src/modules/github-integration/**/*.test.ts",
      "src/queues/**/*.test.ts",
    ],
    exclude: ["**/*.route.test.ts"],
    environment: "node",
  },
});
