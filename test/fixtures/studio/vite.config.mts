import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../../../src", import.meta.url)) } },
  server: { fs: { allow: [fileURLToPath(new URL("../../..", import.meta.url))] } },
});
