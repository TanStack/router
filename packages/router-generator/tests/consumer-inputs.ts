/** Fixture-owned files, recorded before generation; generated support is free. */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'

const apps = new Map<
  string,
  { files: Record<string, string>; target: string }
>()

export function recordInputs(
  root: string,
  files: Record<string, string>,
  target?: string,
) {
  const absolute = path.resolve(root)
  const app = apps.get(absolute) ?? { files: {}, target: 'react' }
  const inputs = app.files
  for (const [file, source] of Object.entries(files)) {
    inputs[path.resolve(root, file)] = source
  }
  app.target = target ?? app.target
  apps.set(absolute, app)
}

export async function recordDirectoryInputs(root: string, excluded: string) {
  const files: Record<string, string> = {}
  async function visit(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && !entry.name.startsWith('.')) {
          await visit(file)
        }
      } else if (
        file !== excluded &&
        /\.(?:[cm]?[jt]sx?|vue)$/.test(file) &&
        !file.endsWith('.test-d.ts')
      ) {
        files[path.relative(root, file)] = await readFile(file, 'utf8')
      }
    }
  }
  await visit(root)
  recordInputs(root, files)
}

export function inputsOf(file: string) {
  const entry = [...apps]
    .filter(([root]) => file.startsWith(root + path.sep))
    .sort(([a], [b]) => b.length - a.length)[0]
  if (!entry) {
    throw new Error(`No fixture inputs recorded for ${file}`)
  }
  return {
    root: entry[0],
    target: entry[1].target,
    files: Object.fromEntries(
      Object.entries(entry[1].files).filter(([input]) => existsSync(input)),
    ),
  }
}
