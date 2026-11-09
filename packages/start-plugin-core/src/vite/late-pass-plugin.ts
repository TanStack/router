import { ASSET_QUERY_RE, identify } from '@tanstack/router-utils/compiler'
import { TRANSFORM_ID_REGEX } from '../constants'
import { NODE_MODULES_RE } from '../compiler/scope'
import { inputMapOf } from './compiler-state'
import type { InputSourceMap } from '@tanstack/router-utils/compiler'
import type { Plugin } from 'vite'
import type { ViteCompilerState } from './compiler-state'

/** Files that are no code: a pattern can reach them, and nothing compiles them. */
export const ASSET_FILE_RE =
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss|json|json5|yaml|yml|toml|html|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp[34]|webm|ogg|wav|flac|aac|pdf|txt|wasm|zip)(?:\?|$)/i

/** Ids the late import-protection pass never compiles (not code, or served by the pre plugin). */
const LATE_PASS_EXCLUDE: Array<RegExp> = [
  ...TRANSFORM_ID_REGEX,
  /^\0/,
  NODE_MODULES_RE,
  ASSET_FILE_RE,
  ASSET_QUERY_RE,
]

/**
 * The late pass: modules whose id is not
 * JS/TS but whose code reaches us as JS through other plugins (`.mdx`, a
 * compiled `.vue` module, custom types) are judged with the `import-edges`
 * planner, and compiled by start-env in place
 * (`StartEnvConfig.late`), after the framework plugins (`post`), their
 * positions mapped through the combined source map.
 */
export function latePassPlugin(state: ViteCompilerState): Plugin {
  return {
    name: 'tanstack-start:compiler-late',
    enforce: 'post',
    applyToEnvironment(e) {
      return state.envNames.has(e.name)
    },
    transform: {
      filter: {
        id: { exclude: LATE_PASS_EXCLUDE },
        code: { include: /\b(?:import|export)\b|\brequire\s*\(/ },
      },
      async handler(code, id, options) {
        const s = state.requireSession()
        const env = state.envOf(this.environment.name)
        if (!env || identify(id).lang !== null) {
          return null
        }
        let inputMap: InputSourceMap | null | undefined
        const readInputMap = () =>
          inputMap === undefined
            ? (inputMap = inputMapOf(this, code, identify(id).path))
            : inputMap
        const out = await s.start.compile(
          {
            id,
            code,
            env,
            inputMap: readInputMap,
            wantMap: true,
            late: true,
          },
          state.hostFor(
            s,
            this.environment,
            (source, imp, options) => this.resolve(source, imp, options),
            id,
          ),
        )
        if (
          !out ||
          (out.diagnostics.some((d) => d.by === 'parse') &&
            !bundlerParses(this, code, options?.moduleType))
        ) {
          // not JavaScript the bundler takes as it is: another plugin's
          // input (Markdown a later plugin compiles), nothing to judge
          return null
        }
        // (JavaScript the bundler parses and the compiler cannot fails the
        // client build when it names a Start package:
        // `StartCompilerSession.report`)
        state.reportDiagnostics(
          s,
          this,
          out,
          identify(id).path,
          code,
          env.type,
          readInputMap,
        )
        let mock = state.afterCompile(s, env, id, out, (error) =>
          this.error(error),
        )
        if (mock instanceof Promise) {
          mock = await mock
        }
        if (mock) {
          return { code: mock.code, map: null }
        }
        if (out.code === code) {
          return null
        }
        return { code: out.code, map: out.map as never }
      },
    },
  }
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
