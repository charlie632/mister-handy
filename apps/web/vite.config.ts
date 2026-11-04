import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// `tailscale serve` forwards requests with the tailnet name as Host, which Vite rejects unless allowed.
const allowedHosts = [".ts.net"]

export default defineConfig({
  server: { allowedHosts },
  preview: { allowedHosts },
  plugins: [tanstackStart(), viteReact()]
})
