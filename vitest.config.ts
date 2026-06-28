import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    fileParallelism: false,
    hookTimeout: 180_000,
    setupFiles: ["./tests/setup/mongoose.ts"],
    testTimeout: 180_000,
  },
});
