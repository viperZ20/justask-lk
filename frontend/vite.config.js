import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Cloudflare quick tunnels get a new random subdomain each run, so allow
    // the whole domain rather than editing this file every session.
    // Development only — this has no effect on a production build.
    allowedHosts: ['.trycloudflare.com'],
  },
})