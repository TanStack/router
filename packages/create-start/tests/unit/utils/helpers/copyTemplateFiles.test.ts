import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  createCopyTemplateFiles,
  createGetTemplateFilesThatWouldBeOverwritten,
} from '../../../../src/utils/helpers/copyTemplateFiles'
import fastGlob from 'fast-glob'
import * as path from 'node:path'
import fs from 'node:fs/promises'

vi.mock('fast-glob')
vi.mock('node:fs/promises')
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path')
  return {
    ...actual,
    resolve: vi.fn((...parts) => parts.join('/')),
  }
})

describe('copyTemplateFiles', () => {
  const mockCtx = {
    getFullModulePath: vi.fn((path) => `/mock/module/${path}`),
    getFullTargetPath: vi.fn((path) => `/mock/target/${path}`),
    targetFileExists: vi.fn(),
    moduleFileExists: vi.fn(),
    absoluteModuleFolder: '/mock/module',
    absoluteTargetFolder: '/mock/target',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createCopyTemplateFiles', () => {
    it('copies single file successfully', async () => {
      const copyTemplateFiles = createCopyTemplateFiles({
        ctx: mockCtx,
        modulePath: '/mock/module',
        targetPath: '/mock/target',
      })

      vi.mocked(fastGlob.glob).mockResolvedValueOnce(['file.txt'])
      vi.mocked(fs.stat).mockResolvedValueOnce({
        isDirectory: () => false,
      } as any)
      vi.mocked(fs.readFile).mockResolvedValueOnce('content')

      await copyTemplateFiles({
        file: '*.txt',
        templateFolder: 'templates',
        targetFolder: 'target',
        overwrite: false,
      })

      expect(fs.copyFile).toHaveBeenCalled()
    })

    it('throws error when overwriting without permission', async () => {
      const copyTemplateFiles = createCopyTemplateFiles({
        ctx: mockCtx,
        modulePath: '/mock/module',
        targetPath: '/mock/target',
      })

      vi.mocked(fastGlob.glob).mockResolvedValueOnce(['existing.txt'])
      mockCtx.targetFileExists.mockResolvedValueOnce(true)

      await expect(
        copyTemplateFiles({
          file: '*.txt',
          templateFolder: 'templates',
          targetFolder: 'target',
          overwrite: false,
        }),
      ).rejects.toThrow()
    })

    it('removes ts-nocheck header when copying files', async () => {
      const copyTemplateFiles = createCopyTemplateFiles({
        ctx: mockCtx,
        modulePath: '/mock/module',
        targetPath: '/mock/target',
      })

      vi.mocked(fastGlob.glob).mockResolvedValueOnce(['file.ts'])
      vi.mocked(fs.stat).mockResolvedValueOnce({
        isDirectory: () => false,
      } as any)
      vi.mocked(fs.readFile).mockResolvedValueOnce('// @ts-nocheck\ncontent')

      await copyTemplateFiles({
        file: '*.ts',
        templateFolder: 'templates',
        targetFolder: 'target',
        overwrite: false,
      })

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.not.stringContaining('// @ts-nocheck'),
      )
    })
  })

  describe('createGetTemplateFilesThatWouldBeOverwritten', () => {
    it('returns files that would be overwritten', async () => {
      const getTemplateFilesThatWouldBeOverwritten =
        createGetTemplateFilesThatWouldBeOverwritten({
          ctx: mockCtx,
          modulePath: '/mock/module',
          targetPath: '/mock/target',
        })

      vi.mocked(fastGlob.glob).mockResolvedValueOnce(['existing.txt'])
      mockCtx.targetFileExists.mockResolvedValueOnce(true)

      const result = await getTemplateFilesThatWouldBeOverwritten({
        file: '*.txt',
        templateFolder: 'templates',
        targetFolder: 'target',
        overwrite: false,
      })

      expect(result).toContain('existing.txt')
    })

    it('returns array of files that would be overwritten', async () => {
      const getTemplateFilesThatWouldBeOverwritten =
        createGetTemplateFilesThatWouldBeOverwritten({
          ctx: mockCtx,
          modulePath: '/mock/module',
          targetPath: '/mock/target',
        })

      vi.mocked(fastGlob.glob).mockResolvedValueOnce(['test.txt', 'other.txt'])
      mockCtx.targetFileExists.mockResolvedValueOnce(true)
      mockCtx.targetFileExists.mockResolvedValueOnce(true)

      const result = await getTemplateFilesThatWouldBeOverwritten({
        file: '*.txt',
        templateFolder: 'templates',
        targetFolder: 'target',
        overwrite: false,
      })

      expect(result).toEqual(['test.txt', 'other.txt'])
    })
  })
})
