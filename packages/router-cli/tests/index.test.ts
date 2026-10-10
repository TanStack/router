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

async function runCli(command: string, config: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'tsr-cli-'))
  await writeFile(path.join(dir, 'tsr.config.json'), config)
  vi.spyOn(process, 'cwd').mockReturnValue(dir)
  const exit = vi
    .spyOn(process, 'exit')
    .mockImplementation((() => undefined) as never)
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  process.argv = ['node', 'tsr', command]

  try {
    await import('../src/index')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  return { exit, error }
}

describe('tsr', () => {
  it('reports an invalid config for `generate` and exits with code 1', async () => {
    const { exit, error } = await runCli('generate', '{ "routesDirectory": ')

    expect(error).toHaveBeenCalledWith(expect.any(SyntaxError))
    expect(exit).toHaveBeenCalledWith(1)
  })
})
