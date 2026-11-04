import { defineConfig } from "vite"

export default defineConfig({
  build: {
    ssr: "src/bin.ts",
    target: "node22",
    outDir: "dist",
    rollupOptions: { output: { entryFileNames: "bin.js" } }
  }
})
