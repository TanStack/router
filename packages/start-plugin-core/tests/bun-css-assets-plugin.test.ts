import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCssAssetsPlugin } from '../src/bun/css-assets-plugin'

describe('createCssAssetsPlugin', () => {
  it('exposes a named Bun plugin', () => {
    const plugin = createCssAssetsPlugin({
      root: '/tmp',
      clientOutDir: '/tmp/client',
      publicBase: '/',
      srcDirectory: 'src',
      css: { tailwind: false },
    })
    expect(plugin.name).toBe('tanstack-start-bun:css-assets')
    expect(typeof plugin.setup).toBe('function')
  })

  it('emits hashed css for ?url via onLoad handler', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'tss-css-'))
    const clientOutDir = join(dir, 'client')
    const cssPath = join(dir, 'styles.css')
    await writeFile(cssPath, 'body{color:red}', 'utf8')
    await mkdir(clientOutDir, { recursive: true })

    const plugin = createCssAssetsPlugin({
      root: dir,
      clientOutDir,
      publicBase: '/',
      srcDirectory: 'src',
      css: { tailwind: false },
    })

    const loads: Array<{
      filter: RegExp
      namespace?: string
      cb: (args: { path: string; namespace: string }) => Promise<{
        contents: string
        loader?: string
      }>
    }> = []

    await plugin.setup({
      onStart() {},
      onResolve() {},
      onLoad(options, cb) {
        loads.push({
          filter: options.filter,
          namespace: options.namespace,
          cb: cb as (args: {
            path: string
            namespace: string
          }) => Promise<{ contents: string; loader?: string }>,
        })
      },
    })

    const urlLoad = loads.find((l) => l.namespace === 'tss-css-url')
    expect(urlLoad).toBeTruthy()
    const result = await urlLoad!.cb({
      path: cssPath,
      namespace: 'tss-css-url',
    })
    expect(result.contents).toMatch(
      /export default "\/assets\/styles-[a-f0-9]{8}\.css"/,
    )

    const match = result.contents.match(
      /\/assets\/(styles-[a-f0-9]{8}\.css)/,
    )
    expect(match?.[1]).toBeTruthy()
    const written = await readFile(
      join(clientOutDir, 'assets', match![1]!),
      'utf8',
    )
    expect(written).toBe('body{color:red}')
  })
})
