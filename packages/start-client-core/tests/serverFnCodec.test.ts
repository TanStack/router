import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fromJSON, toCrossJSONAsync, toCrossJSONStream } from 'seroval'
import { createSerializationAdapter } from '@tanstack/router-core'
import { createSerovalPlugins } from '../src/createSerovalPlugins'
import { FRAME_HEADER_SIZE } from '../src/framed-protocol'
import { TSS_CONTENT_TYPE_FRAMED_VERSIONED } from '../src/framed-content-type'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

async function getCodec() {
  const codec = await import('../src/client-rpc/serverFnCodec')
  const { setPostProcessContext } =
    await import('../src/client-rpc/postProcessContext')
  return {
    serialize: codec.serialize,
    deserialize(
      response: Response,
      contentType: string,
      adapters: Parameters<typeof codec.deserialize>[2],
    ) {
      if (process.env.TSS_SERVER_FN_TRANSPORT !== 'lazy') {
        return codec.deserialize(response, contentType, adapters)
      }
      return codec.deserialize(
        response,
        contentType,
        adapters,
        contentType.includes('application/x-tss-framed'),
        setPostProcessContext,
      )
    },
  }
}

describe.each(['bundled', 'lazy'] as const)(
  '%s server function codec',
  (mode) => {
    afterEach(() => vi.unstubAllEnvs())
    beforeEach(() => {
      vi.stubEnv('TSS_SERVER_FN_TRANSPORT', mode)
      vi.resetModules()
    })

    it('preserves rich request and response values', async () => {
      const codec = await getCodec()
      const value = {
        date: new Date('2026-09-08'),
        map: new Map([['key', 123n]]),
        missing: undefined,
      }
      expect(
        fromJSON(JSON.parse(await codec.serialize(value, undefined)), {
          plugins: createSerovalPlugins(undefined),
        }),
      ).toEqual(value)
      const encoded = await toCrossJSONAsync(value, {
        plugins: createSerovalPlugins(undefined),
      })
      await expect(
        codec.deserialize(
          Response.json(encoded),
          'application/json',
          undefined,
        ),
      ).resolves.toEqual(value)
    })

    it('delivers the first framed value before its deferred promise', async () => {
      const codec = await getCodec()
      const later = deferred<string>()
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          toCrossJSONStream(
            { value: 'first', later: later.promise },
            {
              plugins: createSerovalPlugins(undefined),
              onParse(value) {
                const payload = new TextEncoder().encode(JSON.stringify(value))
                const frame = new Uint8Array(FRAME_HEADER_SIZE + payload.length)
                new DataView(frame.buffer).setUint32(5, payload.length, false)
                frame.set(payload, FRAME_HEADER_SIZE)
                controller.enqueue(frame)
              },
              onDone() {
                controller.close()
              },
              onError(error) {
                controller.error(error)
              },
            },
          )
        },
      })
      const result = await codec.deserialize(
        new Response(body),
        TSS_CONTENT_TYPE_FRAMED_VERSIONED,
        undefined,
      )
      expect(result.value).toBe('first')
      expect(result.later).toBeInstanceOf(Promise)
      later.resolve('second')
      await expect(result.later).resolves.toBe('second')
    })

    it('preserves custom adapters and waits for their post-processing', async () => {
      const codec = await getCodec()
      const context = await import('../src/client-rpc/postProcessContext')
      const { trackPostProcessPromise } = await import('../src/index')
      const gate = deferred<void>()
      class Value {
        ready = false
        constructor(public value: string) {}
      }
      const fromSerializable = vi.fn((value: string) => {
        const result = new Value(value)
        trackPostProcessPromise(
          gate.promise.then(() => {
            result.ready = true
          }),
        )
        return result
      })
      const adapter = createSerializationAdapter({
        key: 'test',
        test: (value): value is Value => value instanceof Value,
        toSerializable: (value) => value.value,
        fromSerializable,
      })
      const wire = await toCrossJSONAsync(
        { value: new Value('custom') },
        { plugins: createSerovalPlugins([adapter]) },
      )
      let ready = false
      const result = codec
        .deserialize(Response.json(wire), 'application/json', [adapter])
        .then((value) => {
          ready = true
          return value
        })
      await vi.waitFor(() => expect(fromSerializable).toHaveBeenCalledOnce())
      expect(context.getPostProcessContext()).toBeNull()
      expect(ready).toBe(false)
      gate.resolve()
      await expect(result).resolves.toEqual({
        value: { value: 'custom', ready: true },
      })
    })

    it('keeps concurrent adapter post-processing scoped to each response', async () => {
      const codec = await getCodec()
      const { trackPostProcessPromise } = await import('../src/index')
      const { getPostProcessContext } =
        await import('../src/client-rpc/postProcessContext')
      const gates = { first: deferred<void>(), second: deferred<void>() }
      class Value {
        ready = false
        constructor(public key: keyof typeof gates) {}
      }
      const decode = vi.fn((key: keyof typeof gates) => {
        const value = new Value(key)
        trackPostProcessPromise(
          gates[key].promise.then(() => {
            value.ready = true
          }),
        )
        return value
      })
      const adapter = createSerializationAdapter({
        key: 'concurrent',
        test: (value): value is Value => value instanceof Value,
        toSerializable: (value) => value.key,
        fromSerializable: decode,
      })
      const wire = await Promise.all(
        ['first', 'second'].map((key) =>
          toCrossJSONAsync(
            { value: new Value(key as keyof typeof gates) },
            { plugins: createSerovalPlugins([adapter]) },
          ),
        ),
      )
      let firstReady = false
      const first = codec
        .deserialize(Response.json(wire[0]), 'application/json', [adapter])
        .then((value) => {
          firstReady = true
          return value
        })
      const second = codec.deserialize(
        Response.json(wire[1]),
        'application/json',
        [adapter],
      )
      await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(2))
      expect(getPostProcessContext()).toBeNull()
      gates.second.resolve()
      await expect(second).resolves.toEqual({
        value: { key: 'second', ready: true },
      })
      expect(firstReady).toBe(false)
      gates.first.resolve()
      await expect(first).resolves.toEqual({
        value: { key: 'first', ready: true },
      })
    })

    it('keeps later framed post-processing independent across concurrent responses', async () => {
      const codec = await getCodec()
      const { trackPostProcessPromise } = await import('../src/index')
      const { getPostProcessContext } =
        await import('../src/client-rpc/postProcessContext')
      const gates = { a: deferred<void>(), b: deferred<void>() }
      const decoded: Array<string> = []
      class Value {
        constructor(public label: string) {}
      }
      const adapter = createSerializationAdapter({
        key: 'framed-context',
        test: (value): value is Value => value instanceof Value,
        toSerializable: (value) => value.label,
        fromSerializable: (label) => {
          decoded.push(label)
          const gate = gates[label as keyof typeof gates]
          if (gate) {
            trackPostProcessPromise(gate.promise)
          }
          return new Value(label)
        },
      })
      function response() {
        const later = deferred<Value>()
        const after = deferred<Value>()
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            toCrossJSONStream(
              { later: later.promise, after: after.promise },
              {
                plugins: createSerovalPlugins([adapter]),
                onParse(value) {
                  const payload = new TextEncoder().encode(
                    JSON.stringify(value),
                  )
                  const frame = new Uint8Array(
                    FRAME_HEADER_SIZE + payload.length,
                  )
                  new DataView(frame.buffer).setUint32(5, payload.length, false)
                  frame.set(payload, FRAME_HEADER_SIZE)
                  controller.enqueue(frame)
                },
                onDone() {
                  controller.close()
                },
                onError(error) {
                  controller.error(error)
                },
              },
            )
          },
        })
        return {
          later,
          after,
          result: codec.deserialize(
            new Response(stream),
            TSS_CONTENT_TYPE_FRAMED_VERSIONED,
            [adapter],
          ),
        }
      }
      const a = response()
      const b = response()
      const [first, second] = await Promise.all([a.result, b.result])
      a.later.resolve(new Value('a'))
      b.later.resolve(new Value('b'))
      await vi.waitFor(() => expect(decoded).toHaveLength(2))
      a.after.resolve(new Value('after-a'))
      b.after.resolve(new Value('after-b'))
      gates.b.resolve()
      await expect(second.after).resolves.toEqual(new Value('after-b'))
      expect(decoded).not.toContain('after-a')
      expect(getPostProcessContext()).toBeNull()
      gates.a.resolve()
      await expect(first.after).resolves.toEqual(new Value('after-a'))
      expect(getPostProcessContext()).toBeNull()
    })

    it('clears the public context when an adapter throws', async () => {
      const codec = await getCodec()
      const { getPostProcessContext } =
        await import('../src/client-rpc/postProcessContext')
      class Value {}
      const adapter = createSerializationAdapter({
        key: 'throwing',
        test: (value): value is Value => value instanceof Value,
        toSerializable: () => null,
        fromSerializable: () => {
          throw new Error('adapter failed')
        },
      })
      const wire = await toCrossJSONAsync(new Value(), {
        plugins: createSerovalPlugins([adapter]),
      })
      await expect(
        codec.deserialize(Response.json(wire), 'application/json', [adapter]),
      ).rejects.toThrow('adapter failed')
      expect(getPostProcessContext()).toBeNull()
    })

    it('rejects incompatible framed responses before consuming their body', async () => {
      const codec = await getCodec()
      await expect(
        codec.deserialize(
          new Response('invalid'),
          'application/x-tss-framed; v=999',
          undefined,
        ),
      ).rejects.toThrow('Incompatible framed protocol version')
    })

    it('propagates serialized errors', async () => {
      const codec = await getCodec()
      const wire = await toCrossJSONAsync(new Error('expected'), {
        plugins: createSerovalPlugins(undefined),
      })
      await expect(
        codec.deserialize(Response.json(wire), 'application/json', undefined),
      ).rejects.toThrow('expected')
    })
  },
)
