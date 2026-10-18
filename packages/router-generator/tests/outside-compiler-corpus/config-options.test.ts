/**
 * Not part of the compiler test corpus (out of scope: configuration
 * plumbing, i.e. which options `getConfig` accepts or rejects, where the
 * generator puts its temporary files, and silencing its logs; none of it
 * changes the files the generator writes).
 */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { Generator, getConfig } from '../../src'
import { createApp, fileRoute, generate, rootRoute } from '../app'
import type { Config } from '../../src'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('token options', () => {
  test.each([
    {
      name: 'a RegExp indexToken and the default routeToken',
      indexToken: /^page$/,
    },
    {
      name: 'the default indexToken and a RegExp routeToken',
      routeToken: /^layout$/,
    },
    {
      name: 'a JSON regex indexToken and the default routeToken',
      indexToken: { regex: '^page$' },
    },
    {
      name: 'the default indexToken and a JSON regex routeToken',
      routeToken: { regex: '^layout$' },
    },
    {
      name: 'a RegExp indexToken and a JSON regex routeToken',
      indexToken: /^page$/,
      routeToken: { regex: '^layout$' },
    },
    {
      name: 'two different RegExps',
      indexToken: /^page$/,
      routeToken: /^layout$/,
    },
  ] satisfies Array<Partial<Config> & { name: string }>)(
    'different tokens are accepted: $name',
    ({ name: _name, ...config }) => {
      expect(() => getConfig(config)).not.toThrow()
    },
  )

  test('a token regex that does not compile fails the generator with an error naming it', async () => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/index.tsx': fileRoute('/'),
    })

    await expect(
      generate(root, { indexToken: { regex: 'home(unclosed' } }),
    ).rejects.toThrow('home(unclosed')
  })
})

describe('logging', () => {
  test('disableLogging true: a run that creates and skips route files logs nothing', async () => {
    const output: Array<string> = []
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, method).mockImplementation((...args) => {
        output.push(args.join(' '))
      })
    }
    const root = await createApp({
      // An empty root route is scaffolded, with a log.
      'src/routes/__root.tsx': '',
      // A route file without a Route export is left out, with a warning.
      'src/routes/helpers.tsx': 'export const helper = 1\n',
      // An invalid param name gets a warning.
      'src/routes/$123.tsx': fileRoute('/$123'),
    })
    const { generatedRouteTree } = await generate(root, {
      disableLogging: true,
    })

    expect(existsSync(generatedRouteTree)).toBe(true)
    expect(output).toEqual([])
  })
})

describe('temporary files', () => {
  // The generator writes files through a temporary file in its temporary
  // directory, which it creates on the first write.
  const app = () => ({ 'src/routes/__root.tsx': rootRoute() })

  test('the TSR_TMP_DIR environment variable sets the temporary directory', async () => {
    const root = await createApp(app())
    vi.stubEnv('TSR_TMP_DIR', path.join(root, 'env-tmp'))
    const config = getConfig({ disableLogging: true }, root)
    await new Generator({ config, root }).run()

    expect(existsSync(config.generatedRouteTree)).toBe(true)
    expect(existsSync(path.join(root, 'env-tmp'))).toBe(true)
  })

  test('the tmpDir option takes precedence over TSR_TMP_DIR', async () => {
    const root = await createApp(app())
    vi.stubEnv('TSR_TMP_DIR', path.join(root, 'env-tmp'))
    const config = getConfig(
      { disableLogging: true, tmpDir: path.join(root, 'option-tmp') },
      root,
    )
    await new Generator({ config, root }).run()

    expect(existsSync(path.join(root, 'option-tmp'))).toBe(true)
    expect(existsSync(path.join(root, 'env-tmp'))).toBe(false)
  })

  test('the default temporary directory is .tanstack/tmp in the working directory', async () => {
    const root = await createApp(app())
    vi.stubEnv('TSR_TMP_DIR', undefined)
    const cwd = process.cwd()
    process.chdir(root)
    try {
      const config = getConfig({ disableLogging: true }, root)
      await new Generator({ config, root }).run()
    } finally {
      process.chdir(cwd)
    }

    expect(existsSync(path.join(root, 'src/routeTree.gen.ts'))).toBe(true)
    expect(existsSync(path.join(root, '.tanstack/tmp'))).toBe(true)
  })
})

describe('invalid configuration', () => {
  test.each([
    {
      name: 'experimental.enableCodeSplitting',
      config: { experimental: { enableCodeSplitting: true } },
      error: 'use "autoCodeSplitting" instead',
    },
    {
      name: 'the same indexToken and routeToken',
      config: { indexToken: 'page', routeToken: 'page' },
      error: 'The "indexToken" and "routeToken" options must be different.',
    },
    {
      name: 'the same JSON regex indexToken and routeToken',
      config: {
        indexToken: { regex: '^page$' },
        routeToken: { regex: '^page$', flags: '' },
      },
      error: 'The "indexToken" and "routeToken" options must be different.',
    },
    {
      name: 'routeFileIgnorePrefix "_"',
      config: { routeFileIgnorePrefix: '_' },
      error: 'The "routeFileIgnorePrefix" cannot be an underscore ("_").',
    },
    {
      name: 'routeFileIgnorePrefix "_ "',
      config: { routeFileIgnorePrefix: '_ ' },
      error: 'The "routeFileIgnorePrefix" cannot be an underscore ("_").',
    },
    {
      name: 'the same JSON regex indexToken and routeToken, both without flags',
      config: {
        indexToken: { regex: '^page$' },
        routeToken: { regex: '^page$' },
      },
      error: 'The "indexToken" and "routeToken" options must be different.',
    },
  ])(
    'tsr.config.json with $name is rejected with a clear error',
    async ({ config, error }) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const root = await createApp({
        'tsr.config.json': JSON.stringify(config),
      })
      expect(() => getConfig({}, root)).toThrow(error)
    },
  )

  test('the same RegExp indexToken and routeToken are rejected with a clear error', () => {
    expect(() =>
      getConfig({ indexToken: /^page$/, routeToken: /^page$/ }),
    ).toThrow('The "indexToken" and "routeToken" options must be different.')
  })
})
