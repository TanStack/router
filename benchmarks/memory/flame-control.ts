const flameEnabled = process.env.TSR_MEMORY_FLAME === '1'
const flameStartDelayMs = 250

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function waitForSignalHandler() {
  return wait(0)
}

async function toggleFlameProfile() {
  if (!flameEnabled) {
    return
  }

  if (process.platform === 'win32') {
    throw new Error('Flame manual profiling is not supported on Windows')
  }

  process.kill(process.pid, 'SIGUSR2')
  await waitForSignalHandler()
}

export async function startFlameProfile() {
  if (flameEnabled) {
    // Flame initializes sourcemap support asynchronously when the process starts.
    await wait(flameStartDelayMs)
  }

  await toggleFlameProfile()
}

export async function stopFlameProfile() {
  await toggleFlameProfile()
}

export async function profileFlameWorkload(
  workload: () => Promise<void> | void,
) {
  await startFlameProfile()
  try {
    await workload()
  } finally {
    await stopFlameProfile()
  }
}
