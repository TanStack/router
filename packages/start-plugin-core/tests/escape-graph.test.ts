/**
 * The client graph check (`escape-graph.ts`): every importer of a module
 * exporting a builder is a module the compiler compiled, importing it
 * statically; a re-exporting importer is followed the same way.
 */
import { describe, expect, it } from 'vitest'
import { NO_LEAK_FACTS, unfollowedImports } from '../src/compiler/escape-graph'
import type { LeakFacts, ReExport } from '../src/compiler/escape-graph'

interface Module {
  facts?: LeakFacts
  text?: string
  /** Its re-exports (`ReExport`). */
  reexports?: Array<ReExport>
  /** It belongs to one of Start's packages. */
  start?: true
  /** Importers: id → dynamic. */
  importers?: Record<string, boolean>
  /** specifier → id, as this module resolves it. */
  imports?: Record<string, string>
}

const builder: LeakFacts = {
  leakProneExports: ['base'],
  escapingNamespaces: [],
  dynamicImports: [],
}

async function check(modules: Record<string, Module>) {
  return unfollowedImports(
    {
      importers: (id) =>
        Object.entries(modules[id]?.importers ?? {}).map(([i, dynamic]) => ({
          id: i,
          dynamic,
        })),
      facts: (id) => modules[id]?.facts,
      reexports: (id) => Promise.resolve(modules[id]?.reexports ?? []),
      isStartPackage: (id) => Promise.resolve(modules[id]?.start === true),
      resolve: (specifier, importer) =>
        Promise.resolve(modules[importer]?.imports?.[specifier] ?? null),
      read: (id) => Promise.resolve(modules[id]?.text ?? null),
      name: (id) => id,
    },
    Object.keys(modules),
  )
}

/** The `importer → module` pairs of the problems. */
const pairs = (problems: Array<string>) =>
  problems.map((p) => p.match(/^(\S+) .*, but (\S+) exports/)!.slice(1))

describe('importers of a module exporting a builder', () => {
  it('accepts compiled static importers and Start’s client runtime', async () => {
    expect(
      await check({
        'b.ts': {
          facts: builder,
          importers: {
            'a.ts': false,
            'hydrateStart.js': true,
          },
        },
        'a.ts': { facts: NO_LEAK_FACTS, text: `import { base } from './b'` },
        'hydrateStart.js': { start: true },
        // Start's own package, whose importers name it
        'react-start.js': {
          facts: builder,
          start: true,
          importers: { '\0virtual': false },
        },
      }),
    ).toEqual([])
  })

  it('refuses a dynamic (seen by the bundler or by its own edges), an uncompiled, a namespace-passing and a require or glob importer', async () => {
    expect(
      pairs(
        await check({
          'b.ts': {
            facts: builder,
            importers: {
              'dyn.ts': true,
              'edge.ts': false,
              '\0virtual': false,
              'ns.ts': false,
              'req.ts': false,
              'glob.ts': false,
            },
          },
          'dyn.ts': { facts: NO_LEAK_FACTS },
          'edge.ts': {
            facts: { ...NO_LEAK_FACTS, dynamicImports: ['./b'] },
            imports: { './b': 'b.ts' },
          },
          'ns.ts': {
            facts: { ...NO_LEAK_FACTS, escapingNamespaces: ['./b'] },
            imports: { './b': 'b.ts' },
          },
          'req.ts': { facts: NO_LEAK_FACTS, text: `const b = require('./b')` },
          'glob.ts': {
            facts: NO_LEAK_FACTS,
            text: `const all = import.meta.glob('./*.ts', { eager: true })`,
          },
        }),
      ),
    ).toEqual([
      ['dyn.ts', 'b.ts'],
      ['edge.ts', 'b.ts'],
      ['\0virtual', 'b.ts'],
      ['ns.ts', 'b.ts'],
      ['req.ts', 'b.ts'],
      ['glob.ts', 'b.ts'],
    ])
  })

  it('follows an importer re-exporting what it exposes, and checks its own importers', async () => {
    expect(
      pairs(
        await check({
          'b.ts': {
            facts: builder,
            importers: {
              'barrel.ts': false,
              'named.ts': false,
              'other.ts': false,
            },
          },
          'barrel.ts': {
            facts: NO_LEAK_FACTS,
            reexports: [{ specifier: './b', name: null, from: null }],
            imports: { './b': 'b.ts' },
            importers: { 'page.ts': false, 'lazy.ts': true },
          },
          'named.ts': {
            facts: NO_LEAK_FACTS,
            reexports: [{ specifier: './b', name: 'renamed', from: 'base' }],
            imports: { './b': 'b.ts' },
            importers: { 'lazy-named.ts': true },
          },
          // re-exports another export of the module: nothing to follow
          'other.ts': {
            facts: NO_LEAK_FACTS,
            reexports: [{ specifier: './b', name: 'fn', from: 'fn' }],
            imports: { './b': 'b.ts' },
            importers: { 'lazy-other.ts': true },
          },
          'lazy-named.ts': { facts: NO_LEAK_FACTS },
          'lazy-other.ts': { facts: NO_LEAK_FACTS },
          'page.ts': {
            facts: NO_LEAK_FACTS,
            text: `import { base } from './barrel'`,
          },
          'lazy.ts': { facts: NO_LEAK_FACTS },
        }),
      ),
    ).toEqual([
      ['lazy.ts', 'barrel.ts'],
      ['lazy-named.ts', 'named.ts'],
    ])
  })
})
