import { b } from 'yuku-ast'
import { getUniqueProgramIdentifier } from '../../utils'
import { astTemplate, hole, importMeta } from '../../ast-template'
import type { HotContext } from '../../ast-template'
import type { HmrStyle } from '../../config'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

const stableSplitComponent = astTemplate(
  {
    TSRSplitComponent: hole.binding(),
    importMetaHot: hole.expression<HotContext | undefined>(),
    key: hole.literal<`tsr-split-component:${string}`>(),
    lazyRouteComponent:
      hole.identifier<
        (importer: () => Promise<unknown>, exportName: string) => unknown
      >(),
    importer: hole.identifier<() => Promise<unknown>>(),
    exportName: hole.literal<string>(),
  },
  ({ importMetaHot, key, lazyRouteComponent, importer, exportName }) => {
    const TSRSplitComponent = (() => {
      const hot = importMetaHot
      const hotData = hot ? (hot.data ??= {}) : undefined
      return hotData?.[key] ?? lazyRouteComponent(importer, exportName)
    })()
    if (importMetaHot) {
      ;(importMetaHot.data ??= {})[key] = TSRSplitComponent
    }
  },
)

const importMetaHot = astTemplate({}, () => importMeta.hot)
const importMetaWebpackHot = astTemplate({}, () => importMeta.webpackHot)

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
        ctx.reservedNames,
        `TSRSplit${exportName[0]!.toUpperCase()}${exportName.slice(1)}`,
      )
      // Keep the lazy component in the bundler's hot data, so that it keeps
      // its identity across hot updates
      ctx.insertBefore(
        stableSplitComponent({
          TSRSplitComponent: stable.name,
          importMetaHot:
            opts.hmrStyle === 'webpack'
              ? importMetaWebpackHot()
              : importMetaHot(),
          key: `tsr-split-component:${exportName}`,
          lazyRouteComponent: ctx.lazyRouteComponentIdent,
          importer: ctx.splitNodeMeta.localImporterIdent,
          exportName,
        }),
      )
      return b.Identifier({ name: stable.name })
    },
  }
}
