import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  // Relative base so the build works at any mount path — domain root, GitHub
  // Pages' /<repo>/ subpath, or a future custom domain. Safe here because the
  // app is a single page using hash-only routing.
  base: './',
  plugins: [react()],
})
