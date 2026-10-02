import { analyzeModule, generateModule } from '@tanstack/router-utils'
import { SourceMapConsumer } from 'source-map'
import { is } from 'yuku-ast'
import { describe, expect, test, vi } from 'vitest'
import { createStartCompiler } from '../../src/start-compiler/host'

const functionId = 'rpc"\\\n\r\t\0\u2028\u2029\ud800雪'
const filename = '/test/src/雪"file.ts'
const code = `'use strict';
import { createServerFn } from '@tanstack/react-start';
export const opts = 'unused source binding';
const prefix = 'retained';
export const πfn = createServerFn().handler((opts) => prefix + opts.data);
`

function compiler(
  runtime: 'client' | 'ssr' | 'provider',
  framework: 'react' | 'solid' | 'vue',
  mode: 'build' | 'dev' = 'build',
  directives: Array<string> = [],
) {
  return createStartCompiler({
    env: runtime === 'client' ? 'client' : 'server',
    envName: runtime === 'client' ? 'client' : 'ssr',
    root: '/test',
    framework,
    providerEnvName: 'ssr',
    mode,
    encodeModuleSpecifierInDev: ({ extractedFilename }) => extractedFilename,
    generateFunctionId: () => functionId,
    serverFnProviderModuleDirectives: directives,
    getKnownServerFns: () => ({}),
    resolveId: async () => null,
    loadModule: async () => {},
  })
}

describe.each(['react', 'solid', 'vue'] as const)(
  '%s generated RPC AST',
  (framework) => {
    test.each(['client', 'ssr', 'provider'] as const)(
      '%s preserves imports, string values, and executable handler ownership',
      async (runtime) => {
        const result = await compiler(runtime, framework).compile({
          code: code.replace(
            '@tanstack/react-start',
            `@tanstack/${framework}-start`,
          ),
          id: filename + (runtime === 'provider' ? '?tss-serverfn-split' : ''),
        })
        expect(result).not.toBeNull()
        const program = analyzeModule({ code: result!.code }).ast
        const imports = program.body.filter(is.ImportDeclaration)
        expect(imports.map((node) => node.source.value)).toContain(
          `@tanstack/${framework}-start/${runtime === 'provider' ? 'server' : runtime}-rpc`,
        )
        expect(is.Directive(program.body[0])).toBe(true)
        // Execute emitted code with observable runtime stubs, removing only the
        // module boundary. This catches lost imports/references and wrong ownership.
        program.body = program.body.flatMap((node) => {
          if (is.ImportDeclaration(node)) {
            return []
          }
          if (is.ExportNamedDeclaration(node)) {
            return node.declaration ? [node.declaration] : []
          }
          return [node]
        })
        const rpc = vi.fn((...args: Array<any>) => args.at(-1))
        const createServerFn = () => ({
          handler: (
            rpcOrHandler: unknown,
            handler?: (opts: any) => unknown,
          ) => ({
            __executeServer: handler,
            rpcOrHandler,
          }),
        })
        const execute = new Function(
          'createServerFn',
          'createClientRpc',
          'createSsrRpc',
          'createServerRpc',
          `${generateModule(program).code}\nreturn πfn;`,
        )
        const fn = execute(createServerFn, rpc, rpc, rpc)
        if (runtime === 'provider') {
          expect(result!.code).not.toContain('import.meta.hot')
          expect(rpc).toHaveBeenCalledWith(
            { id: functionId, name: 'πfn', filename: 'src/雪"file.ts' },
            expect.any(Function),
          )
          expect(fn.rpcOrHandler({ data: ' value' })).toBe('retained value')
          expect(result!.code).not.toContain('unused source binding')
        } else {
          expect(rpc).toHaveBeenCalledWith(functionId)
          expect(fn.rpcOrHandler).toBe(functionId)
          expect(result!.code).not.toContain('retained')
        }
      },
    )
  },
)

