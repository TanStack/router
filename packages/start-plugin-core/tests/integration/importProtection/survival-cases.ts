/**
 * The survival matrix of `survival.test.ts`: tiny apps, each with the verdict expected per violating
 * edge (`importer -> specifier`): `true` reported (the edge survives
 * tree-shaking), `false` not, `null` a policy row (either verdict). Where a
 * bundler's real output differs, `rspack` overrides the expectation.
 *
 * - `files`: the app; the entry is `src/entry.ts` unless `entry` says.
 * - `denied`: the client file rule (root-relative globs); default `**\/*.server.*`.
 * - importers under `src/exempt/` are ignored (`ignoreImporters`).
 */
import { describeValuePrelude } from '../../importProtection/mock-helpers'

export interface SurvivalCase {
  name: string
  files: Record<string, string>
  entry?: string
  denied?: Array<string>
  expect: Record<string, boolean | null>
  /** Rspack's own truth where it differs (it keeps `import()` in an unused function). */
  rspack?: Record<string, boolean | null>
}

const SECRET = `export const secret = () => 'MARK_SECRET' + Math.random().toString().slice(0, 0)\n`
const log = (expr: string) => `console.log('OUT', ${expr})\n`

export const cases: Array<SurvivalCase> = [
  // live direct imports
  {
    name: 'a named import, used',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\n` + log('secret()'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
  },
  {
    name: 'a default import, used',
    files: {
      'src/secret.server.ts': `export default function secret() { return 'MARK_SECRET' }\n`,
      'src/entry.ts': `import s from './secret.server'\n` + log('s()'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
  },
  {
    name: 'a namespace member, used',
    files: {
      'src/secret.server.ts':
        SECRET + `export const other = () => 'MARK_OTHER'\n`,
      'src/entry.ts':
        `import * as ns from './secret.server'\n` + log('ns.secret()'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
  },
  {
    name: 'a namespace member by a computed key, used',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import * as ns from './secret.server'\nconst k = globalThis.key ?? 'secret'\n` +
        log('ns[k]()'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
  },
  {
    name: 'a named import of a module the entry imports, used',
    files: {
      'src/secret.server.ts': SECRET,
      'src/util.ts': `import { secret } from './secret.server'\nexport const read = () => secret()\nexport const unrelated = 1\n`,
      'src/entry.ts': `import { read } from './util'\n` + log('read()'),
    },
    expect: { 'src/util.ts -> ./secret.server': true },
  },

  // dead imports
  {
    name: 'a named import, unused',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\n` + log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': false },
  },
  {
    name: 'used only in an unused function',
    files: {
      'src/secret.server.ts': SECRET,
      'src/util.ts': `import { secret } from './secret.server'\nexport const read = () => secret()\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './util'\n` + log('label()'),
    },
    expect: { 'src/util.ts -> ./secret.server': false },
  },
  {
    name: 'used only in if (false)',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\nif (false) { console.log(secret()) }\n` +
        log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': false },
  },
  {
    name: 'an unused binding of an effectful module',
    files: {
      'src/secret.server.ts':
        `globalThis.secretLoaded = 'MARK_EFFECT'\n` + SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\n` +
        log(`'client', globalThis.secretLoaded`),
    },
    // TypeScript elides the unused import before bundling, so the real
    // program never runs the target: no edge, nothing to report.
    expect: { 'src/entry.ts -> ./secret.server': false },
  },
  {
    // An exempt importer uses the target; the in-scope importer does not.
    // A per-target reading (is the real module in the bundle?) reports here.
    name: 'unused, its target used by an exempt importer',
    files: {
      'src/secret.server.ts': SECRET,
      'src/exempt/a.ts': `import { secret } from '../secret.server'\nexport const a = () => secret()\n`,
      'src/b.ts': `import { secret } from './secret.server'\nexport const b = () => secret()\nexport const label = () => 'client'\n`,
      'src/entry.ts':
        `import { a } from './exempt/a'\nimport { label } from './b'\n` +
        log('a(), label()'),
    },
    expect: { 'src/b.ts -> ./secret.server': false },
  },

  // denied transparent barrel
  {
    // build.test.ts:116 — the barrel is denied, the value lives in a
    // non-denied module.
    name: 'used through a denied barrel re-exporting by name',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export { secret } from './secret'\n`,
      'src/entry.ts': `import { secret } from './barrel'\n` + log('secret()'),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/entry.ts -> ./barrel': true },
  },
  {
    name: 'used through a denied export * barrel',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export * from './secret'\n`,
      'src/entry.ts': `import { secret } from './barrel'\n` + log('secret()'),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/entry.ts -> ./barrel': true },
  },
  {
    name: 'unused through a denied barrel',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export { secret } from './secret'\n`,
      'src/entry.ts': `import { secret } from './barrel'\n` + log(`'client'`),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/entry.ts -> ./barrel': false },
  },
  {
    // The denied barrel is reached through a second (allowed) barrel.
    name: 'used through a barrel re-exporting a denied barrel',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export { secret } from './secret'\n`,
      'src/outer.ts': `export { secret } from './barrel'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { secret } from './outer'\n` + log('secret()'),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/outer.ts -> ./barrel': true },
  },

  // mixed barrel
  {
    // build.test.ts:356 — barrel not denied, re-exports a denied module
    // and a safe export; the client uses only the safe export.
    name: 'a mixed barrel, only its safe export used',
    files: {
      'src/marked.ts': SECRET,
      'src/barrel.ts': `export { secret } from './marked'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './barrel'\n` + log('label()'),
    },
    denied: ['src/marked.ts'],
    expect: { 'src/barrel.ts -> ./marked': false },
  },
  {
    name: 'a mixed barrel, its denied export used',
    files: {
      'src/marked.ts': SECRET,
      'src/barrel.ts': `export { secret } from './marked'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { secret } from './barrel'\n` + log('secret()'),
    },
    denied: ['src/marked.ts'],
    expect: { 'src/barrel.ts -> ./marked': true },
  },
  {
    name: 'a mixed barrel as a namespace, only its safe export used',
    files: {
      'src/marked.ts': SECRET,
      'src/barrel.ts': `export { secret } from './marked'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import * as b from './barrel'\n` + log('b.label()'),
    },
    denied: ['src/marked.ts'],
    expect: { 'src/barrel.ts -> ./marked': false },
  },

  // export * from a denied module
  {
    name: 'export * of a denied module, a name used',
    files: {
      'src/secret.server.ts': SECRET,
      'src/mod.ts': `export * from './secret.server'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { secret } from './mod'\n` + log('secret()'),
    },
    expect: { 'src/mod.ts -> ./secret.server': true },
  },
  {
    name: 'export * of a denied module, unused',
    files: {
      'src/secret.server.ts': SECRET,
      'src/mod.ts': `export * from './secret.server'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './mod'\n` + log('label()'),
    },
    expect: { 'src/mod.ts -> ./secret.server': false },
  },
  {
    name: 'export * as ns of a denied module, used',
    files: {
      'src/secret.server.ts': SECRET,
      'src/mod.ts': `export * as srv from './secret.server'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { srv } from './mod'\n` + log('srv.secret()'),
    },
    expect: { 'src/mod.ts -> ./secret.server': true },
  },

  // side-effect-only imports
  {
    name: 'a side-effect import of an effectful module',
    files: {
      'src/effect.server.ts': `globalThis.secretLoaded = 'MARK_EFFECT'\n`,
      'src/entry.ts':
        `import './effect.server'\n` + log(`'client', globalThis.secretLoaded`),
    },
    expect: { 'src/entry.ts -> ./effect.server': true },
  },
  {
    // A bare import says the module runs: a violation wherever its importer
    // is evaluated, whatever the module does.
    name: 'a side-effect import of a pure module',
    files: {
      'src/effect.server.ts': SECRET,
      'src/entry.ts': `import './effect.server'\n` + log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./effect.server': true },
  },
  {
    // Side-effect import in a module that is otherwise unused: its effects
    // still run (a module with a side-effectful dependency is evaluated).
    name: 'a side-effect import in a module the entry imports',
    files: {
      'src/effect.server.ts': `globalThis.secretLoaded = 'MARK_EFFECT'\n`,
      'src/util.ts': `import './effect.server'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import './util'\n` + log(`globalThis.secretLoaded`),
    },
    expect: { 'src/util.ts -> ./effect.server': true },
  },

  // dynamic import()
  {
    name: 'a dynamic import, used',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts': `import('./secret.server').then((m) => console.log('OUT', m.secret()))\n`,
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
  },
  {
    name: 'a dynamic import in an unused function',
    files: {
      'src/secret.server.ts': SECRET,
      'src/util.ts': `export const load = () => import('./secret.server')\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './util'\n` + log('label()'),
    },
    expect: { 'src/util.ts -> ./secret.server': false },
    rspack: { 'src/util.ts -> ./secret.server': true },
  },
  {
    name: 'a dynamic import in if (false)',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `if (false) { import('./secret.server') }\n` + log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': false },
  },

  // inlined exports
  {
    name: 'an inlined const',
    files: {
      'src/secret.server.ts': `export const SECRET = 'MARK_CONST'\n`,
      'src/entry.ts':
        `import { SECRET } from './secret.server'\n` + log('SECRET'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
  },
  {
    name: 'an inlined enum member',
    files: {
      'src/secret.server.ts': `export enum Key { A = 'MARK_ENUM', B = 'other' }\n`,
      'src/entry.ts': `import { Key } from './secret.server'\n` + log('Key.A'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
  },
  {
    name: 'an inlined const, unused',
    files: {
      'src/secret.server.ts': `export const SECRET = 'MARK_CONST'\n`,
      'src/entry.ts':
        `import { SECRET } from './secret.server'\nconst unused = () => SECRET\n` +
        log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': false },
  },

  // semantics of proxies (only matters for allowed edges)
  {
    name: 'a live binding',
    files: {
      'src/counter.server.ts': `export let count = 0\nexport function inc() { count++ }\n`,
      'src/entry.ts':
        `import { count, inc } from './counter.server'\ninc()\n` + log('count'),
    },
    expect: { 'src/entry.ts -> ./counter.server': true },
  },
  {
    // The cycle enters at the denied module: an owned alias (`const x = m.x`)
    // in a proxy would read the binding in its TDZ.
    name: 'a cycle entered at the target',
    files: {
      'src/secret.server.ts': `import { useIt } from './a'\nexport const secret = () => 'MARK_SECRET'\nexport const run = () => useIt()\n`,
      'src/a.ts': `import { secret } from './secret.server'\nexport const useIt = () => secret()\n`,
      'src/exempt/main.ts': `import { run } from '../secret.server'\nexport const go = () => run()\n`,
      'src/entry.ts': `import { go } from './exempt/main'\n` + log('go()'),
    },
    expect: { 'src/a.ts -> ./secret.server': true },
  },
  // JavaScript importers (no TypeScript import elision)
  {
    name: 'a named import, unused (JavaScript)',
    entry: 'src/entry.js',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.js':
        `import { secret } from './secret.server'\n` + log(`'client'`),
    },
    expect: { 'src/entry.js -> ./secret.server': false },
  },
  {
    // The pure-annotated corpus of build-outcomes.test.ts: the initializer has
    // effects but the annotation lets the bundler drop it.
    name: 'an unused import of a module with a pure-annotated effectful initializer (JavaScript)',
    entry: 'src/entry.js',
    files: {
      'src/corpus.server.ts': `function initialize() {\n  globalThis.corpusInitialized = true\n  return () => 'MARK_CORPUS'\n}\nexport const corpus = /*#__PURE__*/ initialize()\n`,
      'src/entry.js':
        `import { corpus } from './corpus.server'\n` +
        log(`'client', globalThis.corpusInitialized`),
    },
    expect: { 'src/entry.js -> ./corpus.server': false },
  },
  {
    // Unused binding, effectful target: the mock alone decides, and nothing
    // reads it: the bundler drops it, nothing is reported.
    name: 'an unused binding of an effectful module (JavaScript)',
    entry: 'src/entry.js',
    files: {
      'src/secret.server.ts':
        `globalThis.secretLoaded = 'MARK_EFFECT'\n` + SECRET,
      'src/entry.js':
        `import { secret } from './secret.server'\n` +
        log(`'client', globalThis.secretLoaded`),
    },
    expect: { 'src/entry.js -> ./secret.server': false },
  },
  {
    // Same, but the effectful target is also imported by an exempt importer:
    // the in-scope edge adds nothing, yet its import is still an evaluation
    // edge of the output. Policy row: `null` = either verdict defensible.
    name: 'an unused binding of an effectful module an exempt importer also imports (JavaScript)',
    entry: 'src/entry.js',
    files: {
      'src/secret.server.ts':
        `globalThis.secretLoaded = 'MARK_EFFECT'\n` + SECRET,
      'src/exempt/a.js': `import { secret } from '../secret.server'\nexport const a = () => secret()\n`,
      'src/b.js': `import { secret } from './secret.server'\nexport const label = () => 'client'\n`,
      'src/entry.js':
        `import { a } from './exempt/a'\nimport { label } from './b'\n` +
        log('a(), label()'),
    },
    expect: { 'src/b.js -> ./secret.server': null },
  },
  {
    name: 'unused through a denied barrel (JavaScript)',
    entry: 'src/entry.js',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export { secret } from './secret'\n`,
      'src/entry.js': `import { secret } from './barrel'\n` + log(`'client'`),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/entry.js -> ./barrel': false },
  },
  {
    // A denied module importing another denied module, both live in the
    // real program. e1 is a violation; e2 is only in the output if e1 is
    // given the real module (policy row for e2).
    name: 'a denied module importing a denied module',
    files: {
      'src/inner.server.ts': `export const inner = () => 'MARK_INNER'\n`,
      // (`describeValue`: the mock told by what it does, never by its label)
      'src/secret.server.ts': `import { inner } from './inner.server'\n${describeValuePrelude}export const secret = () => 'MARK_SECRET ' + describeValue(inner(), 'MARK_INNER')\n`,
      'src/entry.ts':
        `import { secret } from './secret.server'\n` + log('secret()'),
    },
    expect: {
      'src/entry.ts -> ./secret.server': true,
      'src/secret.server.ts -> ./inner.server': null,
    },
  },
  {
    // Bare import in a module only reachable through a dead dynamic import.
    name: 'a side-effect import in a module behind a dead import()',
    files: {
      'src/effect.server.ts': `globalThis.secretLoaded = 'MARK_EFFECT'\n`,
      'src/lazy.ts': `import './effect.server'\nexport const lazy = 1\n`,
      'src/util.ts': `export const load = () => import('./lazy')\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './util'\n` + log('label()'),
    },
    expect: { 'src/lazy.ts -> ./effect.server': false },
    rspack: { 'src/lazy.ts -> ./effect.server': true },
  },
  {
    // Only the minifier can prove the use dead (the bundler keeps it).
    name: 'a use dead only after minification',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\nconst mode = { m: 'prod' }.m\nif (mode === 'dev') console.log(secret())\n` +
        log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': null },
  },
]
