import * as template from '@babel/template'
import * as t from '@babel/types'
import { getUniqueProgramIdentifier } from '../../utils'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

const REACT_STABLE_HMR_COMPONENT_IDENTS = new Set([
  'component',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
])

function capitalizeIdentifier(str: string) {
  return str[0]!.toUpperCase() + str.slice(1)
}

function createHotDataKey(exportName: string) {
  return `tsr-split-component:${exportName}`
}

const buildStableSplitComponentStatements = template.statements(
  `
    const %%stableComponentIdent%% = import.meta.hot?.data?.[%%hotDataKey%%] ?? %%lazyRouteComponentIdent%%(%%localImporterIdent%%, %%exporterIdent%%)
    if (import.meta.hot) {
      import.meta.hot.data[%%hotDataKey%%] = %%stableComponentIdent%%
    }
  `,
  {
    syntacticPlaceholders: true,
  },
)

export function createReactStableHmrSplitRouteComponentsPlugin(): ReferenceRouteCompilerPlugin {
  return {
    name: 'react-stable-hmr-split-route-components',
    onSplitRouteProperty(ctx) {
      if (!t.isIdentifier(ctx.prop.key)) {
        return
      }

      if (!REACT_STABLE_HMR_COMPONENT_IDENTS.has(ctx.prop.key.name)) {
        return
      }

      if (ctx.splitNodeMeta.splitStrategy !== 'lazyRouteComponent') {
        return
      }

      const stableComponentIdent = getUniqueProgramIdentifier(
        ctx.programPath,
        `TSRSplit${capitalizeIdentifier(ctx.splitNodeMeta.exporterIdent)}`,
      )

      const hotDataKey = createHotDataKey(ctx.splitNodeMeta.exporterIdent)

      ctx.insertionPath.insertBefore(
        buildStableSplitComponentStatements({
          stableComponentIdent,
          hotDataKey: t.stringLiteral(hotDataKey),
          lazyRouteComponentIdent: t.identifier(ctx.lazyRouteComponentIdent),
          localImporterIdent: t.identifier(
            ctx.splitNodeMeta.localImporterIdent,
          ),
          exporterIdent: t.stringLiteral(ctx.splitNodeMeta.exporterIdent),
        }),
      )

      return t.identifier(stableComponentIdent.name)
    },
  }
}
