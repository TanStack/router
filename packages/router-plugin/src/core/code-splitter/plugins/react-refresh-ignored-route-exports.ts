import { parseStatements } from '@tanstack/router-utils'
import { getUniqueProgramIdentifier } from '../../utils'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

export function createReactRefreshIgnoredRouteExportsPlugin(): ReferenceRouteCompilerPlugin {
  return {
    name: 'react-refresh-ignored-route-exports',
    onAddHmr(ctx) {
      const anchorName = getUniqueProgramIdentifier(
        ctx.program,
        'TSRFastRefreshAnchor',
      )
      ctx.program.body.push(
        ...parseStatements(`
const hot = import.meta.hot
if (hot && typeof window !== 'undefined') {
  hot.data ??= {}
  const tsrReactRefresh = window.__TSR_REACT_REFRESH__ ??= (() => {
    const ignoredExportsById = new Map()
    const previousGetIgnoredExports = window.__getReactRefreshIgnoredExports

    window.__getReactRefreshIgnoredExports = (ctx) => {
      const ignoredExports = previousGetIgnoredExports?.(ctx) ?? []
      const moduleIgnored = ignoredExportsById.get(ctx.id) ?? []
      return [...ignoredExports, ...moduleIgnored]
    }

    return {
      ignoredExportsById,
    }
  })()

  tsrReactRefresh.ignoredExportsById.set(${JSON.stringify(ctx.opts.id)}, ['Route'])
}

export function ${anchorName.name}() { return null }
`),
      )
      return { modified: true }
    },
  }
}
