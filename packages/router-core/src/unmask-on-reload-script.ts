import minifiedUnmaskOnReloadScript from './unmask-on-reload-inline?script-string'
import { routePathToRegExpSource } from './path'
import type { AnyRoute, RouteMask } from './route'
import { escapeHtml } from './utils'

export function getUnmaskOnReloadScriptFromRouteMasks(
  routeMasks?: ReadonlyArray<
    Pick<RouteMask<AnyRoute>, 'from' | 'unmaskOnReload'>
  >,
) {
  return getUnmaskOnReloadScript(
    (routeMasks ?? [])
      .filter(
        (
          routeMask,
        ): routeMask is {
          from: RouteMask<AnyRoute>['from']
          unmaskOnReload: true
        } =>
          routeMask.unmaskOnReload === true && typeof routeMask.from === 'string',
      )
      .map((routeMask) => routePathToRegExpSource(routeMask.from)),
  )
}

export function getUnmaskOnReloadScript(routeMaskSources: Array<string>) {
  if (!routeMaskSources.length) return null

  return `(${minifiedUnmaskOnReloadScript})(${escapeHtml(
    JSON.stringify({ routeMaskSources }),
  )})`
}
