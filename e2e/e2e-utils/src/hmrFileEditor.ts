import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function replaceAll(source: string, from: string, to: string) {
  return source.split(from).join(to)
}

export type HmrFileEditorOptions<TFileKey extends string> = {
  rootDir?: string
  files: Record<TFileKey, string>
  normalizeSource?: (fileKey: TFileKey, source: string) => string
  /**
   * The least time between two writes of the same file. A dev server's file
   * watcher coalesces changes of one path: chokidar (Vite) emits one `change`
   * per path per 50 ms and drops the rest, so a second edit that lands
   * inside that window after the previous one never reaches the bundler. An
   * editor never saves that fast; a test that writes as soon as the page
   * reflects the previous edit does. Default 100 ms.
   */
  minWriteIntervalMs?: number
}

const DEFAULT_MIN_WRITE_INTERVAL_MS = 100

export function createHmrFileEditor<TFileKey extends string>(
  options: HmrFileEditorOptions<TFileKey>,
) {
  const files = Object.fromEntries(
    Object.entries(options.files).map(([key, filePath]) => [
      key,
      options.rootDir && !path.isAbsolute(filePath as string)
        ? path.join(options.rootDir, filePath as string)
        : (filePath as string),
    ]),
  ) as Record<TFileKey, string>
  const originalContents: Partial<Record<TFileKey, string>> = {}
  const pendingRestoreKeys = new Set<TFileKey>()
  const normalizeSource =
    options.normalizeSource ?? ((_fileKey: TFileKey, source: string) => source)
  const minWriteIntervalMs =
    options.minWriteIntervalMs ?? DEFAULT_MIN_WRITE_INTERVAL_MS
  const lastWriteAt = new Map<string, number>()

  async function writeSpaced(filePath: string, content: string) {
    const previous = lastWriteAt.get(filePath)
    if (previous !== undefined) {
      const wait = previous + minWriteIntervalMs - Date.now()
      if (wait > 0) {
        await new Promise((resolve) => setTimeout(resolve, wait))
      }
    }
    await writeFile(filePath, content)
    lastWriteAt.set(filePath, Date.now())
  }

  async function captureOriginals() {
    for (const [key, filePath] of Object.entries(files) as Array<
      [TFileKey, string]
    >) {
      const current = await readFile(filePath, 'utf8')
      const normalized = normalizeSource(key, current)

      if (normalized !== current) {
        await writeSpaced(filePath, normalized)
        pendingRestoreKeys.add(key)
      }

      originalContents[key] = normalized
    }
  }

  const capturePromise = captureOriginals()

  async function restoreFiles(forceFileKeys: Iterable<TFileKey> = []) {
    const forceRestoreKeys = new Set(forceFileKeys)
    const restoredFileKeys: Array<TFileKey> = []

    for (const [key, filePath] of Object.entries(files) as Array<
      [TFileKey, string]
    >) {
      const content = originalContents[key]
      if (content === undefined) continue

      const current = await readFile(filePath, 'utf8')

      if (current !== content || forceRestoreKeys.has(key)) {
        await writeSpaced(filePath, content)
        restoredFileKeys.push(key)
      }
    }

    return restoredFileKeys
  }

  async function replaceText(fileKey: TFileKey, from: string, to: string) {
    const filePath = files[fileKey]
    const source = await readFile(filePath, 'utf8')

    if (!source.includes(from)) {
      throw new Error(`Expected file to include ${JSON.stringify(from)}`)
    }

    await writeSpaced(filePath, source.replace(from, to))
  }

  async function rewriteFile(
    fileKey: TFileKey,
    updater: (source: string) => string,
    options: { allowNoop?: boolean } = {},
  ) {
    const filePath = files[fileKey]
    const source = await readFile(filePath, 'utf8')
    const updated = updater(source)

    if (updated === source && !options.allowNoop) {
      throw new Error(`Expected ${filePath} to change during rewrite`)
    }

    await writeSpaced(filePath, updated)
  }

  async function replaceTextAndWait(
    fileKey: TFileKey,
    from: string,
    to: string,
    assertion: () => Promise<void>,
  ) {
    await replaceText(fileKey, from, to)
    await assertion()
  }

  async function rewriteFileAndWait(
    fileKey: TFileKey,
    updater: (source: string) => string,
    assertion: () => Promise<void>,
    options: { allowNoop?: boolean } = {},
  ) {
    await rewriteFile(fileKey, updater, options)
    await assertion()
  }

  return {
    files,
    pendingRestoreKeys,
    capturePromise,
    captureOriginals,
    restoreFiles,
    replaceText,
    replaceTextAndWait,
    rewriteFile,
    rewriteFileAndWait,
  }
}
