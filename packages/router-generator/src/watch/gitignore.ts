import path from 'node:path'
import { execFile } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import { displayFile } from '../errors'
import { logging } from '../logger'
import type { Config } from '../config'

/** The temporary directories checked in this process. */
const checked = new Set<string>()

/**
 * Warns, once per process and temporary directory, when the directory the
 * generator writes its temporary files to (`tmpDir`, `.tanstack/tmp` by
 * default) is inside a git work tree that does not ignore it: `git stash -u`
 * and `git clean -fd` delete it under a running session (the publisher
 * creates it again). Silent outside a git work tree, or when git can't
 * answer.
 * One `git check-ignore` per directory and process; never rejects.
 */
export async function warnIfTmpDirNotIgnored(config: Config): Promise<void> {
  const tmpDir = config.tmpDir
  if (config.disableLogging || checked.has(tmpDir)) {
    return
  }
  checked.add(tmpDir)
  try {
    const top = await workTreeOf(path.dirname(tmpDir))
    if (top === undefined || (await ignored(top, tmpDir)) !== false) {
      return
    }
    // The .gitignore of the working directory when it holds the directory
    // (the app's own), else the work tree's
    const cwd = process.cwd()
    const base = isUnder(tmpDir, cwd) && isUnder(cwd, top) ? cwd : top
    const relative = path.relative(base, tmpDir).split(path.sep).join('/')
    const line =
      relative === '.tanstack' || relative.startsWith('.tanstack/')
        ? '.tanstack/'
        : `${relative}/`
    logging({ disabled: false }).warn(
      `[tanstack-router] Git does not ignore ${relative}, where the route generator writes temporary files, so commands like \`git stash -u\` and \`git clean -fd\` delete it. Add this line to ${displayFile(path.join(base, '.gitignore'), cwd)}:\n\n  ${line}\n`,
    )
  } catch {
    // (a check that fails says nothing)
  }
}

/** The nearest directory from `dir` up that holds a `.git` entry. */
async function workTreeOf(dir: string): Promise<string | undefined> {
  for (let current = dir; ; ) {
    if (await fsp.stat(path.join(current, '.git')).catch(() => null)) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) {
      return undefined
    }
    current = parent
  }
}

/** Whether git ignores `file` (undefined: git did not answer). */
function ignored(top: string, file: string): Promise<boolean | undefined> {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['check-ignore', '--quiet', '--', file],
      { cwd: top, windowsHide: true, timeout: 10_000 },
      (error) => {
        if (!error) {
          resolve(true)
        } else {
          // exit 1: not ignored; anything else (no git, not a work tree): no answer
          resolve(error.code === 1 ? false : undefined)
        }
      },
    )
  })
}

function isUnder(file: string, dir: string) {
  const relative = path.relative(dir, file)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}
