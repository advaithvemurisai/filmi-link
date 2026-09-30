import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages serves the app from /filmi-link/; override with BASE_PATH=/ for Vercel/Netlify.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/filmi-link/',
  plugins: [react()],
})
