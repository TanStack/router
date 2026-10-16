/**
 * Evaluates the mocks import protection serves in place of a denied module,
 * through the same pipeline the plugins use (the names an importer uses from
 * a denied source → a mock-edge module importing the mock runtime, or the
 * self-contained mock of a denied file), linked as real ES modules
 * (`@tanstack/compiler-test-utils/module-linker`). Tests then assert what an
 * importer gets, not the generated code.
 */
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import {
  getMockExportNamesBySource,
  getNamedExports,
} from '../../src/import-protection/analysis'
import { MOCK_MODULE_ID } from '../../src/import-protection/constants'
import {
  generateSelfContainedMockModule,
  makeMockEdgeModuleId,
} from '../../src/import-protection/virtualModules'
import {
  loadResolvedVirtualModule,
  resolveInternalVirtualModuleId,
} from '../../src/vite/import-protection-plugin/virtualModules'
import type { ModuleStub } from '@tanstack/compiler-test-utils/module-linker'

/** What a mock returns when it is converted to a primitive. */
const mockText = '[import-protection mock]'

/** Whether `value` is a mock of import protection (or one of its members). */
export function isMock(value: unknown): boolean {
  return typeof value === 'function' && String(value) === mockText
}

/**
 * Evaluates `importer` with the denied import `source` replaced by the mock
 * edge import protection serves for it: a module exporting a mock for each
 * name the importer uses from `source` (and a default export), all members of
 * the mock runtime `runtimeId` (default: the silent mock). Other imports link
 * to `stubs` (by specifier) or fail to link. Returns the importer's namespace.
 */
export async function evaluateWithMock(
  importer: string,
  source: string,
  options: {
    /** Id the importer is analysed and evaluated under. */
    id?: string
    stubs?: Record<string, ModuleStub>
    runtimeId?: string
  } = {},
): Promise<Record<string, any>> {
  const id = options.id ?? '/test/src/importer.ts'
  const names = getMockExportNamesBySource(importer, id).get(source) ?? []
  const edgeId = resolveInternalVirtualModuleId(
    makeMockEdgeModuleId(names, options.runtimeId ?? MOCK_MODULE_ID),
  )!
  const graph = createModuleGraph({
    modules: { [id]: importer },
    stubs: options.stubs,
    resolve: (specifier) =>
      specifier === source ? edgeId : resolveInternalVirtualModuleId(specifier),
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
  const mockId = '/test/self-mock.js'
  return createModuleGraph({
    modules: {
      [mockId]: generateSelfContainedMockModule(getNamedExports(code, id)).code,
    },
  }).import(mockId)
}
