import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Unit tests only. Playwright owns e2e/ and uses its own runner.
    // .claude/ holds throwaway agent worktrees — never collect from there.
    exclude: ["node_modules/**", "e2e/**", ".next/**", ".claude/**"],
  },
});
