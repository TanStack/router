export interface StartRequestHandler {
  fetch(request: Request): Promise<Response> | Response
}

export interface RunSsrRequestLoopOptions {
  seed: number
  iterations?: number
}

const requestInit = {
  method: 'GET',
  headers: {
    accept: 'text/html',
  },
} satisfies RequestInit

function createDeterministicRandom(seed: number) {
  let state = seed >>> 0

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 0x100000000
  }
}

function randomSegment(random: () => number) {
  return Math.floor(random() * 1_000_000_000).toString(36)
}

function randomSearchValue(random: () => number) {
  return `q-${randomSegment(random)}`
}

function randomRequestUrl(random: () => number) {
  const a = randomSegment(random)
  const b = randomSegment(random)
  const c = randomSegment(random)
  const d = randomSegment(random)
  const q = randomSearchValue(random)

  return `http://localhost/${a}/${b}/${c}/${d}?q=${q}`
}

export async function runSsrRequestLoop(
  handler: StartRequestHandler,
  { seed, iterations = 5 }: RunSsrRequestLoopOptions,
) {
  const random = createDeterministicRandom(seed)
  const pendingBodyReads: Array<Promise<void>> = []

  for (let index = 0; index < iterations; index++) {
    const requestUrl = randomRequestUrl(random)
    const response = await handler.fetch(new Request(requestUrl, requestInit))

    if (response.status !== 200) {
      await Promise.allSettled(pendingBodyReads)

      throw new Error(
        `Request failed with non-200 status ${response.status} (${requestUrl})`,
      )
    }

    pendingBodyReads.push(response.text().then(() => undefined))
  }

  await Promise.all(pendingBodyReads)
}
