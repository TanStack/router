import { createElement } from 'octane/server'
import { RouterProvider } from '@tanstack/octane-router'
import type { ElementDescriptor } from 'octane'
import type { AnyRouter } from '@tanstack/router-core'

type ServerRenderable = Parameters<typeof createElement>[0]

export interface StartServerProps {
  router: AnyRouter
}

export function StartServer({
  router,
}: StartServerProps): ElementDescriptor<StartServerProps> {
  return createElement(RouterProvider as unknown as ServerRenderable, {
    router,
  }) as unknown as ElementDescriptor<StartServerProps>
}
