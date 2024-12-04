import { describe, expect, it, vi, beforeEach } from 'vitest'
import packageManager from '../../../src/modules/packageManager'
import { select } from '@inquirer/prompts'
import { install } from '../../../src/utils/runPackageManagerCommand'
import { getPackageManager } from '../../../src/utils/getPackageManager'

vi.mock('@inquirer/prompts', () => ({
  select: vi.fn(),
}))

vi.mock('../../../src/utils/runPackageManagerCommand', () => ({
  install: vi.fn(),
}))

vi.mock('../../../src/utils/getPackageManager', () => ({
  getPackageManager: vi.fn(),
}))

describe('packageManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(select).mockResolvedValue('npm')
    vi.mocked(getPackageManager).mockReturnValue('npm')
  })

  describe('initFn', () => {
    it('should detect current package manager', async () => {
      vi.mocked(getPackageManager).mockReturnValue('yarn')
      const config = {}
      const result = await packageManager._init({
        cfg: config,
        targetPath: '/mock/path',
      })
      expect(result.packageManager).toBe('yarn')
    })

    it('should use provided package manager if specified', async () => {
      const config = { packageManager: 'pnpm' as const }
      const result = await packageManager._init({
        cfg: config,
        targetPath: '/mock/path',
      })
      expect(result.packageManager).toBe('pnpm')
    })
  })

  describe('promptFn', () => {
    it('should use provided package manager if exists', async () => {
      const state = { packageManager: 'yarn' as const }
      const result = await packageManager._prompt({
        state,
        targetPath: '/mock/path',
      })
      expect(result.packageManager).toBe('yarn')
      expect(select).not.toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Select a package manager' }),
      )
    })

    it('should prompt for package manager if not provided', async () => {
      const state = {}
      await packageManager._prompt({ state, targetPath: '/mock/path' })
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Select a package manager' }),
      )
    })

    it('should prompt for dependency installation', async () => {
      const state = { packageManager: 'npm' as const }
      await packageManager._prompt({ state, targetPath: '/mock/path' })
      expect(select).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'Install dependencies' }),
      )
    })
  })

  describe('applyFn', () => {
    it('should install dependencies if requested', async () => {
      const state = { packageManager: 'npm' as const, installDeps: true }
      await packageManager._apply({ state, targetPath: '/mock/path' })
      expect(install).toHaveBeenCalledWith('npm', '/mock/path')
    })

    it('should skip installation if not requested', async () => {
      const state = { packageManager: 'npm' as const, installDeps: false }
      await packageManager._apply({ state, targetPath: '/mock/path' })
      expect(install).not.toHaveBeenCalled()
    })
  })
})
