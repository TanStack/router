/**
 * Route options the compiler cannot read under Start (SPEC J2.8, J2.14): a
 * spread, options returned by a call or imported, a computed key. The build
 * goes on and warns, naming the file. What it cannot read is neither split nor
 * removed, so server code in it ships: that is the user's responsibility. The
 * properties written next to a spread or a computed key behave as usual, and
 * each keeps its place in the object: one after it still wins over what it holds.
 */
import { describe, expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

const shared = `export const shared = {
  staleTime: 1,
  server: { handlers: { GET: () => new Response('MARK_SPREAD_SERVER') } },
}
`

const clean = `export const shared = { staleTime: 1 }\n`

async function build(
  bundler: (typeof startBundlers)[number],
  route: string,
  sharedModule = shared,
) {
  return buildStart({
    bundler,
    files: {
      'src/x.shared.ts': sharedModule,
      'src/admin-helper.ts': `export const readSecret = () => 'MARK_WRITTEN_SERVER'\n`,
      'src/r.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { shared } from './x.shared'
import { readSecret } from './admin-helper'
const key = (globalThis as any).key ?? 'staticData'
export const Route = createFileRoute('/x')(${route})
`,
      'src/entry.ts': `export { Route } from './r'\n`,
    },
    entry: 'src/entry.ts',
  })
}

const serverOption = `server: { handlers: { GET: () => new Response(readSecret()) } }`
const component = `component: () => <p>MARK_PAGE</p>`

describe.each(startBundlers)('%s build', (bundler) => {
  test.each([
    { name: 'a spread', route: `{ ...shared, ${component} }` },
    { name: 'options imported from another module', route: `shared` },
    {
      name: 'options returned by a call',
      route: `((o) => o)(shared)`,
    },
    { name: 'a computed key', route: `{ [key]: shared.server, ${component} }` },
  ])(
    '$name: the build warns, and what it holds ships',
    async ({ route }) => {
      const result = await build(bundler, route)
      expectDiagnostic(result.diagnostics, {
        severity: 'warning',
        file: 'src/r.tsx',
      })
      expect(result.client.where('MARK_SPREAD_SERVER')).not.toBe('nowhere')
    },
    timeout,
  )

  test.each([
    { name: 'options', route: `shared` },
    { name: 'a call', route: `((o) => o)(shared)` },
  ])(
    'unread options from $name warn once, whichever environments compile the file',
    async ({ route }) => {
      const result = await build(bundler, route)
      // (a host may report one warning on several channels)
      const said = new Set(
        result.diagnostics.flatMap((d) =>
          d.severity === 'warning'
            ? (d.text.match(/\[tanstack-router\][^\n]*/g) ?? [])
            : [],
        ),
      )
      expect([...said]).toEqual([expect.stringContaining('ships to the client')])
    },
    timeout,
  )

  test(
    'options written to after their declaration warn, and what they hold ships',
    async () => {
      const result = await buildStart({
        bundler,
        files: {
          'src/r.tsx': `import { createFileRoute } from '@tanstack/react-router'
const options: any = { ${component} }
options.server = { handlers: { GET: () => new Response('MARK_SPREAD_SERVER') } }
export const Route = createFileRoute('/x')(options)
`,
          'src/entry.ts': `export { Route } from './r'\n`,
        },
        entry: 'src/entry.ts',
      })
      expectDiagnostic(result.diagnostics, {
        severity: 'warning',
        file: 'src/r.tsx',
      })
    },
    timeout,
  )

  test.each([
    { name: 'a spread', options: `{ ...shared }` },
    { name: 'imported options', options: `shared` },
    { name: 'a call', options: `((o) => o)(shared)` },
  ])(
    'a route factory call other than the route’s, with $name: the build warns, and what it holds ships',
    async ({ options }) => {
      const result = await buildStart({
        bundler,
        files: {
          'src/x.shared.ts': shared,
          'src/r.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { shared } from './x.shared'
export const Route = createFileRoute('/x')({ ${component} })
export const Other = createFileRoute('/y' as any)(${options})
`,
          'src/entry.ts': `export { Route, Other } from './r'\n`,
        },
        entry: 'src/entry.ts',
      })
      expect(
        result.diagnostics.some(
          (d) => d.severity === 'warning' && d.text.includes('ships'),
        ),
      ).toBe(true)
      expect(result.client.where('MARK_SPREAD_SERVER')).not.toBe('nowhere')
    },
    timeout,
  )

  test(
    'a property written next to the spread is split, and server options written next to it are removed',
    async () => {
      const result = await build(
        bundler,
        `{ ...shared, ${component}, ssr: () => { console.log('MARK_WRITTEN_SSR'); return true }, headers: () => ({ a: 'MARK_WRITTEN_HEADERS' }) }`,
        clean,
      )
      expect({
        page: result.client.where('MARK_PAGE'),
        ssr: result.client.where('MARK_WRITTEN_SSR'),
        headers: result.client.where('MARK_WRITTEN_HEADERS'),
      }).toEqual({ page: 'lazy', ssr: 'nowhere', headers: 'nowhere' })
    },
    timeout,
  )

  test(
    '`server` written after the spread is removed and still wins over the spread’s',
    async () => {
      const result = await build(
        bundler,
        `{ ...shared, ${serverOption}, ${component} }`,
      )
      expect(result.client.where('MARK_WRITTEN_SERVER')).toBe('nowhere')
      const { result: server } = await result.client.run(
        `return String(entry.Route.options.server)`,
      )
      expect(server).toBe('undefined')
    },
    timeout,
  )

  test(
    '`server` written before the spread is removed, and the spread’s wins as written',
    async () => {
      const result = await build(
        bundler,
        `{ ${serverOption}, ...shared, ${component} }`,
      )
      expect(result.client.where('MARK_WRITTEN_SERVER')).toBe('nowhere')
      const { result: server } = await result.client.run(
        `return typeof entry.Route.options.server?.handlers?.GET`,
      )
      expect(server).toBe('function')
    },
    timeout,
  )

  test(
    '`server` written after a computed key is removed and still wins over it',
    async () => {
      const result = await build(
        bundler,
        `{ [key]: shared.staleTime, ${serverOption}, ${component} }`,
        clean,
      )
      expect(result.client.where('MARK_WRITTEN_SERVER')).toBe('nowhere')
      const { result: server } = await result.client.run(
        `return String(entry.Route.options.server)`,
      )
      expect(server).toBe('undefined')
    },
    timeout,
  )
})
