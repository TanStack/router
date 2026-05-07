import { lazyRouteComponent } from '@tanstack/react-router'
import type { AsyncRouteComponent } from '@tanstack/react-router'

export function lazyHydratedComponent<TProps>(
  importer: () => Promise<any>,
  exportName: string,
): AsyncRouteComponent<TProps> {
  return lazyRouteComponent(importer, exportName)
}
