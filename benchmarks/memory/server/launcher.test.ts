import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, it } from 'vitest'

it('replaces the launcher with a deterministic Vitest coordinator', () => {
  const directory = mkdtempSync(join(tmpdir(), 'memory-launcher-'))
  const probe = join(directory, 'probe.cjs')
  writeFileSync(
    probe,
    `
      console.log(JSON.stringify({ pid: process.pid, args: process.argv, flags: process.execArgv, wasm: typeof WebAssembly }))
      if (process.argv[1].endsWith('/vitest.mjs')) {
        process.exit(0)
      }
    `,
  )
  try {
    const output = execFileSync(
      process.execPath,
      [fileURLToPath(new URL('../run.ts', import.meta.url)), 'client', 'vue'],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_OPTIONS: `--require=${probe}`,
          CODSPEED_ENV: 'test',
          CODSPEED_RUNNER_MODE: 'memory',
        },
      },
    )
    const [launcher, coordinator] = output
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(coordinator.pid).toBe(launcher.pid)
    expect(coordinator.wasm).toBe('object')
    expect(coordinator.flags).not.toContain('--jitless')
    expect(coordinator.args.slice(-3)).toEqual([
      'bench',
      '--config',
      'vitest.vue.config.ts',
    ])
    expect(coordinator.flags).toEqual(
      expect.arrayContaining([
        '--no-maglev',
        '--always-sparkplug',
        '--no-incremental-marking',
        '--no-minor-gc-task',
        '--predictable',
        '--hash-seed=1',
        '--expose-gc',
      ]),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
