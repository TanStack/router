import * as template from '@babel/template'
import * as t from '@babel/types'
import { getUniqueProgramIdentifier } from '../../utils'
import type { HmrStyle } from '../../config'
import type { VirtualRouteCompilerPlugin } from '../plugins'

const buildViteHmrStatements = template.statements(
  `
    const %%candidateIdent%% = %%hmrIdent%%(%%componentIdent%%)
    const %%hotIdent%% = import.meta.hot
    const %%hotDataIdent%% = %%hotIdent%% ? (%%hotIdent%%.data ??= {}) : undefined
    let %%stableIdent%% = %%candidateIdent%%
    if (%%hotDataIdent%%?.[%%hotDataKey%%]) {
      %%hotDataIdent%%[%%hotDataKey%%][%%hmrSymbolIdent%%].update(%%candidateIdent%%)
      %%stableIdent%% = %%hotDataIdent%%[%%hotDataKey%%]
    }
    %%stableIdent%%.$$singleRoot = %%componentIdent%%.$$singleRoot
    try { %%stableIdent%%.__oct_loc = %%componentIdent%%.__oct_loc } catch {}
    if (%%hotIdent%%) {
      %%hotDataIdent%%[%%hotDataKey%%] = %%stableIdent%%
      import.meta.hot.accept()
    }
  `,
  { syntacticPlaceholders: true },
)

const buildWebpackHmrStatements = template.statements(
  `
    const %%candidateIdent%% = %%hmrIdent%%(%%componentIdent%%)
    const %%hotIdent%% = import.meta.webpackHot
    let %%stableIdent%% = %%candidateIdent%%
    if (%%hotIdent%%?.data?.[%%hotDataKey%%]) {
      %%hotIdent%%.data[%%hotDataKey%%][%%hmrSymbolIdent%%].update(%%candidateIdent%%)
      %%stableIdent%% = %%hotIdent%%.data[%%hotDataKey%%]
    }
    %%stableIdent%%.$$singleRoot = %%componentIdent%%.$$singleRoot
    try { %%stableIdent%%.__oct_loc = %%componentIdent%%.__oct_loc } catch {}
    if (%%hotIdent%%) {
      %%hotIdent%%.dispose((data) => {
        data[%%hotDataKey%%] = %%stableIdent%%
      })
      %%hotIdent%%.accept()
    }
  `,
  { syntacticPlaceholders: true },
)

function capitalizeIdentifier(value: string) {
  return value[0]!.toUpperCase() + value.slice(1)
}

export function createOctaneHmrSplitRouteComponentsPlugin(opts: {
  hmrStyle: HmrStyle
}): VirtualRouteCompilerPlugin {
  let hmrIdent: t.Identifier | undefined
  let hmrSymbolIdent: t.Identifier | undefined

  return {
    name: 'octane-hmr-split-route-components',
    onExportSplitRouteProperty(ctx) {
      if (ctx.splitNodeMeta.splitStrategy !== 'lazyRouteComponent') {
        return
      }

      if (!hmrIdent || !hmrSymbolIdent) {
        hmrIdent = getUniqueProgramIdentifier(ctx.programPath, 'TSROctaneHmr')
        hmrSymbolIdent = getUniqueProgramIdentifier(
          ctx.programPath,
          'TSROctaneHmrSymbol',
        )
        ctx.programPath.unshiftContainer(
          'body',
          t.importDeclaration(
            [
              t.importSpecifier(hmrIdent, t.identifier('hmr')),
              t.importSpecifier(hmrSymbolIdent, t.identifier('HMR')),
            ],
            t.stringLiteral('octane'),
          ),
        )
      }

      const exportName = ctx.splitNodeMeta.exporterIdent
      const name = capitalizeIdentifier(exportName)
      const componentIdent = t.identifier(ctx.localExporterIdent)
      const candidateIdent = getUniqueProgramIdentifier(
        ctx.programPath,
        `TSROctane${name}Candidate`,
      )
      const stableIdent = getUniqueProgramIdentifier(
        ctx.programPath,
        `TSROctane${name}`,
      )
      const hotIdent = getUniqueProgramIdentifier(
        ctx.programPath,
        `TSROctane${name}Hot`,
      )
      const hotDataIdent = getUniqueProgramIdentifier(
        ctx.programPath,
        `TSROctane${name}HotData`,
      )
      const hotDataKey = t.stringLiteral(
        `tsr-octane-split-component:${exportName}`,
      )

      const statements =
        opts.hmrStyle === 'webpack'
          ? buildWebpackHmrStatements({
              candidateIdent,
              componentIdent,
              hmrIdent,
              hmrSymbolIdent,
              hotDataKey,
              hotIdent,
              stableIdent,
            })
          : buildViteHmrStatements({
              candidateIdent,
              componentIdent,
              hmrIdent,
              hmrSymbolIdent,
              hotDataIdent,
              hotDataKey,
              hotIdent,
              stableIdent,
            })

      ctx.programPath.pushContainer('body', statements)
      return stableIdent
    },
  }
}
