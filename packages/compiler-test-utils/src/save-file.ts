/**
 * How the dev-server harnesses save an app file: atomically, as editors
 * that save through a temporary file do. The contents go to a temporary
 * file in `.harness-tmp/` next to the app's root (the same filesystem, and
 * outside the app: no dev server watches it, Rspack resolves nothing
 * there, no route generator scans it and no module imports it), which is
 * then renamed over the target.
 *
 * A plain `writeFile` truncates the file, then writes it: a file watcher may
 * look at the file in between and report it empty, and then not report the
 * write that follows a moment later (chokidar, Vite's watcher, drops a second
 * event of a file within a moment of the first). A rename replaces the file
 * in one step, so whatever a watcher looks at is the whole new file.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

let saved = 0

/** Saves `code` as the file `file` of the app at `root` (absolute paths). */
export async function saveAppFile(root: string, file: string, code: string) {
  const temporaryDirectory = path.join(path.dirname(root), '.harness-tmp')
  await mkdir(temporaryDirectory, { recursive: true })
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = path.join(
    temporaryDirectory,
    `${process.pid}-${++saved}-${path.basename(file)}`,
  )
  await writeFile(temporary, code)
  await rename(temporary, file)
}
