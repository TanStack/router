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
const PURE_TEXT_CHUNKS = [
  encode('Hello '),
  encode('World '),
  encode('from SSR!'),
]
const PURE_TEXT_EXPECTED = new Uint8Array(
  PURE_TEXT_CHUNKS.reduce((acc, c) => acc + c.length, 0),
)
let offset = 0
for (const chunk of PURE_TEXT_CHUNKS) {
  PURE_TEXT_EXPECTED.set(chunk, offset)
  offset += chunk.length
}

const MIXED_CHUNKS = [
  encode('Valid text'),
  new Uint8Array([0xff, 0xfe, 0x80, 0x90]), // Invalid UTF-8
  encode(' more text'),
]
const MIXED_EXPECTED = new Uint8Array(
  MIXED_CHUNKS.reduce((acc, c) => acc + c.length, 0),
)
offset = 0
for (const chunk of MIXED_CHUNKS) {
  MIXED_EXPECTED.set(chunk, offset)
  offset += chunk.length
}

// Pure binary data (invalid UTF-8) - must use base64 fallback
const PURE_BINARY_CHUNKS = [
  new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x80, 0x90]),
  new Uint8Array([0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0]),
]
const PURE_BINARY_EXPECTED = new Uint8Array(
  PURE_BINARY_CHUNKS.reduce((acc, c) => acc + c.length, 0),
)
offset = 0
for (const chunk of PURE_BINARY_CHUNKS) {
  PURE_BINARY_EXPECTED.set(chunk, offset)
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

export const Route = createFileRoute('/raw-stream/ssr-text-hint')({
  loader: async () => {
    // Pure text stream - should use UTF-8 encoding with text hint
    const textStream = createDelayedStream(
      [encode('Hello '), encode('World '), encode('from SSR!')],
      30,
    )

    // Mixed content stream - text hint should use UTF-8 for valid text, base64 for binary
    const mixedStream = createDelayedStream(
      [
        encode('Valid text'),
        new Uint8Array([0xff, 0xfe, 0x80, 0x90]), // Invalid UTF-8
        encode(' more text'),
      ],
      30,
    )

    // Pure binary stream - text hint must fallback to base64 for all chunks
    const pureBinaryStream = createDelayedStream(
      [
        new Uint8Array([0xff, 0xfe, 0x00, 0x01, 0x80, 0x90]),
        new Uint8Array([0xa0, 0xb0, 0xc0, 0xd0, 0xe0, 0xf0]),
      ],
      30,
    )

    return {
      message: 'SSR Text Hint Test',
      pureText: new RawStream(textStream, { hint: 'text' }),
      mixedContent: new RawStream(mixedStream, { hint: 'text' }),
      pureBinary: new RawStream(pureBinaryStream, { hint: 'text' }),
    }
  },
  component: SSRTextHintTest,
})

function SSRTextHintTest() {
  const { message, pureText, mixedContent, pureBinary } = Route.useLoaderData()
  const [pureTextMatch, setPureTextMatch] = React.useState<{
    match: boolean
    mismatchIndex: number | null
    actualLength: number
    expectedLength: number
    asText: string
  } | null>(null)
  const [mixedMatch, setMixedMatch] = React.useState<{
    match: boolean
    mismatchIndex: number | null
    actualLength: number
    expectedLength: number
  } | null>(null)
  const [pureBinaryMatch, setPureBinaryMatch] = React.useState<{
    match: boolean
    mismatchIndex: number | null
    actualLength: number
    expectedLength: number
  } | null>(null)
  const [isLoading, setIsLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    Promise.all([
      collectBytes(pureText),
      collectBytes(mixedContent),
      collectBytes(pureBinary),
    ])
      .then(([pureBytes, mixedBytes, pureBinaryBytes]) => {
        const pureComp = compareBytes(pureBytes, PURE_TEXT_EXPECTED)
        const decoder = new TextDecoder()
        setPureTextMatch({
          ...pureComp,
          actualLength: pureBytes.length,
          expectedLength: PURE_TEXT_EXPECTED.length,
          asText: decoder.decode(pureBytes),
        })
        const mixedComp = compareBytes(mixedBytes, MIXED_EXPECTED)
        setMixedMatch({
          ...mixedComp,
          actualLength: mixedBytes.length,
          expectedLength: MIXED_EXPECTED.length,
        })
        const pureBinaryComp = compareBytes(
          pureBinaryBytes,
          PURE_BINARY_EXPECTED,
        )
        setPureBinaryMatch({
          ...pureBinaryComp,
          actualLength: pureBinaryBytes.length,
          expectedLength: PURE_BINARY_EXPECTED.length,
        })
        setIsLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setIsLoading(false)
      })
  }, [pureText, mixedContent, pureBinary])

  return (
    <div className="space-y-4">
      <h2>SSR Text Hint Test</h2>
      <p className="text-gray-600">
        This route tests RawStream with hint: 'text' from loader. Text hint
        optimizes for UTF-8 content but falls back to base64 for invalid UTF-8.
      </p>

      <div className="border p-4 rounded">
        <div data-testid="ssr-text-hint-message">Message: {message}</div>
        <div data-testid="ssr-text-hint-pure-text">
          Pure Text:{' '}
          {error
            ? `Error: ${error}`
            : isLoading
              ? 'Loading...'
              : pureTextMatch?.asText}
        </div>
        <div data-testid="ssr-text-hint-pure-match">
          Pure Text Bytes Match:{' '}
          {isLoading ? 'Loading...' : pureTextMatch?.match ? 'true' : 'false'}
        </div>
        <div data-testid="ssr-text-hint-mixed-match">
          Mixed Content Bytes Match:{' '}
          {isLoading ? 'Loading...' : mixedMatch?.match ? 'true' : 'false'}
        </div>
        <div data-testid="ssr-text-hint-pure-binary-match">
          Pure Binary Bytes Match:{' '}
          {isLoading ? 'Loading...' : pureBinaryMatch?.match ? 'true' : 'false'}
        </div>
        <pre data-testid="ssr-text-hint-result">
          {JSON.stringify({
            message,
            pureTextMatch,
            mixedMatch,
            pureBinaryMatch,
            isLoading,
            error,
          })}
        </pre>
      </div>
    </div>
  )
}
