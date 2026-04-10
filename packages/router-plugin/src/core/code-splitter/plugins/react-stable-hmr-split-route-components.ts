import * as template from '@babel/template'
import * as t from '@babel/types'
import { createHmrHotExpressionAst } from '../../hmr-hot-expression'
import { getUniqueProgramIdentifier } from '../../utils'
import type { ReferenceRouteCompilerPlugin } from '../plugins'

function capitalizeIdentifier(str: string) {
  return str[0]!.toUpperCase() + str.slice(1)
}

function createHotDataKey(exportName: string) {
  return `tsr-split-component:${exportName}`
}

const buildStableSplitComponentStatements = template.statements(
  `
    const %%stableComponentIdent%% = (() => {
      const hot = %%hotExpression%%
      const hotData = hot ? (hot.data ??= {}) : undefined
      return hotData?.[%%hotDataKey%%] ?? %%lazyRouteComponentIdent%%(%%localImporterIdent%%, %%exporterIdent%%)
    })()
    if (%%hotExpression%%) {
      ((%%hotExpression%%).data ??= {})[%%hotDataKey%%] = %%stableComponentIdent%%
    }
  `,
  {
    syntacticPlaceholders: true,
  },
)

export function createReactStableHmrSplitRouteComponentsPlugin(opts?: {
  hotExpression?: string
}): ReferenceRouteCompilerPlugin {
  return {
    name: 'react-stable-hmr-split-route-components',
    onSplitRouteProperty(ctx) {
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
          hotExpression: createHmrHotExpressionAst(
            opts?.hotExpression ?? ctx.opts.hmrHotExpression,
          ),
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
