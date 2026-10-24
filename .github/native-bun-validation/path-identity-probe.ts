import { mkdtemp, mkdir, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

// Public API diagnostic only. Preserve the tiny fixture for artifact inspection.
const base = process.env.BUN_PATH_PROBE_ROOT ?? tmpdir()
const directory = await mkdtemp(join(base, 'bun-path-identity-'))
const source = join(directory, 'source')
await mkdir(source)
await writeFile(join(source, 'entry.ts'), 'export const value = 42;\n')
const alias = join(directory, 'alias')
await symlink(source, alias, process.platform === 'win32' ? 'junction' : 'dir')

const results = []
for (const entrypoint of [join(source, 'entry.ts'), join(alias, 'entry.ts')]) {
  const loads: Array<{ path: string; resolveDir: string }> = []
  let exactPathHookCalls = 0
  const exactFilter = new RegExp(
    `^${entrypoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
  )
  const result = await Bun.build({
    entrypoints: [entrypoint],
    write: false,
    plugins: [
      {
        name: 'public-path-identity',
        setup(build) {
          build.onLoad({ filter: exactFilter }, () => {
            exactPathHookCalls++
          })
          build.onLoad({ filter: /entry\.ts$/ }, (args) => {
            loads.push({ path: args.path, resolveDir: dirname(args.path) })
          })
        },
      },
    ],
  })
  results.push({
    entrypoint,
    resolved: resolve(entrypoint),
    realpath: await realpath(entrypoint),
    exactPathHookCalls,
    loads,
    success: result.success,
    logs: result.logs.map((log) => log.message),
  })
}
console.log(
  JSON.stringify(
    {
      platform: process.platform,
      arch: process.arch,
      version: Bun.version,
      revision: Bun.revision,
      tmpdir: tmpdir(),
      tmpdirRealpath: await realpath(tmpdir()),
      directory,
      results,
    },
    null,
    2,
  ),
)
