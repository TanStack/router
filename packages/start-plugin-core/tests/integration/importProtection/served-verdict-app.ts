/**
 * The apps and readers of the served-verdict tests (`served-verdict.test.ts`,
 * `served-demand.test.ts`): a denied file compiled under its own id, a plain
 * importer and a pattern importer (`import.meta.glob`,
 * `import.meta.webpackContext`) of it.
 */
import { problems } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { StartBuildError } from '../../build-harness'
import { importersIn } from './v2-hosts'
import type { StartBuild } from '../../build-harness'
import type { ImportProtectionOptions } from '../../importProtection/public-types'
import type { Plugin } from 'vite'

export const timeout = 120_000

export const denied = 'src/lib/db.server.ts'

export const deniedModule = `export const secret = () => 'MARK_SECRET'\n`

/** What a use reads: the real value's text, or `mock`. */
export const text = `const text = (value: unknown) =>
  typeof value === 'string' && value.startsWith('MARK_') ? value : 'mock'
`

/** The pattern import of `src/lib/*.server.ts` from `src/<dir>/`, eager or lazy. */
export function patternImporter(
  bundler: 'vite' | 'rsbuild',
  depth: string,
  lazy: boolean,
): string {
  const reach =
    bundler === 'vite'
      ? `const modules = import.meta.glob('${depth}lib/*.server.ts'${lazy ? '' : ', { eager: true }'}) as Record<string, any>
const all = () => Promise.all(Object.values(modules).map((m: any) => ${lazy ? 'm()' : 'm'}))
`
      : `const context = import.meta.webpackContext('${depth}lib', { recursive: false, regExp: /\\.server\\.ts$/${lazy ? `, mode: 'lazy'` : ''} })
const all = () => Promise.all(context.keys().map((key: string) => context(key)))
`
  return `${text}${reach}export const viaGlob = async () => (await all()).map((m: any) => text(m.secret()))
`
}

/** A module that imports the denied file plainly (`dir`: its directory under `src/`, `''` for `src/`). */
export const plainImporter = (
  dir: string,
) => `${text}import { secret } from '${dir ? '../' : './'}lib/db.server'
export const viaPlain = () => text(secret())
`

export interface Shape {
  bundler: 'vite' | 'rsbuild'
  /** Where the pattern importer lives: `generated` is exempt, `src` is checked. */
  glob: 'generated' | 'src'
  /** Which importer the entry reaches first; the plain one is three modules deep when it comes second. */
  first: 'plain' | 'pattern'
  lazy?: boolean
}

/**
 * The app: `src/generated/reg.ts` (exempt by `exclude`) imports the denied
 * file plainly; the pattern importer reaches it too. The entry exports both
 * uses and puts them on `globalThis.uses` (dev pages).
 */
export function app({ bundler, glob, first, lazy = false }: Shape) {
  const globFile =
    glob === 'generated' ? 'src/generated/glob.ts' : 'src/glob.ts'
  const globFrom = glob === 'generated' ? './generated/glob' : './glob'
  const imports = [
    `import { viaPlain } from '${first === 'plain' ? './generated/reg' : './a'}'`,
    `import { viaGlob } from '${globFrom}'`,
  ]
  if (first === 'pattern') {
    imports.reverse()
  }
  return {
    [denied]: deniedModule,
    'src/generated/reg.ts': plainImporter('generated'),
    [globFile]: patternImporter(
      bundler,
      glob === 'generated' ? '../' : './',
      lazy,
    ),
    'src/a.ts': `export { viaPlain } from './b'\n`,
    'src/b.ts': `export { viaPlain } from './c'\n`,
    'src/c.ts': `export { viaPlain } from './generated/reg'\n`,
    'src/entry.ts': `${imports.join('\n')}
export { viaPlain, viaGlob }
;(globalThis as any).uses = { plain: viaPlain, glob: viaGlob }
`,
    'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
  }
}

export const options = (
  behavior: 'mock' | 'error',
  extra: ImportProtectionOptions = {},
): ImportProtectionOptions => ({
  behavior,
  mockAccess: 'off',
  exclude: ['src/generated/**'],
  ...extra,
})

/**
 * `src/generated/reg.ts` checked (only `src/generated/glob.ts` exempt), its
 * import of the denied file allowed by `allowImport` (the pattern
 * importer's is not).
 */
export const allowedPlain = (behavior: 'mock' | 'error') =>
  options(behavior, {
    exclude: ['src/generated/glob.ts'],
    allowImport: (info) => info.importer.includes('generated/reg'),
  })

/** What a build's two uses read. */
export async function uses(build: StartBuild) {
  const { result } = await build.client.run(
    `return { plain: entry.viaPlain(), glob: await entry.viaGlob() }`,
  )
  return result as { plain: string; glob: Array<string> }
}

/** A problem's severity, and the denied file when it names it. */
export const named = ({
  severity,
  text,
}: {
  severity: string
  text: string
}) => (text.includes(denied) ? `${severity} ${denied}` : severity)

/**
 * A build's outcome: the uses, the reported client importers and every
 * warning or error (its severity, and the denied file when it names it); a
 * failed build's errors.
 */
export async function outcomeOf(build: () => Promise<StartBuild>) {
  try {
    const built = await build()
    return {
      failed: false,
      uses: await uses(built),
      reported: importersIn(built, 'client'),
      problems: problems(built.diagnostics).map(named),
    }
  } catch (error) {
    if (!(error instanceof StartBuildError)) {
      throw error
    }
    return {
      failed: true,
      errors: problems(error.diagnostics)
        .filter(({ severity }) => severity === 'error')
        .map(({ text }) => text),
    }
  }
}

/** One module, real for both uses, and nothing reported. */
export const realForBoth = {
  failed: false,
  uses: { plain: 'MARK_SECRET', glob: ['MARK_SECRET'] },
  reported: [],
  problems: [],
}

/**
 * Holds the client environment's `load` of `held` until Start compiled
 * `first` (a module of the same build), in each build of a watch build and
 * on a dev server's first load: a user plugin that is slow on one file.
 */
export function holdUntilCompiled(held: string, first: string): Array<Plugin> {
  let release!: () => void
  let compiled!: Promise<void>
  const client = (environment: { name: string }) =>
    environment.name === 'client'
  return [
    {
      name: 'test:hold-load',
      enforce: 'pre',
      applyToEnvironment: client,
      buildStart() {
        compiled = new Promise<void>((resolve) => (release = resolve))
      },
      async load(id) {
        if (id.endsWith(held)) {
          await compiled
        }
        return null
      },
    },
    {
      name: 'test:compiled',
      applyToEnvironment: client,
      transform: {
        order: 'post',
        handler(_code, id) {
          if (id.endsWith(first)) {
            release()
          }
        },
      },
    },
  ]
}

/** The dev page's two uses. */
export const readScript = `const { plain, glob } = globalThis.uses
return { plain: plain(), glob: await glob() }`
