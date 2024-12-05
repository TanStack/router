import { describe, expect, it, vi, beforeEach } from 'vitest'
import createPackageJson from '../../../src/modules/createPackageJson'
import { initHelpers } from '../../../src/utils/helpers'
import addDependencies from '../../../src/modules/addDependencies'
import addScripts from '../../../src/modules/addScripts'
import { input } from '@inquirer/prompts'

vi.mock('../../../src/utils/helpers', () => ({
  initHelpers: vi.fn(),
}))

vi.mock('@inquirer/prompts', () => ({
  input: vi.fn(),
}))

vi.mock('../../../src/modules/addDependencies')
vi.mock('../../../src/modules/addScripts')

describe('createPackageJson', () => {
  const mockHelpers = {
    targetFileExists: vi.fn(),
    readTargetFile: vi.fn(),
    writeTargetfile: vi.fn(),
    copyTemplateFiles: vi.fn(),
    getTemplateFilesThatWouldBeOverwritten: vi.fn(),
    getFullModulePath: vi.fn(),
    getFullTargetPath: vi.fn(),
    targetFolderExists: vi.fn(),
    moduleFileExists: vi.fn(),
    absoluteModuleFolder: '/mock/module',
    absoluteTargetFolder: '/mock/target',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(initHelpers).mockReturnValue(mockHelpers)
    vi.mocked(input).mockResolvedValue('test-project')
  })

  describe('promptFn', () => {
    it('should use provided name if exists', async () => {
      const state = { name: 'provided-name' }
      const result = await createPackageJson._prompt({
        state,
        targetPath: '/mock/path',
      })
      expect(result.name).toBe('provided-name')
      expect(input).not.toHaveBeenCalled()
    })

    it('should prompt for name if not provided', async () => {
      const state = {}
      await createPackageJson._prompt({ state, targetPath: '/mock/path' })
      expect(input).toHaveBeenCalled()
    })
  })

  describe('applyFn', () => {
    it('should create package.json with correct structure', async () => {
      const state = {
        name: 'test-project',
      }

      await createPackageJson._apply({ state, targetPath: '/mock/path' })

      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"name": "test-project"'),
        false,
      )

      const calls = mockHelpers.writeTargetfile.mock.calls
      const writtenContent = calls?.[0]?.[1] ?? ''
      const parsed = JSON.parse(writtenContent)
      expect(parsed).toEqual({
        name: 'test-project',
        version: '0.0.0',
        private: true,
        type: 'module',
      })
    })

    it('should call addScripts with provided scripts', async () => {
      const state = {
        name: 'test-project',
        scripts: [{ name: 'test', script: 'vitest' }],
      }

      await createPackageJson._apply({ state, targetPath: '/mock/path' })

      expect(addScripts._apply).toHaveBeenCalledWith({
        state: { scripts: state.scripts },
        targetPath: '/mock/path',
      })
    })

    it('should call addDependencies with provided dependencies', async () => {
      const state = {
        name: 'test-project',
        dependencies: [{ name: 'dep', version: '1.0.0' }],
        devDependencies: [{ name: 'dev-dep', version: '1.0.0' }],
      }

      await createPackageJson._apply({ state, targetPath: '/mock/path' })

      expect(addDependencies._apply).toHaveBeenCalledWith({
        state: {
          dependencies: state.dependencies,
          devDependencies: state.devDependencies,
        },
        targetPath: '/mock/path',
      })
    })
  })
})
