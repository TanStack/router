import { spawn } from 'node:child_process'
import path from 'node:path'
import type { ChildProcess } from 'node:child_process'

/**
 * Starts the app's own `vite dev` or `rsbuild dev` (on a free port) as a child
 * of this process: pnpm's bin shims `exec` node, so the child is the server.
 * Not through `pnpm exec`: where pnpm runs behind its Node.js launcher
 * (Corepack, or an install that blocked its build scripts), a signal stops the
 * launcher only and the server keeps running, and Vite 8.4 refuses a second
 * dev server of a project while one runs.
 */
export function spawnDevServer(
  cwd: string,
  toolchain: 'vite' | 'rsbuild',
  env: NodeJS.ProcessEnv,
) {
  return spawn(
    path.resolve(cwd, 'node_modules', '.bin', toolchain),
    ['dev', '--port', '0'],
    {
      cwd,
      env: { ...process.env, PORT: '0', VITE_SERVER_PORT: '0', ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
}

/** Stops a server `spawnDevServer` started; resolves once it has exited. */
export async function stopDevServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return
  }
  const exited = new Promise((resolve) => child.once('exit', resolve))
  child.kill('SIGTERM')
  const kill = setTimeout(() => child.kill('SIGKILL'), 3000)
  await exited
  clearTimeout(kill)
}
