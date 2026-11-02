import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/KnowFlow/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          auth: ['@supabase/supabase-js'],
          canvas: ['@xyflow/react'],
        },
      },
    },
  },
}))
