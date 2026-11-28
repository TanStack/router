/**
 * Shared test helper: apps in temporary directories, configured and
 * generated like the bundler plugins and the CLI do.
 */
import {
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { Generator, getConfig } from '../src'
import { recordInputs } from './consumer-inputs'
import type { Config } from '../src'

/**
 * Creates an app in a new directory of `dir` (a test's `appRoot`, which it
 * goes with) with the given files (paths relative to the app root) and
 * returns its root.
 */
export async function createApp(dir: string, files: Record<string, string>) {
  const root = await mkdtemp(path.join(dir, 'tsr-app-'))
  for (const [file, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(root, file)), { recursive: true })
    await writeFile(path.join(root, file), content)
  }
  recordInputs(root, files)
  return root
}

/**
 * The configuration of the app at `root`, read like the bundler plugins do
 * (its `tsr.config.json`, then `inlineConfig`), with the default `src/routes`
 * directory and `src/routeTree.gen.ts` route tree. Temporary files go to the
 * app, on the same filesystem.
 */
export function configOf(root: string, inlineConfig: Partial<Config> = {}) {
  const config = getConfig(
    {
      disableLogging: true,
      tmpDir: path.join(root, '.tanstack/tmp'),
      ...inlineConfig,
    },
    root,
  )
  recordInputs(root, {}, config.target)
  return config
}

/** Runs a new generator once on the app at `root`. */
export async function generate(
  root: string,
  inlineConfig: Partial<Config> = {},
) {
  const config = configOf(root, inlineConfig)
  await new Generator({ config, root }).run()
  return config
}

/** Reads an app file (path relative to the app root). */
export function read(root: string, file: string) {
  return readFile(path.join(root, file), 'utf8')
}

let saves = 0

/**
 * Writes an app file (path relative to the app root) like an editor save: its
 * modification time is later than that of any file written before. Returns
 * the absolute path, as a file watcher reports it.
 */
export async function save(root: string, file: string, content: string) {
  const filePath = path.join(root, file)
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, content)
  const savedAt = new Date(Date.now() + 10_000 + ++saves * 1000)
  await utimes(filePath, savedAt, savedAt)
  recordInputs(root, { [file]: content })
  return filePath
}

/**
 * An app (in `dir`, as `createApp`) with a root route and a route file (id
 * `/wrong`) for each of `files`.
 */
export function appWithRoutes(dir: string, files: Array<string>) {
  return createApp(dir, {
    'src/routes/__root.tsx': rootRoute(),
    ...Object.fromEntries(
      files.map((file) => [`src/routes/${file}`, fileRoute('/wrong')]),
    ),
  })
}

/**
 * Writes `text` to `target` (relative to `root`) and links `link` to it,
 * with `linkText` as the link's text.
 */
export async function linked(
  root: string,
  link: string,
  target: string,
  text: string,
  linkText = path.join(root, target),
) {
  await mkdir(path.dirname(path.join(root, target)), { recursive: true })
  await writeFile(path.join(root, target), text)
  await mkdir(path.dirname(path.join(root, link)), { recursive: true })
  await symlink(linkText, path.join(root, link))
}

/** A root route file for `target`. */
export function rootRoute(target: Config['target'] = 'react') {
  return `import { createRootRoute } from '@tanstack/${target}-router'

export const Route = createRootRoute()
`
}

/** A route file for `target` creating its route with `id` and `options`. */
export function fileRoute(
  id: string,
  options = '{}',
  target: Config['target'] = 'react',
) {
  return `import { createFileRoute } from '@tanstack/${target}-router'

export const Route = createFileRoute('${id}')(${options})
`
}

/** A lazy route file for `target` creating its route with `id`. */
export function lazyFileRoute(
  id: string,
  options = '{}',
  target: Config['target'] = 'react',
) {
  return `import { createLazyFileRoute } from '@tanstack/${target}-router'

export const Route = createLazyFileRoute('${id}')(${options})
`
}
