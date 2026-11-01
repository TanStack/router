import path from 'node:path'
import crypto from 'node:crypto'
import * as fsp from 'node:fs/promises'

/** A route file changed on disk between our read and our write. */
export class ConcurrentEditError extends Error {
  constructor(readonly file: string) {
    super(`File ${file} was modified by another process during processing.`)
  }
}

function isErrorCode(error: unknown, code: string) {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as NodeJS.ErrnoException).code === code
  )
}

/** Reads a file; null when it does not exist. */
export async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fsp.readFile(file, 'utf8')
  } catch (error) {
    if (isErrorCode(error, 'ENOENT')) {
      return null
    }
    throw error
  }
}

/**
 * Atomic file replacement (SPEC J1.6, J1.16): the content is written to a
 * temporary file, which is renamed over the destination, so a reader sees
 * the old or the new file, never a part. Temporary files go to `tmpDir`;
 * when a rename from there crosses devices (EXDEV), the temporary file is
 * written beside the destination instead (a dot file, which the route scan
 * skips), for that directory from then on.
 */
export class AtomicPublisher {
  private readonly session = crypto.randomBytes(4).toString('hex')
  /** Numbers the temporary files: writes in flight never share one. */
  private writes = 0
  private tmpDirReady: Promise<unknown> | undefined
  /** Destination directories whose renames from `tmpDir` cross devices. */
  private readonly besideDestination = new Set<string>()

  constructor(private readonly tmpDir: string) {}

  /**
   * Replaces `file` with `content`. With `expected`, the file must still
   * hold exactly that (null: must not exist) right before the rename, or a
   * `ConcurrentEditError` is thrown and nothing changes.
   */
  async write(
    file: string,
    content: string,
    expected?: string | null,
  ): Promise<void> {
    const dir = path.dirname(file)
    await fsp.mkdir(dir, { recursive: true })
    if (this.besideDestination.has(dir)) {
      await this.writeVia(this.besideName(file), file, content, expected)
      return
    }
    this.tmpDirReady ??= fsp.mkdir(this.tmpDir, { recursive: true })
    await this.tmpDirReady
    try {
      await this.writeVia(
        path.join(this.tmpDir, `${this.session}-${this.writes++}`),
        file,
        content,
        expected,
      )
    } catch (error) {
      if (!isErrorCode(error, 'EXDEV')) {
        throw error
      }
      this.besideDestination.add(dir)
      await this.writeVia(this.besideName(file), file, content, expected)
    }
  }

  private besideName(file: string) {
    return path.join(
      path.dirname(file),
      `.${path.basename(file)}.${this.session}-${this.writes++}.tmp`,
    )
  }

  private async writeVia(
    temporary: string,
    file: string,
    content: string,
    expected: string | null | undefined,
  ) {
    try {
      await fsp.writeFile(temporary, content)
      const current = await fsp.stat(file).catch((error: unknown) => {
        if (isErrorCode(error, 'ENOENT')) {
          return null
        }
        throw error
      })
      if (current) {
        // The replacement keeps the file's mode and owner
        const written = await fsp.stat(temporary)
        if (written.mode !== current.mode) {
          await fsp.chmod(temporary, current.mode)
        }
        if (written.uid !== current.uid || written.gid !== current.gid) {
          await fsp
            .chown(temporary, current.uid, current.gid)
            .catch((error: unknown) => {
              if (!isErrorCode(error, 'EPERM')) {
                throw error
              }
            })
        }
      }
      if (expected !== undefined) {
        // Right before the rename: an edit made meanwhile is not overwritten
        const now = await readIfExists(file)
        if (now !== expected) {
          throw new ConcurrentEditError(file)
        }
      }
      await fsp.rename(temporary, file)
    } catch (error) {
      await fsp.rm(temporary, { force: true }).catch(() => {})
      throw error
    }
  }
}
