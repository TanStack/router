import minifiedUnmaskOnReloadScript from './unmask-on-reload-inline?script-string'
import { escapeHtml } from './utils'

type InlineUnmaskOnReloadScriptOptions = {
  routeMaskSources: Array<string>
}

export function getUnmaskOnReloadScript(routeMaskSources: Array<string>) {
  if (!routeMaskSources.length) return null

  return `(${minifiedUnmaskOnReloadScript})(${escapeHtml(
    JSON.stringify({
      routeMaskSources,
    } satisfies InlineUnmaskOnReloadScriptOptions),
  )})`
}
