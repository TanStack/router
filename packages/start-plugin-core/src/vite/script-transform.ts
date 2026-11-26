/**
 * The Vite transform of a script module through the session
 * (`StartCompilerSession.transform`): the environment's main transform of
 * JS/TS modules (`pass: 'main'`) and the late pass over the JavaScript
 * other plugins make of modules that are no JS/TS (`pass: 'late'`). The
 * session admits, settles, judges and commits; this maps its outcome to
 * Vite's: the module as it is (`null`), the compile's output, the mock of a
 * module that is its own violation, or the module's failure.
 */
import {
  identify,
  normalizePath,
  watchDependencies,
} from '@tanstack/router-utils/compiler'
import { isVueSfc } from '../compiler/vue'
import { inputMapOf } from './compiler-state'
import type { InputSourceMap } from '@tanstack/router-utils/compiler'
import type { Plugin } from 'vite'
import type { ViteCompilerState, ViteStartEnvironment } from './compiler-state'

/** A transform hook's handler. */
export type TransformHandler = Extract<
  NonNullable<Plugin['transform']>,
  { handler: unknown }
>['handler']

/**
 * The handler of `env`'s script transform of one pass: the main pass takes
 * ids of a language (JS/TS), the late pass ids of none.
 */
export function scriptTransform(
  state: ViteCompilerState,
  env: ViteStartEnvironment,
  pass: 'main' | 'late',
): TransformHandler {
  return async function (code, id, options) {
    const identity = identify(id)
    if (pass === 'main' ? identity.lang === null : identity.lang !== null) {
      return null
    }
    const s = state.sessionOf(this.environment)
    const environment = this.environment
    let inputMap: InputSourceMap | null | undefined
    const readInputMap = () =>
      inputMap === undefined
        ? (inputMap = inputMapOf(this, code, identity.path))
        : inputMap
    // positions in the original file: the late pass's (another plugin's
    // output), a Vue SFC's script block (Vue's output)
    const mapped = pass === 'late' || isVueSfc(identity.path)
    // (the host services and the sink only for a module the session takes:
    // most of a dependency graph passes through)
    let sink: ReturnType<typeof state.diagnosticSink> | undefined
    const sinkOf = () =>
      (sink ??= state.diagnosticSink(s, this, identity.path, code, mapped))
    const moduleType = options?.moduleType
    const { outcome } = await s.start.transform(
      {
        moduleType: 'js',
        pass,
        id,
        identity,
        code,
        env,
        inputMap: readInputMap,
        wantMap:
          s.start.opts.mode === 'dev' ||
          environment.config.build.sourcemap !== false,
        ...(mapped && { originalMap: readInputMap }),
        reach: () => state.packageReach(environment, identity.path, code),
        ...(pass === 'late' && {
          lang: lateLang(moduleType),
          bundlerParses: () => bundlerParses(this, code, moduleType),
        }),
      },
      () =>
        state.hostFor(
          s,
          environment,
          (source, imp, resolveOptions) =>
            this.resolve(source, imp, resolveOptions),
          id,
        ),
      {
        warn: (d, at, generated, module) =>
          sinkOf().warn(d, at, generated, module),
        committed: () => state.afterCommit(s, env),
      },
    )
    if (outcome.kind === 'passthrough') {
      return null
    }
    // (a watch build rebuilds the module when a file its plan read
    // changes: the module graph misses an import the compile erased)
    if (outcome.output) {
      watchDependencies(this, outcome.output, normalizePath(identity.path))
    }
    if (outcome.kind === 'failed') {
      if (outcome.error) {
        this.error(outcome.error)
      }
      // (the first error fails the module: `ctx.error` throws)
      const [first] = outcome.errors
      sinkOf().error(first!.d, first!.at, first!.generated)
      return null
    }
    if (outcome.kind === 'mock') {
      return { code: outcome.code, map: null }
    }
    if (outcome.unchanged) {
      return null
    }
    return { code: outcome.output.code, map: outcome.output.map as never }
  }
}

/**
 * The language the late pass reads a module's code as: the module type the
 * bundler parses it as (`ts` from a plugin compiling another language to
 * TypeScript), JSX for JavaScript or a module type that is no script (the
 * compile then fails to parse it, and `bundlerParses` decides).
 */
function lateLang(moduleType: string | undefined) {
  return moduleType === 'ts' || moduleType === 'tsx' ? moduleType : 'jsx'
}

/**
 * Whether the bundler's parser takes `code` as the module type it will parse
 * the module as (`moduleType`, which a plugin may set: `ts` for another
 * language compiled to TypeScript).
 */
function bundlerParses(
  ctx: {
    parse: (
      code: string,
      options?: { lang?: 'js' | 'jsx' | 'ts' | 'tsx' },
    ) => unknown
  },
  code: string,
  moduleType: string | undefined,
): boolean {
  const lang = moduleType ?? 'js'
  if (lang !== 'js' && lang !== 'jsx' && lang !== 'ts' && lang !== 'tsx') {
    return false
  }
  try {
    ctx.parse(code, { lang })
    return true
  } catch {
    return false
  }
}
