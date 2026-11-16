import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// One .env at the repo root. Only VITE_ variables reach the browser.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
})
