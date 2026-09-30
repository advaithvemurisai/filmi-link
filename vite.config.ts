import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Served from the domain root on Vercel. The GitHub Pages mirror builds with BASE_PATH=/filmi-link/.
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
})
