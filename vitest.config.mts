import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      // "server-only" throws outside React Server Components; stub it in tests
      "server-only": fileURLToPath(
        new URL("./test/stubs/server-only.ts", import.meta.url)
      ),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    environment: "node",
  },
});
