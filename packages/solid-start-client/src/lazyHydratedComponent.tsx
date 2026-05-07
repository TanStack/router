import { lazyRouteComponent } from '@tanstack/solid-router'
import type { AsyncRouteComponent } from '@tanstack/solid-router'

export function lazyHydratedComponent<TProps extends Record<string, any>>(
  importer: () => Promise<any>,
  exportName: string,
): AsyncRouteComponent<TProps> {
  return lazyRouteComponent(importer, exportName)
}
