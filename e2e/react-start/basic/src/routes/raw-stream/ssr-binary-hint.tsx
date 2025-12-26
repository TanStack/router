import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { RawStream } from '@tanstack/react-start'

// Helper to encode text to Uint8Array
function encode(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

// Helper to create a delayed stream
function createDelayedStream(
  chunks: Array<Uint8Array>,
  delayMs: number,
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        await new Promise((resolve) => setTimeout(resolve, delayMs))
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })
}

// Expected data - defined at module level for client-side verification
const TEXT_CHUNKS = [encode('Binary '), encode('hint '), encode('with text')]
const TEXT_EXPECTED = new Uint8Array(
  TEXT_CHUNKS.reduce((acc, c) => acc + c.length, 0),
)
let offset = 0
for (const chunk of TEXT_CHUNKS) {
  TEXT_EXPECTED.set(chunk, offset)
  offset += chunk.length
}

const BINARY_CHUNKS = [
  new Uint8Array([0x00, 0x01, 0x02, 0x03]),
  new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]),
]
const BINARY_EXPECTED = new Uint8Array(
  BINARY_CHUNKS.reduce((acc, c) => acc + c.length, 0),
)
offset = 0
for (const chunk of BINARY_CHUNKS) {
  BINARY_EXPECTED.set(chunk, offset)
  offset += chunk.length
}

// Helper to collect stream bytes
async function collectBytes(
  stream: ReadableStream<Uint8Array> | RawStream,
): Promise<Uint8Array> {
  const actualStream =
    stream instanceof RawStream
      ? stream.stream
      : (stream as ReadableStream<Uint8Array>)
  const reader = actualStream.getReader()
  const chunks: Array<Uint8Array> = []
  let totalLength = 0

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    totalLength += value.length
  }

  const result = new Uint8Array(totalLength)
  let pos = 0
  for (const chunk of chunks) {
    result.set(chunk, pos)
    pos += chunk.length
  }
  return result
}

// Compare two Uint8Arrays byte-by-byte
function compareBytes(
  a: Uint8Array,
  b: Uint8Array,
): { match: boolean; mismatchIndex: number | null } {
  if (a.length !== b.length) {
    return { match: false, mismatchIndex: -1 } // -1 indicates length mismatch
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) {
      return { match: false, mismatchIndex: i }
    }
  }
  return { match: true, mismatchIndex: null }
}

export const Route = createFileRoute('/raw-stream/ssr-binary-hint')({
  loader: async () => {
    // Text data with binary hint - should still use base64 (default behavior)
    const textStream = createDelayedStream(
      [encode('Binary '), encode('hint '), encode('with text')],
      30,
    )

    // Pure binary stream with binary hint
    const binaryStream = createDelayedStream(
      [
        new Uint8Array([0x00, 0x01, 0x02, 0x03]),
        new Uint8Array([0xff, 0xfe, 0xfd, 0xfc]),
      ],
      30,
    )

    return {
      message: 'SSR Binary Hint Test',
      textData: new RawStream(textStream, { hint: 'binary' }),
      binaryData: new RawStream(binaryStream, { hint: 'binary' }),
    }
  },
  component: SSRBinaryHintTest,
})

function SSRBinaryHintTest() {
  const { message, textData, binaryData } = Route.useLoaderData()
  const [textMatch, setTextMatch] = React.useState<{
    match: boolean
    mismatchIndex: number | null
    actualLength: number
    expectedLength: number
    asText: string
  } | null>(null)
  const [binaryMatch, setBinaryMatch] = React.useState<{
    match: boolean
    mismatchIndex: number | null
    actualLength: number
    expectedLength: number
  } | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    Promise.all([collectBytes(textData), collectBytes(binaryData)])
      .then(([textBytes, binaryBytes]) => {
        const textComp = compareBytes(textBytes, TEXT_EXPECTED)
        const decoder = new TextDecoder()
        setTextMatch({
          ...textComp,
          actualLength: textBytes.length,
          expectedLength: TEXT_EXPECTED.length,
          asText: decoder.decode(textBytes),
        })
        const binaryComp = compareBytes(binaryBytes, BINARY_EXPECTED)
        setBinaryMatch({
          ...binaryComp,
          actualLength: binaryBytes.length,
          expectedLength: BINARY_EXPECTED.length,
        })
        setIsLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setIsLoading(false)
      })
  }, [textData, binaryData])

  return (
    <div className="space-y-4">
      <h2>SSR Binary Hint Test</h2>
      <p className="text-gray-600">
        This route tests RawStream with hint: 'binary' from loader. Binary hint
        always uses base64 encoding (default behavior).
      </p>

      <div className="border p-4 rounded">
        <div data-testid="ssr-binary-hint-message">Message: {message}</div>
        <div data-testid="ssr-binary-hint-text">
          Text Data:{' '}
          {error
            ? `Error: ${error}`
            : isLoading
              ? 'Loading...'
              : textMatch?.asText}
        </div>
        <div data-testid="ssr-binary-hint-text-match">
          Text Bytes Match:{' '}
          {isLoading ? 'Loading...' : textMatch?.match ? 'true' : 'false'}
        </div>
        <div data-testid="ssr-binary-hint-binary-match">
          Binary Bytes Match:{' '}
          {isLoading ? 'Loading...' : binaryMatch?.match ? 'true' : 'false'}
        </div>
        <pre data-testid="ssr-binary-hint-result">
          {JSON.stringify({
            message,
            textMatch,
            binaryMatch,
            isLoading,
            error,
          })}
        </pre>
      </div>
    </div>
  )
}
