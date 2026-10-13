import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const argv = process.argv

afterEach(() => {
  process.argv = argv
  vi.restoreAllMocks()
  vi.resetModules()
})

class ExitError extends Error {
  constructor(readonly code: number | string | null | undefined) {
    super(`process.exit(${code})`)
  }
}

async function runCli(command: string, config: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tsr-cli-'))
  await writeFile(path.join(dir, 'tsr.config.json'), config)
  vi.spyOn(process, 'cwd').mockReturnValue(dir)
  // Throw like a real exit would stop execution, so nothing runs after it.
  const exit = vi.spyOn(process, 'exit').mockImplementation((code) => {
    throw new ExitError(code)
  })
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.argv = ['node', 'tsr', command]

  try {
    const result = await import('../src/index').then(
      () => undefined,
      (err: unknown) => err,
    )
    return { result, exit, error }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('tsr', () => {
  it('reports an invalid config for `generate` and exits with code 1', async () => {
    const { result, exit, error } = await runCli(
      'generate',
      '{ "routesDirectory": ',
    )

    expect(result).toEqual(new ExitError(1))
    expect(exit).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledTimes(1)
    expect(error).toHaveBeenCalledWith(expect.any(SyntaxError))
  })
})
