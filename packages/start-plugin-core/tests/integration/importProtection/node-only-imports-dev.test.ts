/**
 * An app module importing a package the client cannot resolve, on Start's
 * Vite dev server (client code in a browser page): import protection reads
 * the import as one it couldn't resolve (no file rule judges it, a specifier
 * rule does). What the client keeps only as a type is erased: the page
 * loads the module and none of the package; a specifier rule denying the
 * package serves the mock and reports the importer. The cases:
 * node-only-imports-cases.ts.
 */
import { loadedModulesExpression } from '@tanstack/compiler-test-utils/importers'
import { describe, expect, test } from 'vitest'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { violationRecorder } from '../../importProtection/start-apps'
import { runViteClient, startBrowserStartDevServer } from './client-pages'
import {
  deniedPackage,
  nodeOnlyMark,
  nodeOnlyPackage,
  typeRemainder,
  valueRemainder,
} from './node-only-imports-cases'
import { importersIn } from './v2-hosts'

const timeout = 60_000

describe('vite dev', () => {
  test(
    'an import the client keeps only as a type: the module loads, with none of the package',
    async () => {
      const server = await startBrowserStartDevServer({
        files: { ...nodeOnlyPackage, 'src/entry.ts': typeRemainder },
      })
      const { result } = await runViteClient(
        server,
        '/src/entry.ts',
        `return { show: typeof entry.show, loaded: ${loadedModulesExpression} }`,
      )
      expect(result).toEqual({ show: 'function', loaded: [] })
    },
    timeout,
  )

  test(
    'a specifier rule denying the package judges the kept import: the mock is served and the importer reported',
    async () => {
      const recorder = violationRecorder({ ...deniedPackage, behavior: 'mock' })
      const server = await startBrowserStartDevServer({
        files: { ...nodeOnlyPackage, 'src/entry.ts': valueRemainder },
        start: { importProtection: recorder.importProtection },
      })
      const { result } = await runViteClient(
        server,
        '/src/entry.ts',
        `${describeValuePrelude}return { show: describeValue(entry.show(), ${JSON.stringify(nodeOnlyMark)}), loaded: ${loadedModulesExpression} }`,
      )
      await server.idle()
      expect({
        result,
        reported: importersIn({ root: server.root, ...recorder }, 'client'),
      }).toEqual({
        result: { show: 'a safe mock', loaded: [] },
        reported: ['src/entry.ts'],
      })
    },
    timeout,
  )
})
