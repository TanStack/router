import {
  ASSET_QUERY_RE,
  identify,
  parseModule,
  watchDependencies,
} from '@tanstack/router-utils/compiler'
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
        const s = state.sessionOf(this.environment)
        const env = state.envOf(this.environment.name)
        const lang = lateLang(options?.moduleType)
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
            lang,
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
        // TODO(dead-code namespaces): see `namespaceMemberAtRisk`
        if (lang !== 'jsx' && out.code !== code) {
          const at = namespaceMemberAtRisk(code, lang)
          if (at !== null) {
            if (env.type === 'server') {
              // (as before TypeScript was read: the server keeps its code)
              return null
            }
            this.error(
              `[tanstack-start] ${identify(id).path}: a namespace exports several names in one statement (or a destructuring pattern), and the compiler cannot yet keep such members that only code removed for the client reads. Declare each exported member of the namespace in a statement of its own (\`export const a = …\`).`,
              at,
            )
          }
        }
        // (a watch build rebuilds the module when a file its plan read
        // changes: the module graph misses an import the compile erased)
        watchDependencies(this, out, identify(id).path)
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
 * The language the late pass reads a module's code as: the module type the
 * bundler parses it as (`ts` from a plugin compiling another language to
 * TypeScript), JSX for JavaScript or a module type that is no script (the
 * compile then fails to parse it, and `bundlerParses` decides).
 */
function lateLang(moduleType: string | undefined) {
  return moduleType === 'ts' || moduleType === 'tsx' ? moduleType : 'jsx'
}

/**
 * TODO(dead-code namespaces): the dead-code elimination removes a
 * namespace's exported declarator or pattern leaf that only erased code
 * reads when its statement declares several (`export const a = 1, b = 2`,
 * `export const { c, d } = …`; one alone is kept), in any module: the
 * namespace's member is then undefined. A late-pass module read as
 * TypeScript was refused at its parse before; one holding such a statement
 * still fails the client build when its compile changed it. The offset of
 * the first such statement, or null. Drop this when namespaces are fixed.
 */
function namespaceMemberAtRisk(
  code: string,
  lang: 'ts' | 'tsx',
): number | null {
  // (a namespace declaration is written with its keyword)
  if (!/\b(?:namespace|module)\b/.test(code)) {
    return null
  }
  const parsed = parseModule(code, {
    lang,
    sourceType: 'module',
    semantic: false,
  })
  if (!parsed.ok) {
    return null
  }
  type Statement = {
    type: string
    start: number
    declaration?: Statement | null
    declarations?: Array<{ id: { type: string } }>
    body?: { type: string; body?: Array<Statement> }
  }
  const visit = (statements: ReadonlyArray<Statement>): number | null => {
    for (const statement of statements) {
      const namespace =
        statement.type === 'ExportNamedDeclaration'
          ? statement.declaration
          : statement
      if (
        namespace?.type !== 'TSModuleDeclaration' ||
        namespace.body?.type !== 'TSModuleBlock'
      ) {
        continue
      }
      for (const member of namespace.body.body ?? []) {
        const declarators =
          member.type === 'ExportNamedDeclaration' &&
          member.declaration?.type === 'VariableDeclaration'
            ? (member.declaration.declarations ?? [])
            : []
        if (
          declarators.length > 1 ||
          declarators.some((d) => d.id.type !== 'Identifier')
        ) {
          return member.start
        }
      }
      const nested = visit(namespace.body.body ?? [])
      if (nested !== null) {
        return nested
      }
    }
    return null
  }
  return visit(parsed.file.program.body as unknown as Array<Statement>)
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
