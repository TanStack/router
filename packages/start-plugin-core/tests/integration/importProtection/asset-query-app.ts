/**
 * What the asset-query tests share: apps around a denied file, the import
 * forms, and what a build emitted.
 */
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { buildStart } from '../../build-harness'
import type { StartBundler } from '../../build-harness'

export const timeout = 60_000

export const CANARY = 'CANARY_DENIED_TEXT'

export const app = (entry: string, files: Record<string, string>) => ({
  ...files,
  'src/entry.ts': entry,
  'src/router.ts': `import './entry'
export const getRouter = () => undefined
`,
})

/** A denied file by rule: `?raw` etc. are appended by each form. */
export const byFileRule = {
  'src/secrets.server.ts': `export const s = '${CANARY}'\n`,
}
export const byMarker = {
  'src/marked.ts': `import '@tanstack/react-start/server-only'
export const s = '${CANARY}'
`,
}
export const textFile = { 'src/notes.server.txt': CANARY }

/** A module's value as text (a mock is a callable proxy; its text is a placeholder). */
export const toText = `const toText = (m: any) => {
  const value = m?.default ?? m
  return typeof value === 'object' ? JSON.stringify(value) : String(value)
};
`
export const exposing = (values: string) =>
  `${toText}(globalThis as any).texts = async () => ${values}\n`

export const staticImport = (specifier: string) =>
  `import * as module from '${specifier}'\n${exposing('[toText(module)]')}`
export const eagerGlob = (pattern: string, query: string) =>
  `const modules = import.meta.glob('${pattern}', { query: '${query}', eager: true });\n${exposing('Object.values(modules).map(toText)')}`
export const lazyGlob = (pattern: string, query: string) =>
  `const modules = import.meta.glob('${pattern}', { query: '${query}' });\n${exposing('Promise.all(Object.values(modules).map((load: any) => load().then(toText)))')}`
export const templateImport = (name: string, suffix: string) =>
  `${toText}(globalThis as any).texts = async (name = '${name}') => [toText(await import(\`./\${name}${suffix}\`))]\n`
export const webpackContext = (regExp: string) =>
  `const context = (import.meta as any).webpackContext('./?raw', { recursive: false, regExp: ${regExp} });\n${exposing('context.keys().map((key: string) => toText(context(key)))')}`

export type Files = Record<string, string>

/** Whether an emitted file holds `canary`, as it is or as a base64 `data:` URL (`?inline`). */
export async function emittedCanaries(
  dir: string,
  canary = CANARY,
): Promise<Array<string>> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true })
  const hits: Array<string> = []
  for (const entry of entries) {
    if (!entry.isFile()) {
      continue
    }
    const file = path.join(entry.parentPath, entry.name)
    const text = await readFile(file, 'latin1')
    const inlined = [...text.matchAll(/;base64,([A-Za-z0-9+/=]+)/g)].map((m) =>
      Buffer.from(m[1]!, 'base64').toString('latin1'),
    )
    if ([text, ...inlined].some((t) => t.includes(canary))) {
      hits.push(file)
    }
  }
  return hits
}

export const importProtection = { behavior: 'mock', mockAccess: 'off' } as const

export const clientViolations = (build: {
  violations: Array<{ envType: string }>
}) => build.violations.filter((v) => v.envType === 'client').length

export const buildApp = (
  bundler: StartBundler,
  entry: string,
  files: Files,
  options: Record<string, unknown> = importProtection,
) =>
  buildStart({
    bundler,
    files: app(entry, files),
    entry: 'src/entry.ts',
    start: { importProtection: options },
  })

/**
 * The canary of form `index` of `formsApp` (`_` after the number: no
 * canary is a prefix of another).
 */
export const canaryOf = (index: number) => `${CANARY}_${index}_`

/** The directory of form `index` of `formsApp`. */
export const formDir = (index: number) => `src/f${index}`

/**
 * One app of several forms (`[name, entry, files]`, as `app` takes them):
 * form `i` is `src/f<i>/` (`formDir`), its entry `src/f<i>/entry.ts` and its
 * files there, with the canary `canaryOf(i)`; its reader is
 * `globalThis.texts<i>`. The app's entry imports every form's entry.
 */
export function formsApp(forms: Array<[string, string, Files]>) {
  const files: Files = {}
  forms.forEach(([, entry, own], i) => {
    for (const [file, text] of Object.entries(own)) {
      files[file.replace(/^src\//, `${formDir(i)}/`)] = text.replaceAll(
        CANARY,
        canaryOf(i),
      )
    }
    files[`${formDir(i)}/entry.ts`] = entry.replace(
      '(globalThis as any).texts =',
      `(globalThis as any).texts${i} =`,
    )
  })
  return app(forms.map((_, i) => `import './f${i}/entry'\n`).join(''), files)
}

/**
 * `readTexts` of each of `count` forms of `formsApp`: by form, its reading,
 * or `{ error }` when its reader throws.
 */
export const readFormTexts = (count: number) => `const all = []
for (let i = 0; i < ${count}; i++) {
  try {
    const out = []
    for (const value of await globalThis['texts' + i]()) {
      out.push(value)
      if (value.startsWith('data:')) {
        out.push(atob(value.split(',')[1]))
      } else if (value.startsWith('/') || value.startsWith('http')) {
        out.push(await (await fetch(value)).text())
      }
    }
    all.push(out.join('\\n'))
  } catch (error) {
    all.push({ error: String(error?.message ?? error) })
  }
}
return all`

/** The page's texts, and for each a URL's content (`?url`) or a `data:` URL's. */
export const readTexts = `const out = []
for (const value of await globalThis.texts()) {
  out.push(value)
  if (value.startsWith('data:')) {
    out.push(atob(value.split(',')[1]))
  } else if (value.startsWith('/') || value.startsWith('http')) {
    out.push(await (await fetch(value)).text())
  }
}
return out.join('\\n')`
