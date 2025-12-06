import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const allowedHosts = env.ALLOWED_HOSTS ? env.ALLOWED_HOSTS.split(',') : []

  return {
    plugins: [
      react(),
      nodePolyfills({
        include: ['buffer', 'events', 'stream', 'util'],
        globals: {
          Buffer: true,
          global: true,
          process: true,
        },
      }),
    ],
    server: {
      allowedHosts: allowedHosts
    }
  }
})
