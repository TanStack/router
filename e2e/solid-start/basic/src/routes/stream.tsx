import { createFileRoute } from '@tanstack/solid-router'
import { createMemo, Loading } from 'solid-js'

async function collectStream(stream: ReadableStream): Promise<Array<string>> {
  const decoder = new TextDecoder('utf-8')
  const reader = stream.getReader()
  const chunks: Array<string> = []
  let chunk

  while (!(chunk = await reader.read()).done) {
    let value = chunk.value
    if (typeof value !== 'string') {
      value = decoder.decode(value, { stream: !chunk.done })
    }
    chunks.push(value)
  }

  return chunks
}

export const Route = createFileRoute('/stream')({
  component: Home,
  loader() {
    const stream = new ReadableStream({
      async start(controller) {
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 200))
          controller.enqueue(`stream-data-${i} `)
        }
        controller.close()
      },
    })

    return {
      promise: new Promise<string>((resolve) =>
        setTimeout(() => resolve('promise-data'), 150),
      ),
      streamData: collectStream(stream),
    }
  },
})

function Home() {
  const loaderData = Route.useLoaderData()
  const promiseData = createMemo(() => loaderData().promise)
  const streamData = createMemo(() => loaderData().streamData)

  return (
    <Loading>
      <div class="p-2" data-testid="promise-data">
        {promiseData()}
        <Loading>
          <div data-testid="stream-data">
            {streamData().map((d: string) => (
              <div>{d}</div>
            ))}
          </div>
        </Loading>
      </div>
    </Loading>
  )
}
