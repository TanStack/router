// Serves a production build of either toolchain: Vite writes the server
// entry to `server/server.js`, Rsbuild to `server/index.js`.
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

const serverEntry =
  ['server.js', 'index.js']
    .map((file) => path.resolve('dist', 'server', file))
    .find((file) => existsSync(file)) ??
  path.resolve('dist', 'server', 'server.js')

const child = spawn(
  'srvx',
  ['--prod', '-s', path.resolve('dist', 'client'), serverEntry],
  { stdio: 'inherit', shell: process.platform === 'win32' },
)
child.on('exit', (code) => process.exit(code ?? 0))
