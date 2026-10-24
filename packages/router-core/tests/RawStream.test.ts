import { describe, expect, it, vi } from 'vitest'
import {
  createStream,
  crossSerializeStream,
  getCrossReferenceHeader,
  toCrossJSONAsync,
  toCrossJSONStream,
  fromCrossJSON,
} from 'seroval'
import type { SerovalNode, Stream } from 'seroval'
import { RawStream } from '../src/ssr/serializer/RawStream'
import {
  RawStreamJSONDeserializePlugin,
  RawStreamJSONPlugin,
  createRawStreamJSONPlugin,
} from '../src/ssr/serializer/RawStreamJSONPlugin'
import {
  createRawStreamDeserializePlugin,
  createRawStreamRPCPlugin,
} from '../src/ssr/serializer/RawStreamRPCPlugin'
import { RawStreamSSRPlugin } from '../src/ssr/serializer/RawStreamSSRPlugin'
import {
  defaultSerovalDeserializerPlugins,
  defaultSerovalPlugins,
} from '../src/ssr/serializer/seroval-plugins'

type EncodedStream = Stream<string | undefined>
type RawStreamFactory = (stream: EncodedStream) => ReadableStream<Uint8Array>

function getRawStreamFactory(
  pluginIndex: number,
  emitted: boolean,
): RawStreamFactory {
  if (emitted) {
    const plugin = RawStreamSSRPlugin.extends![pluginIndex]!
    const source = (plugin.serialize as () => string)()
    return new Function(`return ${source}`)() as RawStreamFactory
  }

  return (stream) => {
    const textNode = {} as SerovalNode
    const streamNode = {} as SerovalNode
    return (RawStreamJSONDeserializePlugin.deserialize as any)(
      { text: textNode, stream: streamNode },
      {
        deserialize(node: SerovalNode) {
          return node === textNode ? pluginIndex === 1 : stream
        },
      },
    )
  }
}

/** Spies on `stream.on`; the returned mock forwards to the real disposer. */
function spyOnSubscription(stream: EncodedStream) {
  const on = stream.on.bind(stream)
  const unsubscribe = vi.fn<() => void>()
  vi.spyOn(stream, 'on').mockImplementation((listener) => {
    unsubscribe.mockImplementation(on(listener))
    return unsubscribe
  })
  return unsubscribe
}

