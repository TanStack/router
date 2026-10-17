/**
 * The test transforms given to the Start plugin's `compilerTransforms` hook
 * (`StartCompilerImportTransform`, src/types.ts).
 *
 * This is the ONLY test file that binds to the AST shape the hook hands to a
 * transform (today Babel's: `candidate.path.node`, `context.types`,
 * `context.parseExpression`). A compiler rewrite that changes that shape
 * adapts this file alone; every test uses these transforms through their
 * observable effect (the injected argument, the warning), never through the
 * AST.
 */
import type { StartCompilerImportTransform } from '../src/types'

/**
 * An external import transform (`compilerTransforms`), shaped like the RSC
 * CSS transform: on the server, it injects `{ injected: loadThing() }` as
 * the second argument of each direct call of `renderThing` from
 * `@example/runtime` given one argument.
 */
export const renderThingTransform: StartCompilerImportTransform = {
  name: 'test-render-option-injection',
  environment: 'server',
  imports: [{ libName: '@example/runtime', rootExport: 'renderThing' }],
  detect: /\brenderThing\b/,
  transform: (candidates, context) => {
    const t = context.types
    for (const candidate of candidates) {
      const args = candidate.path.node.arguments
      if (args.length !== 1) {
        continue
      }
      args.push(
        t.objectExpression([
          t.objectProperty(
            t.identifier('injected'),
            context.parseExpression('loadThing()'),
          ),
        ]),
      )
    }
  },
}

/**
 * A server transform of `warnMe()` calls from `warn-lib` that warns about
 * each call it cannot handle (one with an argument).
 */
export const warnMeTransform: StartCompilerImportTransform = {
  name: 'test-warning-transform',
  environment: 'server',
  imports: [{ libName: 'warn-lib', rootExport: 'warnMe' }],
  detect: /\bwarnMe\b/,
  transform: (candidates, context) => {
    for (const candidate of candidates) {
      if (candidate.path.node.arguments.length > 0) {
        context.warn?.(`MARK_WARNING: cannot handle warnMe() in ${context.id}`)
      }
    }
  },
}
