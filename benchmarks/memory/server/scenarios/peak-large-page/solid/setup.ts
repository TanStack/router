import { createSetup } from '../shared'
import type { StartRequestHandler } from '../shared'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

export async function setup() {
  const { default: handler } = (await import(
    /* @vite-ignore */ appModuleUrl
  )) as {
    default: StartRequestHandler
  }

  return createSetup('solid', handler)
}
