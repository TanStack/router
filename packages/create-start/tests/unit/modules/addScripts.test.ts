import { describe, expect, it, vi, beforeEach } from 'vitest'
import addScripts from '../../../src/modules/addScripts'
import { initHelpers } from '../../../src/utils/helpers'

vi.mock('../../../src/utils/helpers', () => ({
  initHelpers: vi.fn(),
}))

describe('addScripts', () => {
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
  })

  describe('applyFn', () => {
    const mockPackageJson = {
      name: 'test-project',
      scripts: {
        'existing-script': 'echo "existing"',
      },
    }

    beforeEach(() => {
      mockHelpers.targetFileExists.mockResolvedValue(true)
      mockHelpers.readTargetFile.mockResolvedValue(
        JSON.stringify(mockPackageJson),
      )
      mockHelpers.writeTargetfile.mockResolvedValue(undefined)
    })

    it('should add scripts to package.json', async () => {
      const state = {
        scripts: [
          { name: 'test', script: 'vitest' },
          { name: 'build', script: 'tsc' },
        ],
      }

      await addScripts._apply({ state, targetPath: '/mock/path' })

      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"test": "vitest"'),
        true,
      )
      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"build": "tsc"'),
        true,
      )
    })

    it('should merge with existing scripts', async () => {
      const state = {
        scripts: [{ name: 'test', script: 'vitest' }],
      }

      await addScripts._apply({ state, targetPath: '/mock/path' })

      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"existing-script": "echo \\"existing\\""'),
        true,
      )
      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"test": "vitest"'),
        true,
      )
    })

    it('should handle empty scripts array', async () => {
      const state = {}

      await addScripts._apply({ state, targetPath: '/mock/path' })

      const calls = mockHelpers.writeTargetfile.mock.calls
      if (calls && calls[0]) {
        const writtenJson = JSON.parse(calls[0][1])
        expect(writtenJson).toEqual(mockPackageJson)
      }
    })

    it('should throw error if package.json doesnt exist', async () => {
      mockHelpers.targetFileExists.mockResolvedValue(false)

      const state = {
        scripts: [{ name: 'test', script: 'vitest' }],
      }

      await expect(
        addScripts._apply({ state, targetPath: '/mock/path' }),
      ).rejects.toThrow("The package.json file doesn't exist")
    })

    it('should override existing scripts with same name', async () => {
      const state = {
        scripts: [
          { name: 'existing-script', script: 'new command' },
          { name: 'test', script: 'vitest' },
        ],
      }

      await addScripts._apply({ state, targetPath: '/mock/path' })

      const calls = mockHelpers.writeTargetfile.mock.calls
      if (calls && calls[0]) {
        const writtenJson = JSON.parse(calls[0][1])
        expect(writtenJson.scripts['existing-script']).toBe('new command')
        expect(writtenJson.scripts['test']).toBe('vitest')
      }
    })
  })
})
