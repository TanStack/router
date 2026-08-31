import { cp, mkdir, stat } from 'node:fs/promises'
import { join } from 'pathe'

/**
 * Copy `public/` into the client output directory (Vite `publicDir` equivalent).
 * No-op when the directory does not exist.
 */
export async function copyPublicDirToClient(opts: {
  root: string
  clientOutDir: string
  publicDir?: string
}): Promise<{ copied: boolean; from: string; to: string }> {
  const from = join(opts.root, opts.publicDir ?? 'public')
  const to = opts.clientOutDir

  try {
    const info = await stat(from)
    if (!info.isDirectory()) {
      return { copied: false, from, to }
    }
  } catch {
    return { copied: false, from, to }
  }

  await mkdir(to, { recursive: true })
  await cp(from, to, {
    recursive: true,
    force: true,
    errorOnExist: false,
  })

  return { copied: true, from, to }
}