test('provider directives precede imports, preserve escaping, and do not duplicate plain directives', async () => {
  const escaped = 'use "server"\\\n雪'
  const result = await compiler('provider', 'react', 'build', [
    '',
    'use strict',
    'use server-entry',
    'use server-entry',
    escaped,
  ]).compile({ code, id: `${filename}?tss-serverfn-split` })
  const body = analyzeModule({ code: result!.code }).ast.body
  const directives = body.filter(is.Directive)
  expect(directives.map((node) => node.expression.value)).toEqual([
    'use server-entry',
    escaped,
    'use strict',
  ])
  expect(directives.map((node) => node.directive)).toEqual([
    'use server-entry',
    JSON.stringify(escaped).slice(1, -1),
    'use strict',
  ])
  expect(is.ImportDeclaration(body[directives.length])).toBe(true)
})

test.each(['hot', 'webpackHot', 'both', 'neither'])(
  'provider development output accepts the available HMR runtime: %s',
  async (available) => {
    const result = await compiler('provider', 'react', 'dev').compile({
      code:
        code +
        '\nexport const hot = 1, webpackHot = 2, accept = 3, meta = 4, __executeServer = 5;',
      id: `${filename}?tss-serverfn-split`,
    })
    expect(result!.code).toContain('if (import.meta.hot)')
    expect(result!.code).toContain('import.meta.hot.accept(() => {})')
    expect(result!.code).toContain('if (import.meta.webpackHot)')
    expect(result!.code).toContain('import.meta.webpackHot.accept(() => {})')
    const program = analyzeModule({ code: result!.code }).ast
    for (const name of [
      'hot',
      'webpackHot',
      'accept',
      'meta',
      '__executeServer',
    ]) {
      expect(result!.code).not.toMatch(new RegExp(`\\b${name}\\s*=`))
    }
    const hot = { accept: vi.fn() }
    const webpackHot = { accept: vi.fn() }
    const meta = {
      ...(available === 'hot' || available === 'both' ? { hot } : {}),
      ...(available === 'webpackHot' || available === 'both'
        ? { webpackHot }
        : {}),
    }
    const guards = generateModule({
      ...program,
      body: program.body.filter(is.IfStatement),
    }).code
    new Function('meta', guards.replaceAll('import.meta', 'meta'))(meta)
    expect(hot.accept).toHaveBeenCalledTimes('hot' in meta ? 1 : 0)
    expect(webpackHot.accept).toHaveBeenCalledTimes(
      'webpackHot' in meta ? 1 : 0,
    )
    for (const runtime of Object.values(meta)) {
      const callback = runtime.accept.mock.calls[0]![0]
      expect(callback).toBeTypeOf('function')
      expect(callback()).toBeUndefined()
    }
  },
)

test('provider keeps handler source mappings after generated declarations', async () => {
  const result = await compiler('provider', 'react').compile({
    code,
    id: `${filename}?tss-serverfn-split`,
  })
  const lines = result!.code.split(/[\n\u2028\u2029]/)
  const line = lines.findIndex((text) => text.includes('prefix + opts.data'))
  await SourceMapConsumer.with(JSON.stringify(result!.map), null, (map) => {
    const original = map.originalPositionFor({
      line: line + 1,
      column: lines[line]!.indexOf('prefix + opts.data'),
    })
    expect(original.line).toBe(5)
    expect(original.column).toBe(
      code.split('\n')[4]!.indexOf('prefix + opts.data'),
    )
    expect(map.sourceContentFor(original.source!)).toBe(code)
  })
})

test('provider recompilation keeps generated declarations independent after invalidation', async () => {
  const reused = compiler('provider', 'react', 'dev', ['use server-entry'])
  const id = `${filename}?tss-serverfn-split`
  const first = await reused.compile({ code, id })
  const firstOutput = JSON.stringify(first)
  const changed =
    code.replace("'retained'", "'updated'") +
    '\nexport const second = createServerFn().handler(() => πfn);'
  reused.invalidateModule(id)
  const next = await reused.compile({ code: changed, id })
  const fresh = await compiler('provider', 'react', 'dev', [
    'use server-entry',
  ]).compile({ code: changed, id })
  expect(next).toEqual(fresh)
  expect(next!.code).toContain('second_createServerFn_handler')
  expect(next!.code).toContain('updated')
  expect(next!.code).not.toContain('retained')
  expect(JSON.stringify(first)).toBe(firstOutput)
})
