declare module 'octane/compiler/vite' {
  import type { Plugin } from 'vite'

  export function octane(options?: unknown): Plugin
}
