import { readFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const exampleRoot = dirname(dirname(fileURLToPath(import.meta.url)))
let server
let nativeScript

function run(command, args, options = {}) {
  const {
    allowFailure = false,
    capture = false,
    env = process.env,
    silent = false,
  } = options

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: exampleRoot,
      env,
      stdio: capture
        ? ['ignore', 'pipe', silent ? 'ignore' : 'inherit']
        : silent
          ? 'ignore'
          : 'inherit',
    })
    let stdout = ''

    child.stdout?.on('data', (chunk) => {
      stdout += chunk
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0 || allowFailure) {
        resolve(stdout)
        return
      }

      reject(
        new Error(
          `${command} exited with ${signal ? `signal ${signal}` : `code ${code}`}`,
        ),
      )
    })
  })
}

async function waitForNativeApp(simulatorId, serverFunctionBase) {
  const deadline = Date.now() + 180_000

  while (Date.now() < deadline) {
    if (nativeScript.exitCode !== null) {
      throw new Error(
        `NativeScript exited before installing the app (code ${nativeScript.exitCode})`,
      )
    }

    let bundle
    try {
      const appPath = (
        await run(
          'xcrun',
          [
            'simctl',
            'get_app_container',
            simulatorId,
            'com.tanstack.startnativescript',
            'app',
          ],
          { capture: true, silent: true },
        )
      ).trim()
      bundle = await readFile(join(appPath, 'app/bundle.mjs'), 'utf8')
    } catch {
      // NativeScript is still building or installing the app.
    }

    if (bundle?.includes(serverFunctionBase)) {
      if (/document\.createElement\((['"])link\1\)\.relList/.test(bundle)) {
        throw new Error("Native bundle contains Vite's browser preload probe")
      }
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error('Timed out waiting for NativeScript to install the iOS app')
}

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const socket = createServer()
    socket.unref()
    socket.on('error', reject)
    socket.listen(0, '127.0.0.1', () => {
      const address = socket.address()
      if (!address || typeof address === 'string') {
        reject(new Error('Unable to reserve a local port'))
        return
      }

      socket.close(() => resolve(address.port))
    })
  })
}

async function waitForServer(url) {
  const deadline = Date.now() + 60_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) {
        return
      }
    } catch {
      // The server is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`Timed out waiting for ${url}`)
}

function runtimeVersion(runtime) {
  const match = runtime.match(/iOS-(\d+)-(\d+)/)
  return match ? Number(match[1]) * 1_000 + Number(match[2]) : 0
}

async function getSimulator() {
  const output = await run('xcrun', ['simctl', 'list', 'devices', '--json'], {
    capture: true,
  })
  const { devices } = JSON.parse(output)
  const runtimes = Object.entries(devices)
    .filter(([runtime]) => runtime.includes('.iOS-'))
    .sort(([left], [right]) => runtimeVersion(right) - runtimeVersion(left))
  const allDevices = runtimes.flatMap(([, runtimeDevices]) => runtimeDevices)
  const requestedId = process.env.TSS_IOS_SIMULATOR_ID
  const requested = requestedId
    ? allDevices.find((device) => device.udid === requestedId)
    : undefined
  const booted = allDevices.find(
    (device) =>
      device.state === 'Booted' &&
      device.isAvailable !== false &&
      device.name.startsWith('iPhone'),
  )
  const available = runtimes
    .flatMap(([, runtimeDevices]) => runtimeDevices)
    .find(
      (device) =>
        device.isAvailable !== false && device.name.startsWith('iPhone'),
    )
  const simulator = requested ?? booted ?? available

  if (!simulator) {
    throw new Error('No available iPhone simulator was found')
  }

  if (simulator.state !== 'Booted') {
    await run('xcrun', ['simctl', 'boot', simulator.udid])
  }
  await run('xcrun', ['simctl', 'bootstatus', simulator.udid, '-b'])

  return simulator
}

function stopChild(child, signal) {
  if (!child || child.killed || child.exitCode !== null) {
    return
  }

  child.kill(signal)
}

function stopProcesses() {
  stopChild(nativeScript, 'SIGINT')
  stopChild(server, 'SIGTERM')
}

async function main() {
  const simulator = await getSimulator()
  const port = await getFreePort()
  const origin = `http://127.0.0.1:${port}`
  const serverFunctionBase = `${origin}/_serverFn/`

  server = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      'dev',
      '--host',
      '127.0.0.1',
      '--port',
      `${port}`,
      '--strictPort',
    ],
    {
      cwd: exampleRoot,
      env: process.env,
      stdio: 'inherit',
    },
  )
  server.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code
    }
  })

  await waitForServer(origin)
  await run(
    'xcrun',
    ['simctl', 'uninstall', simulator.udid, 'com.tanstack.startnativescript'],
    { allowFailure: true, silent: true },
  )
  nativeScript = spawn(
    'pnpm',
    ['exec', 'ns', 'debug', 'ios', '--no-hmr', '--device', simulator.udid],
    {
      cwd: exampleRoot,
      env: {
        ...process.env,
        TSS_SERVER_FN_BASE: serverFunctionBase,
      },
      stdio: 'inherit',
    },
  )
  await waitForNativeApp(simulator.udid, serverFunctionBase)

  await run(
    'xcodebuild',
    [
      'test',
      '-project',
      join('e2e', 'ios', 'NativeScriptRouterUITests.xcodeproj'),
      '-scheme',
      'NativeScriptRouterUITests',
      '-destination',
      `platform=iOS Simulator,id=${simulator.udid}`,
      '-quiet',
    ],
    {
      env: {
        ...process.env,
        NSUnbufferedIO: 'YES',
      },
    },
  )
}

process.once('SIGINT', () => {
  stopProcesses()
  process.exit(130)
})
process.once('SIGTERM', () => {
  stopProcesses()
  process.exit(143)
})

try {
  await main()
} finally {
  stopProcesses()
}
