/**
 * INTERIM (until the Hydrate planner of the J5 lane lands): today's Babel
 * `<Hydrate>` transform (`hydrate-when-transform.ts`) runs on the output of
 * the new compiler as a post-pass, and serves its `?tss-hydrate=` chunks
 * from the parent's compiled code as before. One extra Babel parse per module
 * that mentions `Hydrate`; maps are composed with the compiler's.
 */
import * as t from '@babel/types'
import babel from '@babel/core'
import remapping from '@jridgewell/remapping'
import { generateFromAst, parseAst } from '@tanstack/router-utils'
import { createHydrateCompilerPlugin } from '../hydrate-when-transform'
import type { RawSourceMap } from '@tanstack/router-utils/compiler'
import type { SourceMapInput } from '@jridgewell/remapping'
import type { CompileStartFrameworkOptions } from '../types'
import type { StartCompilerTransformResult } from '../start-compiler/babel-types'

const HYDRATE_DETECTION_PATTERN = /\bHydrate\b/

export interface InterimHydrateEnv {
  type: 'client' | 'server'
  name: string
  mode: 'dev' | 'build'
}

export interface InterimHydrate {
  /** Applies the Babel Hydrate transform to `code` (the compiler's output for `id`); null when nothing changed. */
  transform: (
    code: string,
    id: string,
    env: InterimHydrateEnv,
    inputMap: RawSourceMap | null,
  ) => { code: string; map: RawSourceMap | null } | null
  /** Serves a `?tss-hydrate=` chunk; throws `MissingHydrateSourceError` when the parent was not compiled yet. */
  load: (
    id: string,
    env: InterimHydrateEnv,
  ) => StartCompilerTransformResult | null
  invalidate: (id: string, envName: string) => void
  readonly idPattern: RegExp
}

export function createInterimHydrate(opts: {
  framework: CompileStartFrameworkOptions
  root: () => string
  providerEnvName: string
}): InterimHydrate {
  const plugin = createHydrateCompilerPlugin()
  return {
    idPattern: plugin.virtualModuleIdPattern!,
    transform(code, id, env, inputMap) {
      if (!HYDRATE_DETECTION_PATTERN.test(code)) {
        return null
      }
      const ast = parseAst({ code, filename: id.split('?')[0] })
      const modified = plugin.transformAst!({
        ast,
        code,
        id,
        env: env.type,
        envName: env.name,
        mode: env.mode,
        root: opts.root(),
        framework: opts.framework,
        providerEnvName: opts.providerEnvName,
        types: t,
        parseExpression: (expressionCode) =>
          babel.template.expression(expressionCode, {
            placeholderPattern: false,
          })(),
      })
      if (!modified) {
        return null
      }
      const result = generateFromAst(ast, {
        sourceMaps: true,
        sourceFileName: id,
        filename: id,
      })
      let map: RawSourceMap | null =
        (result.map as unknown as RawSourceMap) ?? null
      if (map) {
        ;(map as { sourcesContent?: Array<string> }).sourcesContent = [code]
        if (inputMap) {
          map = remapping(
            [
              map as unknown as SourceMapInput,
              inputMap as unknown as SourceMapInput,
            ],
            () => null,
          ) as unknown as RawSourceMap
        }
      }
      return { code: result.code, map }
    },
    load(id, env) {
      return plugin.loadVirtualModule!({
        id,
        root: opts.root(),
        env: env.type,
        envName: env.name,
      })
    },
    invalidate(id, envName) {
      plugin.invalidateModule?.({ id, envName })
    },
  }
}
