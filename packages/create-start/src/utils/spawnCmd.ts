import spawn from 'cross-spawn'

export async function spawnCommand(
  command: string,
  args: Array<string>,
  env: NodeJS.ProcessEnv = {},
  cwd?: string,
) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: {
        ...process.env,
        ...env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
    })
    let stderrBuffer = ''
    let stdoutBuffer = ''

    child.stderr?.on('data', (data) => {
      stderrBuffer += data
    })

    child.stdout?.on('data', (data) => {
      stdoutBuffer += data
    })

    child.on('close', (code) => {
      if (code !== 0) {
        reject(
          `"${command} ${args.join(' ')}" failed ${stdoutBuffer} ${stderrBuffer}`,
        )
        return
      }
      resolve()
    })
  })
}
