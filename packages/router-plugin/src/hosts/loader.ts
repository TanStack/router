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
  locatedDiagnostic,
  normalizePath,
  webpackResourceId,
} from '@tanstack/router-utils/compiler'
import type { RouterCompiler } from './session'
import type {
  LocatedDiagnostic,
  LocatedDiagnosticsOptions,
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
  _module?: { buildInfo?: Record<string, unknown> }
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

/**
 * How the loader reports its diagnostics, and where it records them with
 * their positions: the host locates them after the seal
 * (`locateDiagnostics`).
 */
export const LOCATED_DIAGNOSTICS: LocatedDiagnosticsOptions = {
  field: 'tanstack.router.diagnostics',
  errorName: 'TanStackRouterCompilerError',
  warningName: 'TanStackRouterCompilerWarning',
}

function diagnosticError(d: LocatedDiagnostic): Error {
  const error = new Error(d.message)
  error.name =
    d.severity === 'error'
      ? LOCATED_DIAGNOSTICS.errorName
      : LOCATED_DIAGNOSTICS.warningName
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
      // webpack-sources counts the map's lines at LF only
      lines: 'lf',
    })
    if (!out) {
      return { code: source, map: inputMap }
    }
    for (const dep of out.dependencies) {
      if (dep !== file) {
        ctx.addDependency(dep)
      }
    }
    const located: Array<LocatedDiagnostic> = []
    const locate = (d: LocatedDiagnostic) => {
      located.push(d)
      return diagnosticError(d)
    }
    compiler.report(out, file, source, {
      error: (d, at) =>
        ctx.emitError(locate(locatedDiagnostic('error', d.message, at))),
      warn: (d, at) =>
        ctx.emitWarning(locate(locatedDiagnostic('warning', d.message, at))),
    })
    const buildInfo = ctx._module?.buildInfo
    if (located.length > 0 && buildInfo) {
      buildInfo[LOCATED_DIAGNOSTICS.field] = located
    }
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
