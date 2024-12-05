import { describe, expect, it, vi } from 'vitest'
import {
  checkFileExists,
  checkFolderExists,
  checkFolderIsEmpty,
} from '../../../../src/utils/helpers/base-utils'
import fs from 'node:fs/promises'
import type { Dirent } from 'node:fs'

vi.mock('node:fs/promises')

describe('base-utils', () => {
  describe('checkFileExists', () => {
    it('returns true for existing file', async () => {
      vi.mocked(fs.access).mockResolvedValueOnce()
      const result = await checkFileExists('existing.txt')
      expect(result).toBe(true)
    })

    it('returns false for non-existent file', async () => {
      vi.mocked(fs.access).mockRejectedValueOnce(new Error())
      const result = await checkFileExists('non-existent.txt')
      expect(result).toBe(false)
    })
  })

  describe('checkFolderExists', () => {
    it('returns true for existing folder', async () => {
      vi.mocked(fs.access).mockResolvedValueOnce()
      const result = await checkFolderExists('existing-folder')
      expect(result).toBe(true)
    })

    it('returns false for non-existent folder', async () => {
      vi.mocked(fs.access).mockRejectedValueOnce(new Error())
      const result = await checkFolderExists('non-existent-folder')
      expect(result).toBe(false)
    })
  })

  describe('checkFolderIsEmpty', () => {
    it('returns true for empty folder', async () => {
      vi.mocked(fs.readdir).mockResolvedValueOnce([])
      const result = await checkFolderIsEmpty('empty-folder')
      expect(result).toBe(true)
    })

    it('returns false for non-empty folder', async () => {
      const mockDirents = [
        { name: 'file1.txt' } as Dirent,
        { name: 'file2.txt' } as Dirent,
      ]
      vi.mocked(fs.readdir).mockResolvedValueOnce(mockDirents)
      const result = await checkFolderIsEmpty('non-empty-folder')
      expect(result).toBe(false)
    })

    it('returns false when folder does not exist', async () => {
      vi.mocked(fs.readdir).mockRejectedValueOnce(new Error())
      const result = await checkFolderIsEmpty('non-existent-folder')
      expect(result).toBe(false)
    })
  })
})
