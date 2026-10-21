/**
 * Evaluators of the mock modules import protection generates, through the
 * same internal pipeline the plugins use (the names an importer uses from a
 * denied source -> a mock-edge module importing the mock runtime, or the
 * self-contained mock of a denied file), linked as ES modules
 * (`@tanstack/compiler-test-utils/module-linker`). They call the
 * implementation's analysis and generators directly, so only implementation
 * tests use them; the corpus judges a mock through a real consumer of the
 * public plugin (`mock-helpers.ts`, `probeMock`).
 */
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import {
  getMockExportNamesBySource,
  getNamedExports,
} from '../../src/import-protection/analysis'
import { MOCK_MODULE_ID } from '../../src/import-protection/constants'
import {
  generateDevSelfDenialModule,
  generateSelfContainedMockModule,
  makeMockEdgeModuleId,
} from '../../src/import-protection/virtualModules'
import {
  loadResolvedVirtualModule,
  resolveInternalVirtualModuleId,
} from '../../src/vite/import-protection-plugin/virtualModules'
import type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'

/**
 * Evaluates `importer` with each denied import `source` (one specifier or
 * several) replaced by the mock edge import protection serves for it: a
 * module exporting a mock for each name the importer uses from that source
 * (and a default export), all members of the mock runtime `runtimeId`
 * (default: the silent mock). Other imports link to `stubs` (by specifier) or
 * fail to link. Returns the importer's namespace.
 */
export async function evaluateWithMock(
  importer: string,
  source: string | Array<string>,
  options: {
    /** Id the importer is analysed and evaluated under. */
    id?: string
    stubs?: Record<string, ModuleStub>
    runtimeId?: string
  } = {},
): Promise<Record<string, any>> {
  const id = options.id ?? '/test/src/importer.ts'
  const namesBySource = getMockExportNamesBySource(importer, id)
  const edgeIds = new Map(
    (Array.isArray(source) ? source : [source]).map((denied) => [
      denied,
      mockEdgeId(namesBySource.get(denied) ?? [], options.runtimeId),
    ]),
  )
  const graph = createModuleGraph({
    modules: { [id]: importer },
    stubs: options.stubs,
    resolve: (specifier) =>
      edgeIds.get(specifier) ?? resolveInternalVirtualModuleId(specifier),
    load: (virtualId) => loadResolvedVirtualModule(virtualId)?.code,
  })
  return graph.import(id)
}

/**
 * Evaluates the self-contained mock import protection serves for a denied
 * file in place of the file itself, generated from the names the file
 * exports (`code`, analysed under `id`). Returns the mock's namespace.
 */
export async function selfMock(
  code: string,
  id = '/test/src/denied.server.ts',
): Promise<Record<string, any>> {
  return evaluateMockModule(
    generateSelfContainedMockModule(getNamedExports(code, id)).code,
  )
}

/**
 * Evaluates each kind of mock module import protection generates for the
 * export names `names` and returns its namespace: the self-contained mock of
 * a denied file, the mock edge of a denied import (for an importer using
 * `names`) and the module dev serves in place of a denied file exporting
 * `names`, the last two importing the silent mock runtime.
 */
export const mockModules: Record<
  'self-contained mock' | 'mock edge' | 'dev self-denial module',
  (names: Array<string>) => Promise<Record<string, any>>
> = {
  'self-contained mock': (names) =>
    evaluateMockModule(generateSelfContainedMockModule(names).code),
  'mock edge': (names) =>
    evaluateMockModule(loadResolvedVirtualModule(mockEdgeId(names))!.code),
  'dev self-denial module': (names) =>
    evaluateMockModule(generateDevSelfDenialModule(names, MOCK_MODULE_ID).code),
}

/** Resolved id of the mock edge exporting `names` as members of `runtimeId`. */
function mockEdgeId(names: Array<string>, runtimeId = MOCK_MODULE_ID) {
  return resolveInternalVirtualModuleId(makeMockEdgeModuleId(names, runtimeId))!
}

/**
 * Evaluates a generated mock module as an ES module; what it imports links
 * to the virtual modules import protection serves (the mock runtime).
 */
export function evaluateMockModule(code: string): Promise<Record<string, any>> {
  const mockId = '/test/mock.js'
  return createModuleGraph({
    modules: { [mockId]: code },
    resolve: (specifier) => resolveInternalVirtualModuleId(specifier),
    load: (virtualId) => loadResolvedVirtualModule(virtualId)?.code,
  }).import(mockId)
}
