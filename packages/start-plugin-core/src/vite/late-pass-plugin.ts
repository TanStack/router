import { ASSET_QUERY_RE } from '@tanstack/router-utils/compiler'
import { TRANSFORM_ID_REGEX } from '../constants'
import { scriptTransform } from './script-transform'
import type { Plugin } from 'vite'
import type { ViteCompilerState } from './compiler-state'
import type { TransformHandler } from './script-transform'

/** Files that are no code: a pattern can reach them, and nothing compiles them. */
export const ASSET_FILE_RE =
  /\.(?:css|scss|sass|less|styl|stylus|pcss|postcss|json|json5|yaml|yml|toml|html|svg|png|jpe?g|gif|webp|avif|ico|bmp|woff2?|ttf|otf|eot|mp[34]|webm|ogg|wav|flac|aac|pdf|txt|wasm|zip)(?:\?|$)/i

/** Ids the late import-protection pass never compiles (not code, or served by the pre plugin). */
const LATE_PASS_EXCLUDE: Array<RegExp> = [
  ...TRANSFORM_ID_REGEX,
  /^\0/,
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
  // (one handler per environment)
  const handlers = new Map<string, TransformHandler | null>()
  const handlerOf = (name: string) => {
    let handler = handlers.get(name)
    if (handler === undefined) {
      const env = state.envOf(name)
      handler = env ? scriptTransform(state, env, 'late') : null
      handlers.set(name, handler)
    }
    return handler
  }
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
      handler(code, id, options) {
        const handler = handlerOf(this.environment.name)
        return handler ? handler.call(this, code, id, options) : null
      },
    },
  }
}
