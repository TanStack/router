import { hydrate } from '@tanstack/router-core/ssr/client'
import type { CreateStart } from './createStart'

export async function hydrateStart(createStart: CreateStart) {
  const start = await createStart()
  window.__TSS_GLOBAL_MIDDLEWARES__ = start.middlewares?.function
  if (!start.router.state.matches.length) {
    await hydrate(start.router)
  }
  return start.router
}
