import { describe, expect, it, vi } from 'vitest'

/**
 * This is the BUGGY version of the first-object parsing logic from the original code.
 * It's included here to demonstrate that the bug exists and our fix resolves it.
 */
async function buggyProcessServerFnResponse({
  response,
  onMessage,
  onError,
}: {
  response: Response
  onMessage: (msg: any) => any
  onError?: (msg: string, error?: any) => void
}) {
  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

  let buffer = ''
  let firstRead = false
  let firstObject

  while (!firstRead) {
    const { value, done } = await reader.read()
    if (value) buffer += value

    if (buffer.length === 0 && done) {
      throw new Error('Stream ended before first object')
    }

    // BUGGY: This branch loses the trailing newline when joining remaining lines
    if (buffer.endsWith('\n')) {
      const lines = buffer.split('\n').filter(Boolean)
      const firstLine = lines[0]
      if (!firstLine) throw new Error('No JSON line in the first chunk')
      firstObject = JSON.parse(firstLine)
      firstRead = true
      buffer = lines.slice(1).join('\n')  // BUG: loses trailing newline!
    } else {
      const newlineIndex = buffer.indexOf('\n')
      if (newlineIndex >= 0) {
        const line = buffer.slice(0, newlineIndex).trim()
        buffer = buffer.slice(newlineIndex + 1)
        if (line.length > 0) {
          firstObject = JSON.parse(line)
          firstRead = true
        }
      }
    }
  }

  const streamPromise = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (value) buffer += value

        const lastNewline = buffer.lastIndexOf('\n')
        if (lastNewline >= 0) {
          const chunk = buffer.slice(0, lastNewline)
          buffer = buffer.slice(lastNewline + 1)
          const lines = chunk.split('\n').filter(Boolean)

          for (const line of lines) {
            try {
              onMessage(JSON.parse(line))
            } catch (e) {
              onError?.(`Invalid JSON line: ${line}`, e)
            }
          }
        }

        if (done) {
          break
        }
      }
    } catch (err) {
      onError?.('Stream processing error:', err)
    }
  })()

  await streamPromise

  return onMessage(firstObject)
}

// Helper to create a mock ReadableStream from chunks
function createMockStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0

  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index]!))
        index++
      } else {
        controller.close()
      }
    },
  })
}

// Helper to create a mock Response
function createMockResponse(chunks: string[]): Response {
  return {
    body: createMockStream(chunks),
  } as unknown as Response
}

// We need to test the processServerFnResponse function directly
// Since it's not exported, we'll extract and test the logic

/**
 * Simulates the NDJSON stream processing logic from serverFnFetcher.ts
 * This is the fixed version that properly handles buffer boundaries.
 */
async function processServerFnResponse({
  response,
  onMessage,
  onError,
}: {
  response: Response
  onMessage: (msg: any) => any
  onError?: (msg: string, error?: any) => void
}) {
  if (!response.body) {
    throw new Error('No response body')
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()

  let buffer = ''
  let firstRead = false
  let firstObject

  while (!firstRead) {
    const { value, done } = await reader.read()
    if (value) buffer += value

    if (buffer.length === 0 && done) {
      throw new Error('Stream ended before first object')
    }

    // Wait for at least one complete line (ending with newline)
    const newlineIndex = buffer.indexOf('\n')
    if (newlineIndex >= 0) {
      const line = buffer.slice(0, newlineIndex).trim()
      buffer = buffer.slice(newlineIndex + 1)
      if (line.length > 0) {
        firstObject = JSON.parse(line)
        firstRead = true
      }
    }
  }

  // process rest of the stream asynchronously
  const streamPromise = (async () => {
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (value) buffer += value

        const lastNewline = buffer.lastIndexOf('\n')
        if (lastNewline >= 0) {
          const chunk = buffer.slice(0, lastNewline)
          buffer = buffer.slice(lastNewline + 1)
          const lines = chunk.split('\n').filter(Boolean)

          for (const line of lines) {
            try {
              onMessage(JSON.parse(line))
            } catch (e) {
              onError?.(`Invalid JSON line: ${line}`, e)
            }
          }
        }

        if (done) {
          break
        }
      }
    } catch (err) {
      onError?.('Stream processing error:', err)
    }
  })()

  // For testing, we wait for the stream to complete
  await streamPromise

  return onMessage(firstObject)
}

