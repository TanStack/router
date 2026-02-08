import { spawn } from 'node:child_process'

const command = process.argv[2]
const args = process.argv.slice(3)

if (!command) {
  console.error('Missing bundler command')
  process.exit(1)
}

const bundler = process.env.BUNDLER === 'rsbuild' ? 'rsbuild' : 'vite'

const run = (cmd, cmdArgs) =>
  new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    })
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`${cmd} exited with code ${code}`))
      }
    })
  })

try {
  await run(bundler, [command, ...args])

  if (command === 'build') {
    await run('tsc', ['--noEmit'])
  }
} catch (error) {
  console.error(error)
  process.exit(1)
}
