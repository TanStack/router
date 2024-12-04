import { describe, expect, it, vi, beforeEach } from 'vitest'
import addDependencies from '../../../src/modules/addDependencies'
import { initHelpers } from '../../../src/utils/helpers'
import fs from 'node:fs/promises'

vi.mock('../../../src/utils/helpers', () => ({
  initHelpers: vi.fn(),
}))

describe('addDependencies', () => {
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
      dependencies: {
        'existing-dep': '1.0.0',
      },
      devDependencies: {
        'existing-dev-dep': '1.0.0',
      },
    }

    beforeEach(() => {
      mockHelpers.targetFileExists.mockResolvedValue(true)
      mockHelpers.readTargetFile.mockResolvedValue(
        JSON.stringify(mockPackageJson),
      )
      mockHelpers.writeTargetfile.mockResolvedValue(undefined)
    })

    it('should add dependencies to package.json', async () => {
      const state = {
        dependencies: [
          { name: 'new-dep', version: '1.0.0' },
          { name: 'another-dep', version: '2.0.0' },
        ],
      }

      await addDependencies._apply({ state, targetPath: '/mock/path' })

      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"new-dep": "1.0.0"'),
        true,
      )
      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"another-dep": "2.0.0"'),
        true,
      )
    })

    it('should add devDependencies to package.json', async () => {
      const state = {
        devDependencies: [
          { name: 'new-dev-dep', version: '1.0.0' },
          { name: 'another-dev-dep', version: '2.0.0' },
        ],
      }

      await addDependencies._apply({ state, targetPath: '/mock/path' })

      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"new-dev-dep": "1.0.0"'),
        true,
      )
      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"another-dev-dep": "2.0.0"'),
        true,
      )
    })

    it('should merge with existing dependencies', async () => {
      const state = {
        dependencies: [{ name: 'new-dep', version: '1.0.0' }],
      }

      await addDependencies._apply({ state, targetPath: '/mock/path' })

      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"existing-dep": "1.0.0"'),
        true,
      )
      expect(mockHelpers.writeTargetfile).toHaveBeenCalledWith(
        './package.json',
        expect.stringContaining('"new-dep": "1.0.0"'),
        true,
      )
    })

    it('should handle empty dependencies array', async () => {
      const state = {}

      await addDependencies._apply({ state, targetPath: '/mock/path' })

      const calls = mockHelpers.writeTargetfile.mock.calls
      if (calls && calls[0]) {
        const writtenJson = JSON.parse(calls[0][1])
        expect(writtenJson).toEqual(mockPackageJson)
      }
    })

    it('should throw error if package.json doesnt exist', async () => {
      mockHelpers.targetFileExists.mockResolvedValue(false)

      const state = {
        dependencies: [{ name: 'new-dep', version: '1.0.0' }],
      }

      try {
        await addDependencies._apply({ state, targetPath: '/mock/path' })
        throw new Error('Should have thrown')
      } catch (error: any) {
        expect(error.message).toBe(
          "Invariant failed: The package.json file doesn't exist",
        )
      }
    })
  })
})
