import path from 'node:path'

export const VITE_ENVIRONMENT_NAMES = {
  // 'ssr' is chosen as the name for the server environment to ensure backwards compatibility
  // with vite plugins that are not compatible with the new vite environment API (e.g. tailwindcss)
  server: 'ssr',
  client: 'client',
} as const

export const CLIENT_DIST_DIR = path.join(
  '.tanstack',
  'start',
  'build',
  'client-dist',
)
export const SSR_ENTRY_FILE = 'ssr.mjs'
