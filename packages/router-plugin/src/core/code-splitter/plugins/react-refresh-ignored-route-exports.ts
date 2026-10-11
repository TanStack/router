import { getUniqueProgramIdentifier } from '../../utils'
import { astTemplate, hole, importMeta } from '../../ast-template'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

type GetIgnoredExports = (ctx: { id: string }) => Array<string>

/** `window` in a route module running in Vite with React Refresh */
declare const window: {
  // Asked by @vitejs/plugin-react for the exports a module may update without
  // being a React Refresh boundary
  __getReactRefreshIgnoredExports?: GetIgnoredExports
  __TSR_REACT_REFRESH__?: {
    ignoredExportsById: Map<string, Array<string>>
  }
}

const ignoreRouteExport = astTemplate(
  {
    moduleId: hole.literal<string>(),
    // A component export keeps the route module a React Refresh boundary
    TSRFastRefreshAnchor: hole.binding({ exported: true }),
  },
  ({ moduleId }) => {
    const hot = importMeta.hot
    if (hot && typeof window !== 'undefined') {
      hot.data ??= {}
      // prettier-ignore
      const tsrReactRefresh = window.__TSR_REACT_REFRESH__ ??= (() => {
        const ignoredExportsById = new Map<string, Array<string>>()
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

      tsrReactRefresh.ignoredExportsById.set(moduleId, ['Route'])
    }

    // eslint-disable-next-line unused-imports/no-unused-vars
    function TSRFastRefreshAnchor() {
      return null
    }
  },
)

export function createReactRefreshIgnoredRouteExportsPlugin(): ReferenceRouteCompilerPlugin {
  return {
    name: 'react-refresh-ignored-route-exports',
    onAddHmr(ctx) {
      const anchorName = getUniqueProgramIdentifier(
        ctx.reservedNames,
        'TSRFastRefreshAnchor',
      )
      ctx.program.body.push(
        ...ignoreRouteExport({
          moduleId: ctx.opts.id,
          TSRFastRefreshAnchor: anchorName.name,
        }),
      )
      return { modified: true }
    },
  }
}
