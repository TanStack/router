import { describe, expect, it, vi, beforeEach } from 'vitest'
import { runCmd, initGit } from '../../../src/utils/runCmd'
import spawn from 'cross-spawn'

vi.mock('cross-spawn')

describe('runCmd and initGit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runCmd', () => {
    it('should successfully execute command', async () => {
      const mockChild = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0)
        }),
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
      }

      vi.mocked(spawn).mockReturnValue(mockChild as any)

      await expect(runCmd('test', ['arg1', 'arg2'])).resolves.toBeUndefined()

      expect(spawn).toHaveBeenCalledWith('test', ['arg1', 'arg2'], {
        env: expect.any(Object),
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: undefined,
      })
    })

    it('should handle command errors', async () => {
      const mockChild = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(1)
        }),
        stderr: { on: vi.fn((_, cb) => cb('error')) },
        stdout: { on: vi.fn((_, cb) => cb('output')) },
      }

      vi.mocked(spawn).mockReturnValue(mockChild as any)

      await expect(runCmd('test', ['arg'])).rejects.toMatch(/failed/)
    })

    it('should pass environment variables correctly', async () => {
      const mockChild = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0)
        }),
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
      }

      vi.mocked(spawn).mockReturnValue(mockChild as any)

      const customEnv = { CUSTOM_VAR: 'value' }
      await runCmd('test', [], customEnv)

      expect(spawn).toHaveBeenCalledWith('test', [], {
        env: expect.objectContaining(customEnv),
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: undefined,
      })
    })
  })

  describe('initGit', () => {
    it('should initialize git repository', async () => {
      const mockChild = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0)
        }),
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
      }

      vi.mocked(spawn).mockReturnValue(mockChild as any)

      await expect(initGit()).resolves.toBeUndefined()

      expect(spawn).toHaveBeenCalledWith('git', ['init'], {
        env: expect.any(Object),
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: undefined,
      })
    })
  })
})
