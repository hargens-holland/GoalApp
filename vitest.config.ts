import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json.
    alias: { "@": path.resolve(__dirname, ".") },
  },
});
