/**
 * The survival-witness case matrix of the J6 spike (spike-j6-witness.md,
 * C1–C9, S1–S2): tiny apps, each with the verdict expected per violating
 * edge (`importer -> specifier`): `true` reported (the edge survives
 * tree-shaking), `false` not, `null` a policy row (either verdict). Where a
 * bundler's real output differs, `rspack` overrides the expectation.
 *
 * - `files`: the app; the entry is `src/entry.ts` unless `entry` says.
 * - `denied`: the client file rule (root-relative globs); default `**\/*.server.*`.
 * - importers under `src/exempt/` are ignored (`ignoreImporters`).
 */

export interface WitnessCase {
  name: string
  files: Record<string, string>
  entry?: string
  denied?: Array<string>
  expect: Record<string, boolean | null>
  /** Rspack's own truth where it differs (it keeps `import()` in an unused function, and the entry's exports). */
  rspack?: Record<string, boolean | null>
  expectOut: Array<string>
}

const SECRET = `export const secret = () => 'MARK_SECRET' + Math.random().toString().slice(0, 0)\n`
const log = (expr: string) => `console.log('OUT', ${expr})\n`

export const cases: Array<WitnessCase> = [
  // --- C1 live direct imports -------------------------------------------
  {
    name: 'C1a named live',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\n` + log('secret()'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C1b default live',
    files: {
      'src/secret.server.ts': `export default function secret() { return 'MARK_SECRET' }\n`,
      'src/entry.ts': `import s from './secret.server'\n` + log('s()'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C1c namespace member live',
    files: {
      'src/secret.server.ts':
        SECRET + `export const other = () => 'MARK_OTHER'\n`,
      'src/entry.ts':
        `import * as ns from './secret.server'\n` + log('ns.secret()'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C1d namespace computed key live',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import * as ns from './secret.server'\nconst k = globalThis.key ?? 'secret'\n` +
        log('ns[k]()'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C1e named live via a non-entry module',
    files: {
      'src/secret.server.ts': SECRET,
      'src/util.ts': `import { secret } from './secret.server'\nexport const read = () => secret()\nexport const unrelated = 1\n`,
      'src/entry.ts': `import { read } from './util'\n` + log('read()'),
    },
    expect: { 'src/util.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },

  // --- C2 dead imports ---------------------------------------------------
  {
    name: 'C2a imported, unused',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\n` + log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': false },
    expectOut: ['client'],
  },
  {
    name: 'C2b used only in an unused function',
    files: {
      'src/secret.server.ts': SECRET,
      'src/util.ts': `import { secret } from './secret.server'\nexport const read = () => secret()\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './util'\n` + log('label()'),
    },
    expect: { 'src/util.ts -> ./secret.server': false },
    expectOut: ['client'],
  },
  {
    name: 'C2c used only in if (false)',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\nif (false) { console.log(secret()) }\n` +
        log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': false },
    expectOut: ['client'],
  },
  {
    name: 'C2d unused binding, effectful target',
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
    expectOut: ['client undefined'],
  },
  {
    // An exempt importer uses the target; the in-scope importer does not.
    // A per-target witness (is the real module in the bundle?) reports here.
    name: 'C2e dead edge, target live through an exempt importer',
    files: {
      'src/secret.server.ts': SECRET,
      'src/exempt/a.ts': `import { secret } from '../secret.server'\nexport const a = () => secret()\n`,
      'src/b.ts': `import { secret } from './secret.server'\nexport const b = () => secret()\nexport const label = () => 'client'\n`,
      'src/entry.ts':
        `import { a } from './exempt/a'\nimport { label } from './b'\n` +
        log('a(), label()'),
    },
    expect: { 'src/b.ts -> ./secret.server': false },
    expectOut: ['MARK_SECRET', 'client'],
  },

  // --- C3 denied transparent barrel ------------------------------------
  {
    // build.test.ts:116 — the barrel is denied, the value lives in a
    // non-denied module.
    name: 'C3a live through denied named re-export barrel',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export { secret } from './secret'\n`,
      'src/entry.ts': `import { secret } from './barrel'\n` + log('secret()'),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/entry.ts -> ./barrel': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C3b live through denied export-star barrel',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export * from './secret'\n`,
      'src/entry.ts': `import { secret } from './barrel'\n` + log('secret()'),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/entry.ts -> ./barrel': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C3c dead through denied barrel',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export { secret } from './secret'\n`,
      'src/entry.ts': `import { secret } from './barrel'\n` + log(`'client'`),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/entry.ts -> ./barrel': false },
    expectOut: ['client'],
  },
  {
    // The denied barrel is reached through a second (allowed) barrel.
    name: 'C3d live through a two-level chain ending at a denied barrel',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export { secret } from './secret'\n`,
      'src/outer.ts': `export { secret } from './barrel'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { secret } from './outer'\n` + log('secret()'),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/outer.ts -> ./barrel': true },
    expectOut: ['MARK_SECRET'],
  },

  // --- C4 mixed barrel ------------------------------------------------------
  {
    // build.test.ts:356 — barrel not denied, re-exports a denied module
    // and a safe export; the client uses only the safe export.
    name: 'C4a dead mixed barrel',
    files: {
      'src/marked.ts': SECRET,
      'src/barrel.ts': `export { secret } from './marked'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './barrel'\n` + log('label()'),
    },
    denied: ['src/marked.ts'],
    expect: { 'src/barrel.ts -> ./marked': false },
    expectOut: ['client'],
  },
  {
    name: 'C4b live mixed barrel',
    files: {
      'src/marked.ts': SECRET,
      'src/barrel.ts': `export { secret } from './marked'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { secret } from './barrel'\n` + log('secret()'),
    },
    denied: ['src/marked.ts'],
    expect: { 'src/barrel.ts -> ./marked': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C4c dead mixed barrel, imported as namespace member',
    files: {
      'src/marked.ts': SECRET,
      'src/barrel.ts': `export { secret } from './marked'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import * as b from './barrel'\n` + log('b.label()'),
    },
    denied: ['src/marked.ts'],
    expect: { 'src/barrel.ts -> ./marked': false },
    expectOut: ['client'],
  },

  // --- C5 export * from a denied module --------------------------------
  {
    name: 'C5a export * from denied, name used',
    files: {
      'src/secret.server.ts': SECRET,
      'src/mod.ts': `export * from './secret.server'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { secret } from './mod'\n` + log('secret()'),
    },
    expect: { 'src/mod.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C5b export * from denied, unused',
    files: {
      'src/secret.server.ts': SECRET,
      'src/mod.ts': `export * from './secret.server'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './mod'\n` + log('label()'),
    },
    expect: { 'src/mod.ts -> ./secret.server': false },
    expectOut: ['client'],
  },
  {
    name: 'C5c export * as ns from denied, used',
    files: {
      'src/secret.server.ts': SECRET,
      'src/mod.ts': `export * as srv from './secret.server'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { srv } from './mod'\n` + log('srv.secret()'),
    },
    expect: { 'src/mod.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },

  // --- C6 side-effect-only imports -------------------------------------
  {
    name: 'C6a side-effect import, effectful target',
    files: {
      'src/effect.server.ts': `globalThis.secretLoaded = 'MARK_EFFECT'\n`,
      'src/entry.ts':
        `import './effect.server'\n` + log(`'client', globalThis.secretLoaded`),
    },
    expect: { 'src/entry.ts -> ./effect.server': true },
    expectOut: ['MARK_EFFECT'],
  },
  {
    // The real program drops the pure target entirely.
    name: 'C6b side-effect import, pure target',
    files: {
      'src/effect.server.ts': SECRET,
      'src/entry.ts': `import './effect.server'\n` + log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./effect.server': false },
    expectOut: ['client'],
  },
  {
    // Side-effect import in a module that is otherwise unused: its effects
    // still run (a module with a side-effectful dependency is evaluated).
    name: 'C6c side-effect import from a non-entry module',
    files: {
      'src/effect.server.ts': `globalThis.secretLoaded = 'MARK_EFFECT'\n`,
      'src/util.ts': `import './effect.server'\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import './util'\n` + log(`globalThis.secretLoaded`),
    },
    expect: { 'src/util.ts -> ./effect.server': true },
    expectOut: ['MARK_EFFECT'],
  },

  // --- C7 dynamic import() ---------------------------------------------
  {
    name: 'C7a dynamic import, live',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts': `import('./secret.server').then((m) => console.log('OUT', m.secret()))\n`,
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },
  {
    name: 'C7b dynamic import in an unused function',
    files: {
      'src/secret.server.ts': SECRET,
      'src/util.ts': `export const load = () => import('./secret.server')\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './util'\n` + log('label()'),
    },
    expect: { 'src/util.ts -> ./secret.server': false },
    rspack: { 'src/util.ts -> ./secret.server': true },
    expectOut: ['client'],
  },
  {
    name: 'C7c dynamic import in if (false)',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `if (false) { import('./secret.server') }\n` + log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': false },
    expectOut: ['client'],
  },

  // --- C8 inlined exports ----------------------------------------------
  {
    name: 'C8a inlined const',
    files: {
      'src/secret.server.ts': `export const SECRET = 'MARK_CONST'\n`,
      'src/entry.ts':
        `import { SECRET } from './secret.server'\n` + log('SECRET'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
    expectOut: ['MARK_CONST'],
  },
  {
    name: 'C8b inlined enum member',
    files: {
      'src/secret.server.ts': `export enum Key { A = 'MARK_ENUM', B = 'other' }\n`,
      'src/entry.ts': `import { Key } from './secret.server'\n` + log('Key.A'),
    },
    expect: { 'src/entry.ts -> ./secret.server': true },
    expectOut: ['MARK_ENUM'],
  },
  {
    name: 'C8c inlined const, unused',
    files: {
      'src/secret.server.ts': `export const SECRET = 'MARK_CONST'\n`,
      'src/entry.ts':
        `import { SECRET } from './secret.server'\nexport const unused = () => SECRET\n` +
        log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': false },
    rspack: { 'src/entry.ts -> ./secret.server': true },
    expectOut: ['client'],
  },

  // --- semantics of proxies (only matters for allowed / vetoed edges) --
  {
    name: 'S1 live binding through an allowed edge',
    files: {
      'src/counter.server.ts': `export let count = 0\nexport function inc() { count++ }\n`,
      'src/entry.ts':
        `import { count, inc } from './counter.server'\ninc()\n` + log('count'),
    },
    expect: { 'src/entry.ts -> ./counter.server': true },
    expectOut: ['OUT 1'],
  },
  {
    // The cycle enters at the denied module: an owned alias (`const x = m.x`)
    // in a proxy would read the binding in its TDZ.
    name: 'S2 cycle entered at the target',
    files: {
      'src/secret.server.ts': `import { useIt } from './a'\nexport const secret = () => 'MARK_SECRET'\nexport const run = () => useIt()\n`,
      'src/a.ts': `import { secret } from './secret.server'\nexport const useIt = () => secret()\n`,
      'src/exempt/main.ts': `import { run } from '../secret.server'\nexport const go = () => run()\n`,
      'src/entry.ts': `import { go } from './exempt/main'\n` + log('go()'),
    },
    expect: { 'src/a.ts -> ./secret.server': true },
    expectOut: ['MARK_SECRET'],
  },
  // --- JS importers (no TypeScript import elision) ----------------------
  {
    name: 'C2a-js imported, unused',
    entry: 'src/entry.js',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.js':
        `import { secret } from './secret.server'\n` + log(`'client'`),
    },
    expect: { 'src/entry.js -> ./secret.server': false },
    expectOut: ['client'],
  },
  {
    // The pure-annotated corpus of known-bugs.test.ts: the initializer has
    // effects but the annotation lets the bundler drop it.
    name: 'C2g-js imported, unused, pure-annotated effectful initializer',
    entry: 'src/entry.js',
    files: {
      'src/corpus.server.ts': `function initialize() {\n  globalThis.corpusInitialized = true\n  return () => 'MARK_CORPUS'\n}\nexport const corpus = /*#__PURE__*/ initialize()\n`,
      'src/entry.js':
        `import { corpus } from './corpus.server'\n` +
        log(`'client', globalThis.corpusInitialized`),
    },
    expect: { 'src/entry.js -> ./corpus.server': false },
    expectOut: ['client undefined'],
  },
  {
    // Unused binding, effectful target: the real program runs the target's
    // top-level code, so the import edge is kept (as an evaluation edge).
    name: 'C2d-js unused binding, effectful target',
    entry: 'src/entry.js',
    files: {
      'src/secret.server.ts':
        `globalThis.secretLoaded = 'MARK_EFFECT'\n` + SECRET,
      'src/entry.js':
        `import { secret } from './secret.server'\n` +
        log(`'client', globalThis.secretLoaded`),
    },
    expect: { 'src/entry.js -> ./secret.server': true },
    expectOut: ['MARK_EFFECT'],
  },
  {
    // Same, but the effectful target is also imported by an exempt importer:
    // the in-scope edge adds nothing, yet its import is still an evaluation
    // edge of the output. Policy row: `null` = either verdict defensible.
    name: 'C2f-js unused binding, effectful target, also imported by exempt importer',
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
    expectOut: ['MARK_SECRET', 'client'],
  },
  {
    name: 'C3c-js dead through denied barrel',
    entry: 'src/entry.js',
    files: {
      'src/secret.ts': SECRET,
      'src/barrel.ts': `export { secret } from './secret'\n`,
      'src/entry.js': `import { secret } from './barrel'\n` + log(`'client'`),
    },
    denied: ['src/barrel.ts'],
    expect: { 'src/entry.js -> ./barrel': false },
    expectOut: ['client'],
  },
  {
    // A denied module importing another denied module, both live in the
    // real program. e1 is a violation; e2 is only in the output if e1 is
    // given the real module (policy row for e2).
    name: 'C9 denied module importing a denied module',
    files: {
      'src/inner.server.ts': `export const inner = () => 'MARK_INNER'\n`,
      'src/secret.server.ts': `import { inner } from './inner.server'\nexport const secret = () => 'MARK_SECRET' + inner()\n`,
      'src/entry.ts':
        `import { secret } from './secret.server'\n` + log('secret()'),
    },
    expect: {
      'src/entry.ts -> ./secret.server': true,
      'src/secret.server.ts -> ./inner.server': null,
    },
    expectOut: ['MARK_SECRET'],
  },
  {
    // Bare import in a module only reachable through a dead dynamic import.
    name: 'C6d side-effect import in a module behind a dead import()',
    files: {
      'src/effect.server.ts': `globalThis.secretLoaded = 'MARK_EFFECT'\n`,
      'src/lazy.ts': `import './effect.server'\nexport const lazy = 1\n`,
      'src/util.ts': `export const load = () => import('./lazy')\nexport const label = () => 'client'\n`,
      'src/entry.ts': `import { label } from './util'\n` + log('label()'),
    },
    expect: { 'src/lazy.ts -> ./effect.server': false },
    rspack: { 'src/lazy.ts -> ./effect.server': true },
    expectOut: ['client'],
  },
  {
    // Only the minifier can prove the use dead (the bundler keeps it).
    name: 'C2h use dead only after minification',
    files: {
      'src/secret.server.ts': SECRET,
      'src/entry.ts':
        `import { secret } from './secret.server'\nconst mode = { m: 'prod' }.m\nif (mode === 'dev') console.log(secret())\n` +
        log(`'client'`),
    },
    expect: { 'src/entry.ts -> ./secret.server': null },
    expectOut: ['client'],
  },
]
