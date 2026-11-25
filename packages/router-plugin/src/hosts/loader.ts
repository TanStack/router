/**
 * The webpack-family loader of the router compiler: runs
 * for every JavaScript module (raw: what is no route goes on as its bytes)
 * and compiles every id of a route module (env and derived `NormalModule`s
 * hit the same plan), composes its map with the input map (an earlier
 * loader's map is not lost) and names the absolute path as the map source,
 * whose text is in the map or, with a recorder that takes it, in the
 * emitted maps (`emittedMapTexts`). The static loader file
 * (`loader/index.cjs`) finds this implementation on the compiler.
 */
import {
  composeLoaderMap,
  loaderText,
  locatedDiagnostic,
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
  _module?: { buildInfo?: Record<string, unknown>; type?: string }
}

export interface LoaderResult {
  code: string | Uint8Array
  map: unknown
}

/** `source`: the module's bytes (the loader is raw). */
export type LoaderImpl = (
  ctx: LoaderContextLike,
  source: Uint8Array,
  inputMap: unknown,
) => Promise<LoaderResult>

/** The property of a compiler holding the loader implementations by instance key. */
export const LOADER_REGISTRY = '__tanstackRouterCompilers'

/**
 * The `buildInfo` field holding the key and dependencies of a route
 * module's plan, as JSON, when the bundler's cache outlives the process
 * (checked at a compiler's first `finishMake`: `restorePlans`).
 */
export const PLAN_BUILD_INFO_FIELD = 'tanstack.router.plan'

/**
 * A compiler whose cache outlives the process (webpack's `filesystem`,
 * Rspack's `persistent` cache): the loader persists each route module's
 * plan with the module, and records the resources it compiled in the
 * current compilation (`compiled`: the others the bundler restored).
 */
export interface PersistedModules {
  compiled: Set<string>
}

/**
 * How the loader reports its diagnostics, and where it records them with
 * their positions: the host locates them after the seal
 * (`locateDiagnostics`).
 */
export const LOCATED_DIAGNOSTICS: LocatedDiagnosticsOptions = {
  field: 'tanstack.router.diagnostics',
  errorName: 'TanStackRouterCompilerError',
  warningName: 'TanStackRouterCompilerWarning',
  tag: '[tanstack-router]',
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
  persisted: PersistedModules | null,
): LoaderImpl {
  return async (ctx, bytes, inputMap) => {
    const id = webpackResourceId(ctx.resource)
    let source: string | undefined
    const result = await compiler.transform({
      id,
      code: () => (source ??= loaderText(bytes)),
      env,
      wantMap: ctx.sourceMap !== false,
      // webpack-sources counts the map's lines at LF only
      lines: 'lf',
      // (a route file imported as its text, `asset/source`, stays its text)
      moduleType: () =>
        ctx._module?.type?.startsWith('asset') ? 'asset' : 'js',
    })
    if (result.kind === 'pass') {
      return { code: bytes, map: inputMap }
    }
    if (result.kind === 'empty') {
      // (a map that maps nothing: none)
      return { code: result.code, map: undefined }
    }
    const { output: out, file } = result
    const text = source!
    const buildInfo = ctx._module?.buildInfo
    if (persisted) {
      persisted.compiled.add(ctx.resource)
      if (buildInfo && out.persisted) {
        buildInfo[PLAN_BUILD_INFO_FIELD] = JSON.stringify(out.persisted)
      }
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
    // (a split chunk's compile reads the file its route module did, and has
    // that compile's diagnostics: the route module, whose output imports the
    // chunk, reports them; an error emitted there does not stop the chunk's
    // build)
    if (!result.derived) {
      compiler.report(out, file, text, {
        error: (d, at) =>
          ctx.emitError(locate(locatedDiagnostic('error', d.message, at))),
        warn: (d, at) =>
          ctx.emitWarning(locate(locatedDiagnostic('warning', d.message, at))),
      })
    }
    if (located.length > 0 && buildInfo) {
      buildInfo[LOCATED_DIAGNOSTICS.field] = located
    }
    if (result.unchanged) {
      return { code: bytes, map: inputMap }
    }
    return {
      code: out.code,
      map: composeLoaderMap(
        out.map,
        ctx.resourcePath,
        text,
        inputMap,
        recordMapText,
      ),
    }
  }
}