describe('processServerFnResponse', () => {
  it('should parse a single JSON line', async () => {
    const response = createMockResponse(['{"foo":"bar"}\n'])
    const onMessage = vi.fn((msg) => msg)

    const result = await processServerFnResponse({ response, onMessage })

    expect(result).toEqual({ foo: 'bar' })
    expect(onMessage).toHaveBeenCalledTimes(1)
  })

  it('should parse multiple JSON lines in a single chunk', async () => {
    const response = createMockResponse([
      '{"id":1}\n{"id":2}\n{"id":3}\n',
    ])
    const onMessage = vi.fn((msg) => msg)

    await processServerFnResponse({ response, onMessage })

    // First object is returned via onMessage at the end
    // Other objects are processed in the async stream processor
    expect(onMessage).toHaveBeenCalledTimes(3)
    expect(onMessage).toHaveBeenCalledWith({ id: 1 })
    expect(onMessage).toHaveBeenCalledWith({ id: 2 })
    expect(onMessage).toHaveBeenCalledWith({ id: 3 })
  })

  it('should handle JSON split across multiple chunks', async () => {
    const response = createMockResponse([
      '{"id":1}\n{"id":',
      '2}\n',
    ])
    const onMessage = vi.fn((msg) => msg)

    await processServerFnResponse({ response, onMessage })

    expect(onMessage).toHaveBeenCalledTimes(2)
    expect(onMessage).toHaveBeenCalledWith({ id: 1 })
    expect(onMessage).toHaveBeenCalledWith({ id: 2 })
  })

  it('should handle multiple complete lines followed by more chunks', async () => {
    // This is the bug case: first chunk has multiple lines ending with newline,
    // then more chunks arrive
    const response = createMockResponse([
      '{"id":1}\n{"id":2}\n',  // Two complete lines
      '{"id":3}\n',            // Third line arrives later
    ])
    const onMessage = vi.fn((msg) => msg)
    const onError = vi.fn()

    await processServerFnResponse({ response, onMessage, onError })

    // Should NOT have any errors
    expect(onError).not.toHaveBeenCalled()

    // Should have parsed all 3 objects
    expect(onMessage).toHaveBeenCalledTimes(3)
    expect(onMessage).toHaveBeenCalledWith({ id: 1 })
    expect(onMessage).toHaveBeenCalledWith({ id: 2 })
    expect(onMessage).toHaveBeenCalledWith({ id: 3 })
  })

  it('should handle the original bug scenario: buffer ending with newline then more data', async () => {
    // Simulates the exact bug: 
    // 1. First chunk: '{"type":"policy"}\n{"type":"invoice"}\n'
    // 2. Second chunk: '{"type":"client"}\n'
    // The bug was that after extracting first line, remaining buffer became
    // '{"type":"invoice"}' (missing trailing \n), so when next chunk arrived
    // it became '{"type":"invoice"}{"type":"client"}\n' - invalid JSON!
    const response = createMockResponse([
      '{"type":"policy","results":[]}\n{"type":"invoice","results":[]}\n',
      '{"type":"client","results":[]}\n',
    ])
    const onMessage = vi.fn((msg) => msg)
    const onError = vi.fn()

    await processServerFnResponse({ response, onMessage, onError })

    expect(onError).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledTimes(3)
    expect(onMessage).toHaveBeenCalledWith({ type: 'policy', results: [] })
    expect(onMessage).toHaveBeenCalledWith({ type: 'invoice', results: [] })
    expect(onMessage).toHaveBeenCalledWith({ type: 'client', results: [] })
  })

  it('should handle chunks that do not end with newline', async () => {
    const response = createMockResponse([
      '{"id":1}\n{"id":2}',  // Second line incomplete (no trailing newline)
      '\n{"id":3}\n',        // Completes second line, adds third
    ])
    const onMessage = vi.fn((msg) => msg)
    const onError = vi.fn()

    await processServerFnResponse({ response, onMessage, onError })

    expect(onError).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledTimes(3)
  })

  it('should handle empty lines gracefully', async () => {
    const response = createMockResponse([
      '{"id":1}\n\n{"id":2}\n',
    ])
    const onMessage = vi.fn((msg) => msg)
    const onError = vi.fn()

    await processServerFnResponse({ response, onMessage, onError })

    expect(onError).not.toHaveBeenCalled()
    expect(onMessage).toHaveBeenCalledTimes(2)
  })
})

describe('buggyProcessServerFnResponse (demonstrating the bug)', () => {
  it('FAILS with the original bug: buffer ending with newline loses separator', async () => {
    // This test demonstrates the bug in the original code
    const response = createMockResponse([
      '{"type":"policy","results":[]}\n{"type":"invoice","results":[]}\n',
      '{"type":"client","results":[]}\n',
    ])
    const onMessage = vi.fn((msg) => msg)
    const onError = vi.fn()

    await buggyProcessServerFnResponse({ response, onMessage, onError })

    // The buggy version WILL call onError because it concatenates
    // '{"type":"invoice","results":[]}' + '{"type":"client","results":[]}\n'
    // resulting in invalid JSON
    expect(onError).toHaveBeenCalled()
    expect(onError.mock.calls[0]?.[0]).toContain('Invalid JSON line')
  })
})
