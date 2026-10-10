import { b } from 'yuku-ast'
import { parseStatements } from '@tanstack/router-utils'
import { getUniqueProgramIdentifier } from '../../utils'
import type { HmrStyle } from '../../config'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

export function createReactStableHmrSplitRouteComponentsPlugin(opts: {
  hmrStyle: HmrStyle
}): ReferenceRouteCompilerPlugin {
  return {
    name: 'react-stable-hmr-split-route-components',
    onSplitRouteProperty(ctx) {
      if (ctx.splitNodeMeta.splitStrategy !== 'lazyRouteComponent') {
        return
      }
      const exportName = ctx.splitNodeMeta.exporterIdent
      const stable = getUniqueProgramIdentifier(
        ctx.program,
        `TSRSplit${exportName[0]!.toUpperCase()}${exportName.slice(1)}`,
      )
      const hot =
        opts.hmrStyle === 'webpack'
          ? 'import.meta.webpackHot'
          : 'import.meta.hot'
      const key = JSON.stringify(`tsr-split-component:${exportName}`)
      ctx.insertBefore(
        parseStatements(`
const ${stable.name} = (() => {
  const hot = ${hot}
  const hotData = hot ? (hot.data ??= {}) : undefined
  return hotData?.[${key}] ?? ${ctx.lazyRouteComponentIdent}(${ctx.splitNodeMeta.localImporterIdent}, ${JSON.stringify(exportName)})
})()
if (${hot}) {
  ((${hot}).data ??= {})[${key}] = ${stable.name}
}
`),
      )
      return b.Identifier({ name: stable.name })
    },
  }
}
