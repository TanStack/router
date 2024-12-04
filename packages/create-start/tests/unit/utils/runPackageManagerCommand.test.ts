import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  runPackageManagerCommand,
  install,
  build,
} from '../../../src/utils/runPackageManagerCommand'
import spawn from 'cross-spawn'

vi.mock('cross-spawn')

describe('Package Manager Commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('runPackageManagerCommand', () => {
    it('should successfully run package manager command', async () => {
      const mockChild = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0)
        }),
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
      }

      vi.mocked(spawn).mockReturnValue(mockChild as any)

      await expect(
        runPackageManagerCommand('npm', ['install']),
      ).resolves.toBeUndefined()

      expect(spawn).toHaveBeenCalledWith('npm', ['install'], {
        env: expect.any(Object),
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: undefined,
      })
    })

    it('should handle command failures', async () => {
      const mockChild = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(1)
        }),
        stderr: { on: vi.fn((_, cb) => cb('error')) },
        stdout: { on: vi.fn((_, cb) => cb('output')) },
      }

      vi.mocked(spawn).mockReturnValue(mockChild as any)

      await expect(
        runPackageManagerCommand('npm', ['invalid']),
      ).rejects.toMatch(/failed/)
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

      const customEnv = { CUSTOM_VAR: 'test' }
      await runPackageManagerCommand('npm', ['install'], customEnv)

      expect(spawn).toHaveBeenCalledWith('npm', ['install'], {
        env: expect.objectContaining(customEnv),
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: undefined,
      })
    })
  })

  describe('install', () => {
    it('should run install command with correct environment', async () => {
      const mockChild = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0)
        }),
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
      }

      vi.mocked(spawn).mockReturnValue(mockChild as any)

      await install('npm')

      expect(spawn).toHaveBeenCalledWith('npm', ['install'], {
        env: expect.objectContaining({ NODE_ENV: 'development' }),
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: undefined,
      })
    })
  })

  describe('build', () => {
    it('should run build command correctly', async () => {
      const mockChild = {
        on: vi.fn((event, cb) => {
          if (event === 'close') cb(0)
        }),
        stderr: { on: vi.fn() },
        stdout: { on: vi.fn() },
      }

      vi.mocked(spawn).mockReturnValue(mockChild as any)

      await build('npm')

      expect(spawn).toHaveBeenCalledWith('npm', ['run', 'build'], {
        env: expect.any(Object),
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: undefined,
      })
    })
  })
})
