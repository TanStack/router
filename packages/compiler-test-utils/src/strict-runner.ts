/**
 * Vite's module runner (server code in a dev server's environment) with ES
 * module linking semantics for named imports (coupling N9; RULES-AUDIT §2.D
 * #4): a static import of a name the imported module does not export throws
 * a `SyntaxError`, as in Node.js, a browser and a production build
 * (Rolldown's `MISSING_EXPORT`), instead of reading `undefined`.
 *
 * Vite's runner checks that only for externalized modules (Node.js
 * packages): an inlined module (any module of the app, or a virtual
 * module a plugin serves) is evaluated from its SSR transform, whose named
 * imports read properties of the imported namespace. This adapter wraps the
 * runner's own evaluator (`ModuleRunner.evaluator`, public): every module
 * still resolves, loads, transforms and evaluates through Vite, by the
 * importee's resolved id; only the check is added, and only to the imports
 * of the app's modules (files under `root`, outside `node_modules`, with
 * any query: what the compilers under test emit for the app's files) and
 * of the virtual modules they import (a compiler's support module, through
 * any chain of virtual modules). The modules of the app's dependencies (e.g. a framework plugin's runtime and
 * the virtual modules it imports) keep Vite's dev semantics, which their
 * plugins rely on; a production build links them (Rolldown's
 * `MISSING_EXPORT`). A module still being evaluated (an import cycle) is
 * not checked yet: its namespace is complete once Vite seals it at the end
 * of its evaluation.
 *
 * Contract test: tests/strict-runner.test.ts.
 */
import path from 'node:path'
import { ESModulesEvaluator, ssrImportKey } from 'vite/module-runner'
import type {
  ModuleEvaluator,
  ModuleRunner,
  ModuleRunnerContext,
} from 'vite/module-runner'

const strict = new WeakSet<ModuleEvaluator>()

/** The names a static import or re-export reads (Vite's import metadata). */
interface ImportMetadata {
  importedNames?: Array<string>
  isDynamicImport?: boolean
}

/** Throws as an ES module link would when `namespace` lacks a name. */
function checkImportedNames(
  namespace: unknown,
  specifier: string,
  metadata: ImportMetadata | undefined,
) {
  if (
    metadata?.isDynamicImport ||
    !metadata?.importedNames?.length ||
    typeof namespace !== 'object' ||
    namespace === null ||
    // Still evaluating (a cycle): Vite seals a namespace once its module
    // ran
    !Object.isSealed(namespace)
  ) {
    return
  }
  for (const name of metadata.importedNames) {
    if (!(name in namespace)) {
      throw new SyntaxError(
        `The requested module '${specifier}' does not provide an export named '${name}'`,
      )
    }
  }
}

/** Whether a module (by its file) is one of the app's (see the module comment). */
function isAppModule(file: string | undefined, root: string) {
  if (!file) {
    return false
  }
  const relative = path.relative(root, file.replace(/[?#].*$/, ''))
  return (
    relative !== '' &&
    !relative.startsWith('..') &&
    !path.isAbsolute(relative) &&
    !relative.split(path.sep).includes('node_modules')
  )
}

/** Whether a module is a virtual one (a plugin's id, no file on disk). */
function isVirtualModule(module: { id: string; file?: string | null }) {
  return module.id.startsWith('\0') || !path.isAbsolute(module.file ?? '')
}

/**
 * An evaluator running inlined modules with the named-import check on the
 * imports of the app's modules (under `root`).
 */
export function strictEvaluator(
  root: string,
  inner: ModuleEvaluator = new ESModulesEvaluator(),
): ModuleEvaluator {
  if (strict.has(inner)) {
    return inner
  }
  // The modules whose imports are checked, by id
  const checked = new Set<string>()
  const evaluator: ModuleEvaluator = {
    startOffset: inner.startOffset,
    runExternalModule: (file) => inner.runExternalModule(file),
    runInlinedModule: (context, code, module) => {
      if (
        !isAppModule(module.file, root) &&
        !(
          isVirtualModule(module) &&
          [...module.importers].some((importer) => checked.has(importer))
        )
      ) {
        return inner.runInlinedModule(context, code, module)
      }
      checked.add(module.id)
      const request = context[ssrImportKey] as (
        specifier: string,
        metadata?: ImportMetadata,
      ) => Promise<unknown>
      const checkedContext = {
        ...context,
        [ssrImportKey]: async (
          specifier: string,
          metadata?: ImportMetadata,
        ) => {
          const namespace = await request(specifier, metadata)
          checkImportedNames(namespace, specifier, metadata)
          return namespace
        },
      } as ModuleRunnerContext
      return inner.runInlinedModule(checkedContext, code, module)
    },
  }
  strict.add(evaluator)
  return evaluator
}

/**
 * Makes `runner` check the named imports of the app's modules (under
 * `root`; idempotent; see the module comment).
 */
export function makeRunnerStrict(
  runner: ModuleRunner,
  root: string,
): ModuleRunner {
  runner.evaluator = strictEvaluator(root, runner.evaluator)
  return runner
}
