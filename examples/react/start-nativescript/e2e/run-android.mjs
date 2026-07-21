import { access, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { homedir } from 'node:os'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const exampleRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const applicationId = 'com.tanstack.startnativescript'
const uiDumpPath = '/sdcard/tanstack-router-window.xml'

let adb
let deviceId
let emulator
let nativeScript
let reversePort
let server

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

async function isExecutable(file) {
  if (!file) {
    return false
  }

  try {
    await access(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

async function findCommand(name, candidates = []) {
  for (const candidate of candidates) {
    if (await isExecutable(candidate)) {
      return candidate
    }
  }

  const resolved = (
    await run('/usr/bin/env', ['which', name], {
      allowFailure: true,
      capture: true,
      silent: true,
    })
  ).trim()
  if (await isExecutable(resolved)) {
    return resolved
  }

  throw new Error(`Unable to find ${name}. Run \`ns setup android\` first.`)
}

async function getAndroidTools() {
  const sdkRoots = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    join(homedir(), 'Library', 'Android', 'sdk'),
    '/opt/homebrew/share/android-commandlinetools',
    '/usr/local/share/android-commandlinetools',
  ].filter(Boolean)

  const adbCommand = await findCommand(
    'adb',
    sdkRoots.map((root) => join(root, 'platform-tools', 'adb')),
  )

  return {
    adb: adbCommand,
    emulator: await findCommand(
      'emulator',
      sdkRoots.map((root) => join(root, 'emulator', 'emulator')),
    ),
    sdkRoot: dirname(dirname(adbCommand)),
  }
}

async function getJavaHome() {
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME
  }

  const javaHome = (
    await run('/usr/libexec/java_home', ['-v', '17'], {
      allowFailure: true,
      capture: true,
      silent: true,
    })
  ).trim()
  if (javaHome) {
    return javaHome
  }

  const brewPrefix = (
    await run('brew', ['--prefix', 'openjdk@17'], {
      allowFailure: true,
      capture: true,
      silent: true,
    })
  ).trim()
  const brewJavaHome = join(
    brewPrefix,
    'libexec',
    'openjdk.jdk',
    'Contents',
    'Home',
  )
  if (brewPrefix && (await isExecutable(join(brewJavaHome, 'bin', 'java')))) {
    return brewJavaHome
  }

  throw new Error('Unable to find JDK 17. Run `ns setup android` first.')
}

function parseDevices(output) {
  return output
    .split('\n')
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([, state]) => state === 'device')
    .map(([id]) => id)
}

async function listDevices() {
  return parseDevices(
    await run(adb, ['devices'], { capture: true, silent: true }),
  )
}

async function waitForDevice(requestedId) {
  const deadline = Date.now() + 180_000

  while (Date.now() < deadline) {
    const devices = await listDevices()
    const selected = requestedId
      ? devices.find((id) => id === requestedId)
      : (devices.find((id) => id.startsWith('emulator-')) ?? devices[0])
    if (selected) {
      const booted = (
        await run(
          adb,
          ['-s', selected, 'shell', 'getprop', 'sys.boot_completed'],
          {
            allowFailure: true,
            capture: true,
            silent: true,
          },
        )
      ).trim()
      if (booted === '1') {
        return selected
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000))
  }

  throw new Error('Timed out waiting for an Android device to boot')
}

async function getDevice(emulatorCommand) {
  const requestedId = process.env.TSS_ANDROID_DEVICE_ID
  const connected = await listDevices()
  const selected = requestedId
    ? connected.find((id) => id === requestedId)
    : (connected.find((id) => id.startsWith('emulator-')) ?? connected[0])
  if (selected) {
    return waitForDevice(selected)
  }

  const avds = (await run(emulatorCommand, ['-list-avds'], { capture: true }))
    .split('\n')
    .map((name) => name.trim())
    .filter(Boolean)
  const avd = process.env.TSS_ANDROID_AVD ?? avds[0]
  if (!avd) {
    throw new Error('No Android device or AVD is available')
  }

  emulator = spawn(
    emulatorCommand,
    [
      '-avd',
      avd,
      '-no-window',
      '-no-audio',
      '-no-boot-anim',
      '-gpu',
      'swiftshader_indirect',
    ],
    { cwd: exampleRoot, env: process.env, stdio: 'inherit' },
  )

  return waitForDevice(requestedId)
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

function decodeXml(value) {
  return value
    .replace(/&#x([\da-f]+);/gi, (_, hex) =>
      String.fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, decimal) =>
      String.fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&')
}

function parseNodes(xml) {
  return [...xml.matchAll(/<node\b([^>]*)\/?\s*>/g)].map((nodeMatch) => {
    const attributes = {}
    for (const attribute of nodeMatch[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
      attributes[attribute[1]] = decodeXml(attribute[2])
    }
    return attributes
  })
}

async function dumpUi() {
  await run(adb, ['-s', deviceId, 'shell', 'rm', '-f', uiDumpPath], {
    allowFailure: true,
    silent: true,
  })
  await run(adb, ['-s', deviceId, 'shell', 'uiautomator', 'dump', uiDumpPath], {
    allowFailure: true,
    silent: true,
  })
  return run(adb, ['-s', deviceId, 'shell', 'cat', uiDumpPath], {
    allowFailure: true,
    capture: true,
    silent: true,
  })
}

function matchingNode(nodes, label) {
  return nodes.find(
    (node) => node.text === label || node['content-desc'] === label,
  )
}

async function waitForLabel(label, timeout = 20_000) {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (nativeScript?.exitCode !== null) {
      throw new Error(
        `NativeScript exited before ${JSON.stringify(label)} appeared (code ${nativeScript.exitCode})`,
      )
    }

    const node = matchingNode(parseNodes(await dumpUi()), label)
    if (node) {
      return node
    }

    await new Promise((resolve) => setTimeout(resolve, 500))
  }

  throw new Error(`Timed out waiting for ${JSON.stringify(label)}`)
}

async function tap(label) {
  const node = await waitForLabel(label)
  const bounds = node.bounds?.match(/^\[(\d+),(\d+)]\[(\d+),(\d+)]$/)
  if (!bounds) {
    throw new Error(`Unable to determine bounds for ${JSON.stringify(label)}`)
  }

  const x = Math.round((Number(bounds[1]) + Number(bounds[3])) / 2)
  const y = Math.round((Number(bounds[2]) + Number(bounds[4])) / 2)
  await run(adb, ['-s', deviceId, 'shell', 'input', 'tap', `${x}`, `${y}`])
}

async function back() {
  await run(adb, ['-s', deviceId, 'shell', 'input', 'keyevent', 'KEYCODE_BACK'])
}

async function testNativeStack() {
  await waitForLabel('TanStack Native', 180_000)
  await waitForLabel(
    'This value came from a TanStack Start server function.',
    30_000,
  )

  await tap('Open Router')
  await waitForLabel('PATH PARAM + NATIVE STACK')
  await waitForLabel('Back')

  await tap('Search this topic')
  await waitForLabel('SEARCH PARAMS + SERVER FUNCTION')
  await waitForLabel('Results for “TanStack Router”')
  await waitForLabel('Back')

  await tap('Back')
  await waitForLabel('PATH PARAM + NATIVE STACK')

  await back()
  await waitForLabel('ONE ROUTE TREE')
}

async function assertNoBrowserElementWarnings() {
  const logs = await run(adb, ['-s', deviceId, 'logcat', '-d', '-v', 'brief'], {
    capture: true,
    silent: true,
  })

  if (logs.includes("[UNDOM-NG] Element type 'link' is not registered.")) {
    throw new Error('The native bundle initialized Vite browser preload links')
  }
}

async function assertNoBrowserPreloadCode() {
  const buildDirectory = join(exampleRoot, '.ns-vite-build')
  const modules = (await readdir(buildDirectory)).filter((file) =>
    file.endsWith('.mjs'),
  )
  const affectedModules = []

  for (const module of modules) {
    const code = await readFile(join(buildDirectory, module), 'utf8')
    if (/document\.createElement\((['"])link\1\)\.relList/.test(code)) {
      affectedModules.push(module)
    }
  }

  if (affectedModules.length > 0) {
    throw new Error(
      `Native bundle contains Vite's browser preload probe: ${affectedModules.join(', ')}`,
    )
  }
}

async function testStackReuse() {
  await tap('Search native')
  await waitForLabel('Results for “native”')

  await tap('Search Router')
  await waitForLabel('Results for “router”')

  await tap('Search Start')
  await waitForLabel('Results for “start”')

  await tap('Search Router')
  await waitForLabel('Results for “router”')

  await back()
  await waitForLabel('Results for “native”')

  await back()
  await waitForLabel('ONE ROUTE TREE')
}

async function testRouteBlocker() {
  await tap('Open Router')
  await waitForLabel('PATH PARAM + NATIVE STACK')

  await tap('Protect back')
  await waitForLabel('Back protected')

  await back()
  await new Promise((resolve) => setTimeout(resolve, 500))
  await waitForLabel('PATH PARAM + NATIVE STACK')
  await waitForLabel('Back protected')

  await tap('Allow back')
  await waitForLabel('Protect back')

  await back()
  await waitForLabel('ONE ROUTE TREE')
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
  stopChild(emulator, 'SIGTERM')
}

async function main() {
  const tools = await getAndroidTools()
  const javaHome = await getJavaHome()
  adb = tools.adb

  await run(adb, ['start-server'])
  deviceId = await getDevice(tools.emulator)

  const port = await getFreePort()
  const origin = `http://127.0.0.1:${port}`
  const serverHost =
    process.env.TSS_ANDROID_SERVER_HOST ??
    (deviceId.startsWith('emulator-') ? '10.0.2.2' : '127.0.0.1')
  const serverFunctionBase = `http://${serverHost}:${port}/_serverFn/`
  const nativeEnvironment = {
    ...process.env,
    ANDROID_HOME:
      process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || tools.sdkRoot,
    JAVA_HOME: javaHome,
    TSS_NATIVE_PLATFORM: 'android',
    TSS_SERVER_FN_BASE: serverFunctionBase,
  }

  server = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      'dev',
      '--host',
      '0.0.0.0',
      '--port',
      `${port}`,
      '--strictPort',
    ],
    { cwd: exampleRoot, env: process.env, stdio: 'inherit' },
  )
  server.on('exit', (code) => {
    if (code && code !== 0) {
      process.exitCode = code
    }
  })

  await waitForServer(origin)
  if (serverHost === '127.0.0.1') {
    await run(adb, ['-s', deviceId, 'reverse', `tcp:${port}`, `tcp:${port}`])
    reversePort = port
  }
  await run(adb, ['-s', deviceId, 'uninstall', applicationId], {
    allowFailure: true,
    silent: true,
  })
  await run(adb, ['-s', deviceId, 'logcat', '-c'], { silent: true })

  nativeScript = spawn(
    'pnpm',
    ['exec', 'ns', 'debug', 'android', '--no-hmr', '--device', deviceId],
    { cwd: exampleRoot, env: nativeEnvironment, stdio: 'inherit' },
  )

  await testNativeStack()
  await assertNoBrowserPreloadCode()
  await testStackReuse()
  await testRouteBlocker()
  await assertNoBrowserElementWarnings()
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
  if (adb && deviceId && reversePort) {
    await run(
      adb,
      ['-s', deviceId, 'reverse', '--remove', `tcp:${reversePort}`],
      {
        allowFailure: true,
        silent: true,
      },
    )
  }
  stopProcesses()
}
