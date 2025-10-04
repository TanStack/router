import { createFileRoute } from '@tanstack/react-router'
import { createServerFn } from '@tanstack/react-start'
import { useCallback, useState } from 'react'
import { z } from 'zod'

// This schema will be used to define the type
// of each chunk in the `ReadableStream`.
// (It mimics OpenAi's streaming response format.)
const textPartSchema = z.object({
  choices: z.array(
    z.object({
      delta: z.object({
        content: z.string().optional(),
      }),
      index: z.number(),
      finish_reason: z.string().nullable(),
    }),
  ),
})

export type TextPart = z.infer<typeof textPartSchema>

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const streamingResponseFn = createServerFn({
  method: 'GET',
}).handler(async () => {
  const messages = Array.from({ length: 10 }, () =>
    Math.floor(Math.random() * 100),
  ).map((n, i) =>
    textPartSchema.parse({
      choices: [
        {
          delta: { content: `Number #${i + 1}: ${n}\n` },
          index: i,
          finish_reason: null,
        },
      ],
    }),
  )

  // This `ReadableStream` is typed, so each chunk
  // will be of type `TextPart`.
  const stream = new ReadableStream<TextPart>({
    async start(controller) {
      for (const message of messages) {
        await sleep(500)
        controller.enqueue(message)
      }
      sleep(500)
      controller.close()
    },
  })

  return stream
})

export const Route = createFileRoute('/')({
  component: RouteComponent,
})

function RouteComponent() {
  const [message, setMessage] = useState('')

  const getStreamingResponse = useCallback(async () => {
    const response = await streamingResponseFn()

    if (!response) {
      return
    }

    const reader = response.getReader()
    let done = false
    setMessage('')
    while (!done) {
      const { value, done: doneReading } = await reader.read()
      done = doneReading
      if (value) {
        // Notice how we know the value of `chunk` (`TextPart | undefined`)
        // here, because it's coming from the typed `ReadableStream`
        const chunk = value?.choices[0].delta.content
        if (chunk) {
          setMessage((prev) => prev + chunk)
        }
      }
    }
  }, [])

  return (
    <main>
      <h1>Typed Readable Stream</h1>
      <button onClick={() => getStreamingResponse()}>
        Get 10 random numbers
      </button>
      <pre>{message}</pre>
    </main>
  )
}
