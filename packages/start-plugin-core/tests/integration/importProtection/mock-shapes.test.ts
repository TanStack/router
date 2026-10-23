/**
 * What a client importer gets for a denied import, for each way of writing
 * the import and each shape of the denied module's exports (SPEC J6.8:
 * mocking is complete; J6.2: type-only parts are not imports), on a real
 * app in mock mode: a Vite dev server with Start's whole public plugin (the
 * page in a real browser) and mock-mode Vite and Rsbuild builds (the client
 * bundle in a real browser). A mock is told by what it does (`mock-helpers.ts`,
 * `describeValue`: `a safe mock`), never by its label or its module.
 *
 * Two kinds of denied modules: a package denied by a specifier rule
 * (`private-sdk`, `other-sdk`: the importer gets a mock of each name it
 * uses) and denied files (`src/shapes/*.server.ts`: the importer gets a mock
 * of each export of the file). Each case is a module of its own under
 * `src/cases/` whose `values()` gives what it read from the denied module;
 * one app holds every case, so each channel builds or serves it once.
 *
 * Replaces main's internal tests that evaluated today's generated mock
 * modules in process (`importProtection/analysis.exports.test.ts`,
 * `rewrite.test.ts`, deleted). The names today's mocks miss
 * (reserved words, namespace re-exports, enums, a member read before the
 * import, computed keys) are pinned in `known-bugs.test.ts` ("app-level
 * twins of the mock pins"); `export *` and `export * as ns` of a denied
 * module are pinned there and in `known-bugs-dev-server.test.ts`.
 */
