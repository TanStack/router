/**
 * The webpack-family loader of the router compiler: runs
 * for every id of a route module (env and derived `NormalModule`s hit the
 * same plan), composes its map with the input map (an earlier
 * loader's map is not lost) and names the
 * absolute path as the map source. The static loader file
 * (`loader/index.cjs`) finds this implementation on the compiler.
 */
import remapping from '@jridgewell/remapping'
import { SourceText, identify } from '@tanstack/router-utils/compiler'
import { normalizePath, resourceId } from './session'
import type { RouterCompiler } from './session'
import type { Diagnostic } from '@tanstack/router-utils/compiler'

/** What the loader uses of the webpack / Rspack loader context. */
export interface LoaderContextLike {
  resource: string
  resourcePath: string
  sourceMap?: boolean
  addDependency: (file: string) => void
  emitWarning: (error: Error) => void
  emitError: (error: Error) => void
}

export interface LoaderResult {
  code: string
  map: unknown
}

export type LoaderImpl = (
  ctx: LoaderContextLike,
  source: string,
  inputMap: unknown,
) => Promise<LoaderResult>

/** The property of a compiler holding the loader implementations by instance key. */
export const LOADER_REGISTRY = '__tanstackRouterCompilers'

function diagnosticError(
  d: Diagnostic,
  source: SourceText,
  file: string,
): Error {
  // the position in the Vite host's form, `message (file:line:col)`
  const where = d.range
    ? (() => {
        const at = source.locate(d.range.start)
        return ` (${file}:${at.line + 1}:${at.column + 1})`
      })()
    : ''
  const error = new Error(`${d.message}${where}`)
  error.name = 'TanStackRouterCompilerWarning'
  return error
}

export function createLoaderImpl(
  compiler: RouterCompiler,
  env: { name: string; type: 'client' | 'server' },
): LoaderImpl {
  return async (ctx, source, inputMap) => {
    const id = resourceId(ctx.resource)
    const identity = identify(id)
    if (identity.lang === null || !compiler.wants(id)) {
      return { code: source, map: inputMap }
    }
    const file = normalizePath(identity.path)
    if (!compiler.routeEntry(file)) {
      return identity.derived
        ? { code: 'export {}\n', map: undefined }
        : { code: source, map: inputMap }
    }
    const out = await compiler.compile({
      id,
      code: source,
      env,
      wantMap: ctx.sourceMap !== false,
    })
    if (!out) {
      return { code: source, map: inputMap }
    }
    for (const dep of out.dependencies) {
      if (dep !== file) {
        ctx.addDependency(dep)
      }
    }
    if (out.diagnostics.length > 0) {
      const text = new SourceText(source)
      compiler.report(out, file, (d) => {
        const error = diagnosticError(d, text, ctx.resourcePath)
        if (d.severity === 'error') {
          ctx.emitError(error)
        } else {
          ctx.emitWarning(error)
        }
      })
    }
    if (identity.derived === null && out.code === source) {
      return { code: source, map: inputMap }
    }
    let map: unknown = out.map ?? undefined
    if (out.map && inputMap) {
      const input =
        typeof inputMap === 'string'
          ? (JSON.parse(inputMap) as Parameters<typeof remapping>[0])
          : (inputMap as Parameters<typeof remapping>[0])
      const ours = {
        ...out.map,
        sources: [ctx.resourcePath],
      } as unknown as Parameters<typeof remapping>[0]
      const composed = remapping([ours, input] as never, () => null)
      map = JSON.parse(composed.toString())
    } else if (out.map) {
      map = { ...out.map, sources: [ctx.resourcePath] }
    }
    return { code: out.code, map }
  }
}
