import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

// Two pages from one build: the Stranger site at / and Duebook, the app it tests, at /duebook/.
// One .env at the repo root. VITE_ variables reach the browser, and so do the two
// demo accounts (OWNER_*, STRANGER_*): they are public on purpose, shown as one-click logins.
// Secrets (SUPABASE_SERVICE_ROLE_KEY, SUPABASE_DB_URL) have no matching prefix and stay out.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  envPrefix: ['VITE_', 'OWNER_', 'STRANGER_'],
  build: {
    rollupOptions: {
      input: {
        stranger: resolve(import.meta.dirname, 'index.html'),
        duebook: resolve(import.meta.dirname, 'duebook/index.html'),
      },
    },
  },
})