describe('RawStream', () => {
  describe('RawStream class', () => {
    it('should wrap a ReadableStream<Uint8Array>', () => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      })
      const rawStream = new RawStream(stream)
      expect(rawStream.stream).toBe(stream)
    })

    it('should be an instance of RawStream', () => {
      const stream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(stream)
      expect(rawStream instanceof RawStream).toBe(true)
    })

    it('should default to binary hint', () => {
      const stream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(stream)
      expect(rawStream.hint).toBe('binary')
    })

    it('should accept binary hint option', () => {
      const stream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(stream, { hint: 'binary' })
      expect(rawStream.hint).toBe('binary')
    })

    it('should accept text hint option', () => {
      const stream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(stream, { hint: 'text' })
      expect(rawStream.hint).toBe('text')
    })
  })

  describe('createRawStreamRPCPlugin', () => {
    it('should call onRawStream callback with stream id and stream', () => {
      const collectedStreams = new Map<number, ReadableStream<Uint8Array>>()

      const plugin = createRawStreamRPCPlugin((id, stream) => {
        collectedStreams.set(id, stream)
      })

      const testStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      })

      const rawStream = new RawStream(testStream)

      toCrossJSONStream(rawStream, {
        refs: new Map(),
        plugins: [plugin],
        onParse() {},
      })

      expect(collectedStreams.size).toBe(1)
      // Stream ID is assigned by our internal counter (sequential starting at 1)
      const streamEntry = Array.from(collectedStreams.entries())[0]
      expect(streamEntry).toBeDefined()
      expect(streamEntry![1]).toBe(testStream)
    })

    it('should serialize with tss/RawStream tag', () => {
      const plugin = createRawStreamRPCPlugin(() => {})

      const testStream = new ReadableStream<Uint8Array>()
      const rawStream = new RawStream(testStream)

      const serialized = new Array<unknown>()
      toCrossJSONStream(rawStream, {
        refs: new Map(),
        plugins: [plugin],
        onParse(value) {
          serialized.push(value)
        },
      })

      // The serialized output should have the plugin tag and contain streamId
      const jsonStr = JSON.stringify(serialized)
      expect(jsonStr).toContain('tss/RawStream')
      expect(jsonStr).toContain('streamId')
    })

    it('should collect multiple streams with unique ids', () => {
      const collectedStreams = new Map<number, ReadableStream<Uint8Array>>()

      const plugin = createRawStreamRPCPlugin((id, stream) => {
        collectedStreams.set(id, stream)
      })

      const stream1 = new ReadableStream<Uint8Array>()
      const stream2 = new ReadableStream<Uint8Array>()

      const data = {
        first: new RawStream(stream1),
        second: new RawStream(stream2),
      }

      toCrossJSONStream(data, {
        refs: new Map(),
        plugins: [plugin],
        onParse() {},
      })

      expect(collectedStreams.size).toBe(2)
      const ids = Array.from(collectedStreams.keys())
      expect(ids[0]).not.toBe(ids[1])
    })
  })

  describe('round-trip serialization', () => {
    it('does not acquire the source reader when hint parsing fails', async () => {
      const getReader = vi.fn()
      const stream = { getReader } as unknown as ReadableStream<Uint8Array>
      const failure = new Error('hint parse failed')
      const parse = RawStreamJSONPlugin.parse.async! as any

      await expect(
        parse(new RawStream(stream), {
          parse: () => Promise.reject(failure),
        }),
      ).rejects.toBe(failure)
      expect(getReader).not.toHaveBeenCalled()
    })

    it('does not acquire the source reader when request serialization is already aborted', async () => {
      const getReader = vi.fn()
      const stream = { getReader } as unknown as ReadableStream<Uint8Array>
      const controller = new AbortController()
      const reason = new Error('request aborted')
      controller.abort(reason)

      await expect(
        toCrossJSONAsync(new RawStream(stream), {
          refs: new Map(),
          plugins: [createRawStreamJSONPlugin(controller.signal)],
        }),
      ).rejects.toMatchObject({ cause: reason })
      expect(getReader).not.toHaveBeenCalled()
    })

    it('preserves malformed UTF-8 and BOM bytes in text chunks', async () => {
      const cancel = vi.fn()
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.of(0x41, 0xe2))
          controller.enqueue(Uint8Array.of(0x28))
          controller.enqueue(Uint8Array.of(0xef, 0xbb, 0xbf, 0x42))
          controller.close()
        },
        cancel,
      })

      const serialized = await new Promise<Array<string>>((resolve, reject) => {
        const sources = new Array<string>()
        crossSerializeStream(new RawStream(stream, { hint: 'text' }), {
          refs: new Map(),
          plugins: [RawStreamSSRPlugin],
          scopeId: 'raw-stream-test',
          onSerialize(source) {
            sources.push(source)
          },
          onError: reject,
          onDone() {
            expect(stream.locked).toBe(false)
            resolve(sources)
          },
        })
      })

      const output = serialized.join(';')
      expect(output).toContain('QeI=')
      expect(output).toContain('\ufeffB')
      expect(cancel).not.toHaveBeenCalled()
      expect(stream.locked).toBe(false)
    })

    it('preserves a UTF-8 character split across text chunks', async () => {
      // Each half is invalid UTF-8 by itself. Text mode must encode both as
      // binary instead of retaining decoder state across chunk boundaries.
      const expected = [Uint8Array.of(0xf0, 0x9f), Uint8Array.of(0x98, 0x80)]
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const chunk of expected) {
            controller.enqueue(chunk)
          }
          controller.close()
        },
      })

      const serialized = await toCrossJSONAsync(
        new RawStream(input, { hint: 'text' }),
        {
          refs: new Map(),
          plugins: [RawStreamJSONPlugin],
        },
      )
      const output = fromCrossJSON(serialized, {
        refs: new Map(),
        plugins: [RawStreamJSONDeserializePlugin],
      }) as ReadableStream<Uint8Array>
      const reader = output.getReader()

      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: expected[0],
      })
      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: expected[1],
      })
      await expect(reader.read()).resolves.toEqual({
        done: true,
        value: undefined,
      })
    })

    it.each([
      ['default', 'binary', defaultSerovalDeserializerPlugins],
      ['default', 'text', defaultSerovalDeserializerPlugins],
      ['deserialize-only', 'binary', [RawStreamJSONDeserializePlugin]],
      ['deserialize-only', 'text', [RawStreamJSONDeserializePlugin]],
    ] as const)(
      'preserves every %s-plugin decoded %s-hinted chunk through async JSON',
      async (_, hint, deserializePlugins) => {
        const expected = [
          new Uint8Array(),
          Uint8Array.of(0x41, 0x42),
          Uint8Array.of(0x41, 0xe2),
          Uint8Array.of(0xef, 0xbb, 0xbf, 0x42),
        ]
        const input = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of expected) {
              controller.enqueue(chunk)
            }
            controller.close()
          },
        })

        const serialized = await toCrossJSONAsync(
          new RawStream(input, { hint }),
          {
            refs: new Map(),
            plugins: [RawStreamJSONPlugin],
          },
        )
        const output = fromCrossJSON(serialized, {
          refs: new Map(),
          plugins: [...deserializePlugins],
        }) as ReadableStream<Uint8Array>
        const reader = output.getReader()
        const actual: Array<Uint8Array> = []

        while (true) {
          const next = await reader.read()
          if (next.done) {
            break
          }
          actual.push(next.value)
        }

        expect(actual.map((chunk) => Array.from(chunk))).toEqual(
          expected.map((chunk) => Array.from(chunk)),
        )
      },
    )

    it('round-trips: client default plugins write, deserializer plugins read', async () => {
      const input = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(Uint8Array.of(1, 2, 3))
          controller.close()
        },
      })
      const serialized = await toCrossJSONAsync(
        { stream: new RawStream(input), error: new Error('boom') },
        { refs: new Map(), plugins: defaultSerovalPlugins },
      )
      const output = fromCrossJSON(serialized, {
        refs: new Map(),
        plugins: defaultSerovalDeserializerPlugins,
      }) as { stream: ReadableStream<Uint8Array>; error: Error }

      expect(output.error).toBeInstanceOf(Error)
      expect(output.error.message).toBe('boom')
      const reader = output.stream.getReader()
      await expect(reader.read()).resolves.toEqual({
        done: false,
        value: Uint8Array.of(1, 2, 3),
      })
      await expect(reader.read()).resolves.toMatchObject({ done: true })
    })

    it('should serialize and deserialize RawStream correctly', async () => {
      // Collect streams during serialization
      const collectedStreams = new Map<number, ReadableStream<Uint8Array>>()
      const rpcPlugin = createRawStreamRPCPlugin((id, stream) => {
        collectedStreams.set(id, stream)
      })

      const testStream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new Uint8Array([1, 2, 3]))
          controller.close()
        },
      })

      const data = {
        message: 'test',
        rawData: new RawStream(testStream),
      }

      // Serialize using RPC plugin
      const refs = new Map()
      let serialized: SerovalNode | undefined
      toCrossJSONStream(data, {
        refs,
        plugins: [rpcPlugin],
        onParse(value) {
          serialized = value
        },
      })

      // Verify we collected the stream
      expect(collectedStreams.size).toBe(1)
      const streamId = Array.from(collectedStreams.keys())[0]!

      // Create getOrCreateStream function
      const getOrCreateStream = (id: number) => {
        const stream = collectedStreams.get(id)
        if (!stream) {
          throw new Error(`Stream ${id} not found in collected streams`)
        }
        return stream
      }

      // Create deserialize plugin with function
      const deserializePlugin =
        createRawStreamDeserializePlugin(getOrCreateStream)

      // Deserialize
      const deserialized = fromCrossJSON(serialized!, {
        refs: new Map(),
        plugins: [deserializePlugin],
      }) as any

      expect(deserialized.message).toBe('test')
      expect(deserialized.rawData).toBe(testStream)
    })
  })

  describe('SSR stream lifecycle', () => {
    it.each(['chunk', 'eof', 'error'] as const)(
      'ignores a late %s read result after disposal',
      async (settlement) => {
        let resolveRead!: (result: ReadableStreamReadResult<Uint8Array>) => void
        let rejectRead!: (error: unknown) => void
        const readResult = new Promise<ReadableStreamReadResult<Uint8Array>>(
          (resolve, reject) => {
            resolveRead = resolve
            rejectRead = reject
          },
        )
        const reader = {
          read: vi.fn(() => readResult),
          cancel: vi.fn(() => Promise.resolve()),
          releaseLock: vi.fn(),
        }
        const readable = {
          getReader: () => reader,
        } as unknown as ReadableStream<Uint8Array>
        const sources = new Array<string>()
        const dispose = crossSerializeStream(new RawStream(readable), {
          refs: new Map(),
          plugins: [RawStreamSSRPlugin],
          scopeId: 'raw-stream-disposal-test',
          onSerialize(source) {
            sources.push(source)
          },
        })

        expect(reader.read).toHaveBeenCalledTimes(1)
        const sourceCount = sources.length
        dispose()
        dispose()
        expect(reader.cancel).toHaveBeenCalledTimes(1)
        expect(reader.releaseLock).toHaveBeenCalledTimes(1)

        if (settlement === 'error') {
          rejectRead(new Error('late read failure'))
        } else {
          resolveRead(
            settlement === 'eof'
              ? { done: true, value: undefined }
              : { done: false, value: Uint8Array.of(1) },
          )
        }
        await Promise.resolve()
        await Promise.resolve()

        expect(sources).toHaveLength(sourceCount)
        expect(reader.read).toHaveBeenCalledTimes(1)
        expect(reader.cancel).toHaveBeenCalledTimes(1)
        expect(reader.releaseLock).toHaveBeenCalledTimes(1)
      },
    )
  })

  describe.each([
    { hint: 'binary', pluginIndex: 0, encoded: 'QQ==' },
    { hint: 'text', pluginIndex: 1, encoded: 'tA' },
  ] as const)('$hint browser factory', ({ pluginIndex, encoded }) => {
    it.each([
      ['local', false],
      ['emitted', true],
    ] as const)(
      'unsubscribes the %s factory on cancellation',
      async (_, emitted) => {
        const stream = createStream<string | undefined>()
        const unsubscribe = spyOnSubscription(stream)
        const reader = getRawStreamFactory(
          pluginIndex,
          emitted,
        )(stream).getReader()

        expect(stream.on).toHaveBeenCalledOnce()
        stream.next(encoded)
        const chunk = await reader.read()
        expect(chunk.done).toBe(false)
        expect(Array.from(chunk.value!)).toEqual([65])

        await reader.cancel()
        await reader.cancel()
        expect(unsubscribe).toHaveBeenCalledOnce()
      },
    )

    it.each([
      ['local', false],
      ['emitted', true],
    ] as const)(
      'does not retain a synchronous terminal disposer in the %s factory',
      async (_, emitted) => {
        const stream = createStream<string | undefined>()
        stream.next(encoded)
        stream.return(undefined)
        const unsubscribe = spyOnSubscription(stream)
        const reader = getRawStreamFactory(
          pluginIndex,
          emitted,
        )(stream).getReader()

        expect(unsubscribe).toHaveBeenCalledTimes(emitted ? 0 : 1)
        await reader.cancel()
        expect(unsubscribe).toHaveBeenCalledTimes(emitted ? 0 : 1)
      },
    )

    it.each([false, true])(
      'disposes a malformed buffered JSON stream (ended: %s)',
      async (ended) => {
        const stream = createStream<string | undefined>()
        stream.next(pluginIndex === 1 ? 'b%' : '%')
        stream.next(encoded)
        if (ended) {
          stream.return(undefined)
        }
        const unsubscribe = spyOnSubscription(stream)

        const reader = getRawStreamFactory(
          pluginIndex,
          false,
        )(stream).getReader()

        expect(unsubscribe).toHaveBeenCalledOnce()
        await expect(reader.read()).rejects.toMatchObject({
          name: 'InvalidCharacterError',
        })
        stream.next(encoded)
        await expect(reader.cancel()).rejects.toMatchObject({
          name: 'InvalidCharacterError',
        })
        expect(unsubscribe).toHaveBeenCalledOnce()
        reader.releaseLock()
      },
    )

    it.each([
      ['local', false],
      ['emitted', true],
    ] as const)(
      'does not retain a live terminal disposer in the %s factory',
      async (_, emitted) => {
        const stream = createStream<string | undefined>()
        const unsubscribe = spyOnSubscription(stream)
        const reader = getRawStreamFactory(
          pluginIndex,
          emitted,
        )(stream).getReader()

        stream.next(encoded)
        stream.return(undefined)
        await reader.cancel()

        expect(unsubscribe).not.toHaveBeenCalled()
      },
    )
  })

  describe('SSR live stream', () => {
    const scopeId = 'raw-stream-ssr'

    /** Evaluates hydration sources the way inline scripts run in a browser. */
    function createBrowserScope() {
      const self: { $R?: Record<string, Array<any>> } = {}
      new Function('self', getCrossReferenceHeader(scopeId))(self)
      return {
        run: (source: string) =>
          new Function('self', '$R', `return ${source}`)(self, self.$R),
        refs: self.$R![scopeId]!,
      }
    }

    function serializeToBrowser(rawStream: RawStream) {
      const scope = createBrowserScope()
      return new Promise<{
        output: ReadableStream<Uint8Array>
        refs: Array<any>
      }>((resolve, reject) => {
        let output: ReadableStream<Uint8Array> | undefined
        crossSerializeStream(rawStream, {
          refs: new Map(),
          plugins: [RawStreamSSRPlugin],
          scopeId,
          onSerialize(source, initial) {
            const value = scope.run(source)
            if (initial) {
              output = value
            }
          },
          onError: reject,
          onDone() {
            resolve({ output: output!, refs: scope.refs })
          },
        })
      })
    }

    async function readAll(stream: ReadableStream<Uint8Array>) {
      const reader = stream.getReader()
      const chunks: Array<Array<number>> = []
      for (;;) {
        const next = await reader.read()
        if (next.done) {
          return chunks
        }
        chunks.push(Array.from(next.value))
      }
    }

    it.each(['binary', 'text'] as const)(
      'rebuilds a %s-hinted stream from the emitted hydration scripts',
      async (hint) => {
        const expected = [
          Uint8Array.of(0x41, 0x42),
          Uint8Array.of(0xe2, 0x28),
          new Uint8Array(),
        ]
        const source = new ReadableStream<Uint8Array>({
          start(controller) {
            for (const chunk of expected) {
              controller.enqueue(chunk)
            }
            controller.close()
          },
        })

        const { output, refs } = await serializeToBrowser(
          new RawStream(source, { hint }),
        )

        expect(await readAll(output)).toEqual(
          expected.map((chunk) => Array.from(chunk)),
        )
        expect(source.locked).toBe(false)
        // The browser receives a live Seroval stream: the factory is its only
        // subscriber, so nothing is kept for replay.
        const live = refs.find((ref) => ref?.__SEROVAL_STREAM__)
        expect(() => live.on({ next() {}, throw() {}, return() {} })).toThrow(
          'Stream consumed',
        )
      },
    )

    it('fails the rebuilt stream when the source read fails', async () => {
      const source = new ReadableStream<Uint8Array>({
        pull() {
          throw new Error('source failed')
        },
      })

      const { output } = await serializeToBrowser(new RawStream(source))

      await expect(output.getReader().read()).rejects.toMatchObject({
        message: 'source failed',
      })
      expect(source.locked).toBe(false)
    })

    it('reads the source only as fast as serialized records are accepted', async () => {
      const chunkCount = 8
      let pulls = 0
      const source = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (pulls++ < chunkCount) {
            controller.enqueue(Uint8Array.of(pulls))
          } else {
            controller.close()
          }
        },
      })
      let acceptFirst!: () => void
      const firstAccepted = new Promise<void>((resolve) => {
        acceptFirst = resolve
      })
      let records = 0

      const done = new Promise<void>((resolve, reject) => {
        crossSerializeStream(new RawStream(source), {
          refs: new Map(),
          plugins: [RawStreamSSRPlugin],
          scopeId,
          onSerialize(_, initial) {
            if (initial) {
              return undefined
            }
            records++
            return records === 1 ? firstAccepted : undefined
          },
          onError: reject,
          onDone: resolve,
        })
      })
      await new Promise((resolve) => setTimeout(resolve, 0))
      await new Promise((resolve) => setTimeout(resolve, 0))

      // The first chunk is still being accepted: the source has only refilled
      // its own one-chunk queue.
      expect(records).toBe(1)
      expect(pulls).toBe(2)

      acceptFirst()
      await done

      expect(records).toBe(chunkCount + 1)
      expect(pulls).toBe(chunkCount + 1)
      expect(source.locked).toBe(false)
    })

    it('forwards the dispose reason to the source', () => {
      const cancel = vi.fn()
      const source = new ReadableStream<Uint8Array>({
        pull: () => new Promise(() => {}),
        cancel,
      })
      const dispose = crossSerializeStream(new RawStream(source), {
        refs: new Map(),
        plugins: [RawStreamSSRPlugin],
        scopeId,
        onSerialize() {},
      })

      const reason = new Error('client went away')
      dispose(reason)

      expect(cancel).toHaveBeenCalledTimes(1)
      expect(cancel).toHaveBeenCalledWith(reason)
      expect(source.locked).toBe(false)
    })
  })
})
