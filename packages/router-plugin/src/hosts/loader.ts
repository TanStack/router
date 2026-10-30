/**
 * The webpack-family loader of the router compiler: runs
 * for every id of a route module (env and derived `NormalModule`s hit the
 * same plan), composes its map with the input map (an earlier
 * loader's map is not lost) and names the
 * absolute path as the map source, whose text is in the map or, with a
 * recorder, in the emitted maps (`emittedMapTexts`). The static loader file
 * (`loader/index.cjs`) finds this implementation on the compiler.
 */
import {
  composeLoaderMap,
  identify,
  normalizePath,
  webpackResourceId,
} from '@tanstack/router-utils/compiler'
import type { RouterCompiler } from './session'
import type {
  Diagnostic,
  DiagnosticPosition,
  RecordMapText,
} from '@tanstack/router-utils/compiler'

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
  at: DiagnosticPosition | undefined,
  file: string,
): Error {
  // the position in the Vite host's form, `message (file:line:col)`
  const where = at ? ` (${file}:${at.line}:${at.column + 1})` : ''
  const error = new Error(`${d.message}${where}`)
  error.name = 'TanStackRouterCompilerWarning'
  return error
}

export function createLoaderImpl(
  compiler: RouterCompiler,
  env: { name: string; type: 'client' | 'server' },
  recordMapText: RecordMapText | null,
): LoaderImpl {
  return async (ctx, source, inputMap) => {
    const id = webpackResourceId(ctx.resource)
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
    compiler.report(out, file, source, {
      error: (d, at) => ctx.emitError(diagnosticError(d, at, ctx.resourcePath)),
      warn: (d, at) =>
        ctx.emitWarning(diagnosticError(d, at, ctx.resourcePath)),
    })
    if (identity.derived === null && out.code === source) {
      return { code: source, map: inputMap }
    }
    return {
      code: out.code,
      map: composeLoaderMap(
        out.map,
        ctx.resourcePath,
        source,
        inputMap,
        recordMapText,
      ),
    }
  }
}
