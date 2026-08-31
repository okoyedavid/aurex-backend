import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "src/modules/policy-rule/**/*.test.ts",
      "src/modules/policy/**/*.test.ts",
      "src/queues/**/*.test.ts",
    ],
    exclude: ["**/*.route.test.ts"],
    environment: "node",
  },
});