import { afterAll, describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../../build-harness'
import { describeValuePrelude } from '../../importProtection/mock-helpers'
import { runViteClient, startBrowserProtectedDevServer } from './client-pages'
import type { StartBuild } from '../../build-harness'
import type { ImportProtectionOptions } from '../../importProtection/public-types'

const timeout = 60_000

/** Names an importer may use, including ones no identifier can spell. */
const oddNames = [
  'valid',
  '_private',
  '$ref',
  'camelCase',
  'A',
  '1foo',
  'foo-bar',
  'foo.bar',
  'foo bar',
  '~lead',
  'a~b',
  'a:b',
  '|x',
  'a^b',
  'default',
]

/** Names `private-sdk` exports (its real values carry `MARK_SECRET`). */
const sdkNames = [
  'alpha',
  'beta',
  'gamma',
  'delta',
  'bar',
  'read',
  'write',
  'value',
  'kebab-name',
  'reexported',
  'a-b',
  ...oddNames.filter((name) => name !== 'default'),
]

/** A package `name` exporting each of `names`, and a default, as secrets. */
function deniedPackage(name: string, names: Array<string>) {
  return {
    [`node_modules/${name}/package.json`]: JSON.stringify({
      name,
      type: 'module',
      exports: './index.js',
    }),
    [`node_modules/${name}/index.js`]: `${names
      .map(
        (exported, index) => `const v${index} = () => 'MARK_SECRET_${index}'`,
      )
      .join('\n')}
export { ${names.map((exported, index) => `v${index} as ${JSON.stringify(exported)}`).join(', ')} }
export default { getSecret: () => 'MARK_SECRET_DEFAULT', 'foo-bar': 'MARK_SECRET_KEBAB' }
`,
  }
}

const quotedImports = (names: Array<string>) =>
  names.map((name, index) => `${JSON.stringify(name)} as n${index}`).join(', ')

/** The importer cases of the denied packages: file, then its `values` body. */
const packageCases: Record<string, string> = {
  'named imports': `import { alpha, beta } from 'private-sdk'
export const values = () => [alpha, beta]
`,
  'a default import': `import def from 'private-sdk'
export const values = () => [def]
`,
  '`{ default as x }`': `import { default as myDefault } from 'private-sdk'
export const values = () => [myDefault]
`,
  'namespace members': `import * as ns from 'private-sdk'
export const values = () => [ns.alpha, ns.beta]
`,
  'an optional namespace member call': `import * as ns from 'private-sdk'
export const values = () => [ns.gamma?.()]
`,
  'a string-literal computed namespace member': `import * as ns from 'private-sdk'
export const values = () => [ns['delta']]
`,
  'members of a default import': `import mock from 'private-sdk'
export const values = () => [mock.getSecret, mock['foo-bar']]
`,
  'a value specifier next to a type specifier': `import { type Foo, bar } from 'private-sdk'
export const values = () => [bar as unknown as Foo]
`,
  'several imports of the same source': `import { alpha } from 'private-sdk'
import { beta } from 'private-sdk'
export const values = () => [alpha, beta]
`,
  'a string-keyed import specifier': `import { "foo-bar" as x } from 'private-sdk'
export const values = () => [x]
`,
  'parenthesized namespace calls': `import * as denied from 'private-sdk'
export const values = () => [(denied).read(), (denied)['write']()]
`,
  're-exports': `export { alpha, beta } from 'private-sdk'
`,
  'a string-literal re-export': `export { "foo-bar" as baz } from 'private-sdk'
`,
  'an import and a re-export of the same name': `import { alpha } from 'private-sdk'
export { alpha } from 'private-sdk'
export const used = alpha
`,
  'imports of several denied sources': `import { alpha } from 'private-sdk'
import { beta } from 'other-sdk'
export const values = () => [alpha, beta]
`,
  'every name an importer can use': `import { ${quotedImports(oddNames)} } from 'private-sdk'
export const values = () => [${oddNames.map((_, index) => `n${index}`).join(', ')}]
`,
  // (a default and a string-keyed named import in one declaration are
  // split: Vite's import analysis fails to parse that valid declaration,
  // with or without Start)
  'every form of import and re-export': `import 'private-sdk'
import def, { type T, value } from 'private-sdk'
import { value as renamed, "kebab-name" as kebab } from 'private-sdk'
import * as ns from 'private-sdk'
export { type U, reexported, reexported as aliased, reexported as "string export", "a-b" as ab } from 'private-sdk'
export { default as renamedDefault } from 'private-sdk'
export const values = (): T => [def, ns.value, value, renamed, kebab] as unknown as T
`,
  'a .ts module with angle-bracket type assertions': `import { alpha } from 'private-sdk'
const identity = <T>(value: T) => value
export const values = () => [<unknown>identity(<unknown>alpha)]
`,
}

/** What each re-exporting case gives: the names it exports. */
const reexported: Record<string, Array<string>> = {
  're-exports': ['alpha', 'beta'],
  'a string-literal re-export': ['baz'],
  'an import and a re-export of the same name': ['alpha', 'used'],
  'every form of import and re-export': [
    'reexported',
    'aliased',
    'string export',
    'ab',
    'renamedDefault',
  ],
}

/**
 * The denied files: each a shape of exports (with `obj` and `arr` declared
 * in the file), and the names it exports, which its importer reads from its
 * namespace.
 */
const fileCases: Record<string, { code: string; names: Array<string> }> = {
  declarations: {
    code: `export function alpha() { return 'MARK_SECRET' }
export const beta = 'MARK_SECRET'
export class Gamma {}
`,
    names: ['alpha', 'beta', 'Gamma'],
  },
  'export specifiers and aliases': {
    code: `const local = 'MARK_SECRET'
const x = 'MARK_SECRET'
export { local as renamed, x }
`,
    names: ['renamed', 'x'],
  },
  'a default export next to a type-only re-export': {
    code: `export default function main() { return 'MARK_SECRET' }
export type { Foo } from '../types'
`,
    names: ['default'],
  },
  'object destructuring': {
    code: `const obj = { a: 'MARK_SECRET', b: 'MARK_SECRET' }
export const { a, b } = obj
`,
    names: ['a', 'b'],
  },
  'array destructuring': {
    code: `const arr = ['MARK_SECRET', 'MARK_SECRET']
export const [x, y] = arr
`,
    names: ['x', 'y'],
  },
  'an array destructuring rest element': {
    code: `const arr = ['MARK_SECRET', 'MARK_SECRET']
export const [first, ...others] = arr
`,
    names: ['first', 'others'],
  },
  'renamed destructuring': {
    code: `const obj = { a: 'MARK_SECRET' }
export const { a: renamed } = obj
`,
    names: ['renamed'],
  },
  'nested destructuring': {
    code: `const obj = { a: { b: 'MARK_SECRET', c: 'MARK_SECRET' } }
export const { a: { b, c } } = obj
`,
    names: ['b', 'c'],
  },
  'destructuring with defaults': {
    code: `const obj: { a?: string; b?: string } = {}
export const { a = 'MARK_SECRET', b = 'MARK_SECRET' } = obj
`,
    names: ['a', 'b'],
  },
  'a destructuring rest element': {
    code: `const obj = { a: 'MARK_SECRET', d: 'MARK_SECRET' }
export const { a, ...rest } = obj
`,
    names: ['a', 'rest'],
  },
  'a default re-export alias': {
    code: `export { default as hello } from '../secret-default'
`,
    names: ['hello'],
  },
  'a string export name': {
    code: `const local = 'MARK_SECRET'
export { local as "foo-bar" }
`,
    names: ['foo-bar'],
  },
  'every name an importer can use': {
    code: `const local = () => 'MARK_SECRET'
export { ${oddNames.map((name) => `local as ${JSON.stringify(name)}`).join(', ')} }
`,
    names: oddNames,
  },
  // The enum itself is pinned (known-bugs.test.ts); it must not cost the
  // other exports.
  'an enum next to other exports': {
    code: `export enum Color { Red = 'MARK_SECRET' }
export const secret = 'MARK_SECRET'
`,
    names: ['secret'],
  },
}

/** File name of a case. */
const slug = (name: string) =>
  name
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()

const files: Record<string, string> = {
  ...deniedPackage('private-sdk', sdkNames),
  ...deniedPackage('other-sdk', ['beta']),
  'src/types.ts': `export type Foo = string\n`,
  'src/secret-default.ts': `export default 'MARK_SECRET'\n`,
  'src/ok.ts': `export const safe = 'MARK_REAL_OK'\n`,
  'src/cases/not-denied.ts': `import { safe } from '../ok'
import { alpha } from 'private-sdk'
export const values = () => [safe, alpha]
`,
  ...Object.fromEntries(
    Object.entries(packageCases).map(([name, code]) => [
      `src/cases/sdk-${slug(name)}.ts`,
      code,
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(fileCases).flatMap(([name, { code, names }]) => [
      [`src/shapes/${slug(name)}.server.ts`, code],
      [
        `src/cases/file-${slug(name)}.ts`,
        `import * as ns from '../shapes/${slug(name)}.server'
export const values = () => [${names.map((exported) => `(ns as any)[${JSON.stringify(exported)}]`).join(', ')}]
`,
      ],
    ]),
  ),
}

/** The entry: each case's `values`, by case name. */
files['src/entry.ts'] = `${[
  ['not denied', 'not-denied'],
  ...Object.keys(packageCases).map((name) => [name, `sdk-${slug(name)}`]),
  ...Object.keys(fileCases).map((name) => [
    `file: ${name}`,
    `file-${slug(name)}`,
  ]),
]
  .map(([, file], index) => `import * as c${index} from './cases/${file}'`)
  .join('\n')}
const read = (module: any, names: Array<string> = []) => () => [
  ...(module.values?.() ?? []),
  ...names.map((name) => module[name]),
]
export const cases: Record<string, () => Array<unknown>> = {
${[
  ['not denied', 'not-denied'],
  ...Object.keys(packageCases).map((name) => [name, `sdk-${slug(name)}`]),
  ...Object.keys(fileCases).map((name) => [
    `file: ${name}`,
    `file-${slug(name)}`,
  ]),
]
  .map(
    ([name], index) =>
      `  ${JSON.stringify(name)}: read(c${index}${reexported[name!] ? `, ${JSON.stringify(reexported[name!])}` : ''}),`,
  )
  .join('\n')}
}
`

/** The script of every channel: each case's values, described. */
const script = `${describeValuePrelude}
return Object.fromEntries(
  Object.entries(entry.cases).map(([name, values]) => {
    try {
      return [name, values().map((value) => describeValue(value, 'MARK_SECRET'))]
    } catch (error) {
      return [name, ['throws: ' + String(error)]]
    }
  }),
)`

const importProtection: ImportProtectionOptions = {
  client: { specifiers: ['private-sdk', 'other-sdk'] },
  mockAccess: 'off',
}

const mock = 'a safe mock'

/** What each case gives: a safe mock for every value read from a denied module. */
const expected: Record<string, Array<string>> = {
  'not denied': ['MARK_REAL_OK', mock],
  ...Object.fromEntries(
    Object.entries(packageCases).map(([name]) => [
      name,
      (reexported[name] ?? [null]).map(() => mock),
    ]),
  ),
  ...Object.fromEntries(
    Object.entries(fileCases).map(([name, { names }]) => [
      `file: ${name}`,
      names.map(() => mock),
    ]),
  ),
}
// (cases whose `values` read a fixed number of values)
expected['named imports'] = [mock, mock]
expected['namespace members'] = [mock, mock]
expected['members of a default import'] = [mock, mock]
expected['several imports of the same source'] = [mock, mock]
expected['parenthesized namespace calls'] = [mock, mock]
expected['imports of several denied sources'] = [mock, mock]
expected['every name an importer can use'] = oddNames.map(() => mock)
expected['every form of import and re-export'] = [
  // its imports: `def`, `ns.value`, `value`, `renamed`, `kebab`
  ...[1, 2, 3, 4, 5].map(() => mock),
  ...reexported['every form of import and re-export']!.map(() => mock),
]

type Channel = 'vite dev' | 'vite build' | 'rsbuild build'
const channels: Array<Channel> = [
  'vite dev',
  ...startBundlers.map((bundler) => `${bundler} build` as Channel),
]

const builds: Array<StartBuild> = []
afterAll(async () => {
  await Promise.all(builds.map((build) => build.client.dispose()))
})

const outcomes = new Map<Channel, Promise<Record<string, Array<string>>>>()
/** What each case gives on `channel`, run once per channel. */
function outcomeOf(channel: Channel) {
  let outcome = outcomes.get(channel)
  if (!outcome) {
    outcome = (async () => {
      if (channel === 'vite dev') {
        const server = await startBrowserProtectedDevServer(
          files,
          importProtection,
        )
        try {
          return (await runViteClient(server, '/src/entry.ts', script))
            .result as Record<string, Array<string>>
        } finally {
          await server.close()
        }
      }
      const build = await buildStart({
        bundler: channel === 'vite build' ? 'vite' : 'rsbuild',
        files,
        entry: 'src/entry.ts',
        start: { importProtection: { ...importProtection, behavior: 'mock' } },
        registerCleanup: () => {},
      })
      builds.push(build)
      return (await build.client.run(script)).result as Record<
        string,
        Array<string>
      >
    })()
    outcomes.set(channel, outcome)
  }
  return outcome
}

describe.each(channels)('%s, mock mode', (channel) => {
  test.each(Object.keys(expected))(
    '%s: the importer gets a safe mock of what it uses from the denied module',
    async (name) => {
      expect((await outcomeOf(channel))[name]).toEqual(expected[name])
    },
    timeout,
  )
})
